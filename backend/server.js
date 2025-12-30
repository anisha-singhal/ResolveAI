const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const cron = require('node-cron');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { Resend } = require('resend');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const { Pinecone } = require("@pinecone-database/pinecone");
const Groq = require("groq-sdk");

const app = express();
const PORT = 3001;

const SUPPORT_CATEGORIES = ["Shipping Inquiry", "Return Request", "Billing Question", "General Inquiry"];
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Simple disk storage for knowledge-base files
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

app.use(cors());
app.use(express.json());

let db;
let pineconeIndex;
let groq;
let imapConnectionHealthy = false;
// We now use Jina AI for embeddings instead of Gemini.

// --------- Email Configuration (Resend API - Cloud Resilient) ---------
// Uses RESEND_API_KEY for sending emails (works on Render free tier)
// Uses EMAIL_USER and EMAIL_PASS for IMAP only (reading emails)
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'; // Default Resend test sender

// Initialize Resend client
let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  console.log('📧 [EMAIL] Resend API client initialized');
} else {
  console.warn('⚠️  [EMAIL] RESEND_API_KEY not set - email sending will be disabled');
}

// Validate IMAP credentials for reading emails
function validateEmailCredentials() {
  console.log('\n📧 [EMAIL CONFIG] Validating email configuration...');
  
  // Check IMAP credentials (for reading emails)
  if (!EMAIL_USER) {
    console.error('   ❌ EMAIL_USER is not set - cannot read incoming emails');
    console.error('      Set EMAIL_USER to your Gmail address in Render Environment Variables');
    return false;
  }
  if (!EMAIL_PASS) {
    console.error('   ❌ EMAIL_PASS is not set - cannot read incoming emails');
    console.error('      Set EMAIL_PASS to your 16-character Google App Password');
    console.error('      Generate one at: https://myaccount.google.com/apppasswords');
    return false;
  }
  
  console.log(`   ✅ IMAP credentials configured for: ${EMAIL_USER}`);
  
  // Check Resend API (for sending emails)
  if (!RESEND_API_KEY) {
    console.warn('   ⚠️  RESEND_API_KEY is not set - email replies will be disabled');
    console.warn('      Sign up at https://resend.com and add RESEND_API_KEY to Render');
  } else {
    console.log(`   ✅ Resend API configured for sending from: ${RESEND_FROM_EMAIL}`);
  }
  
  return true;
}

// Cloud-resilient email sending using Resend API (uses HTTPS, not SMTP)
async function safeSendMail(mailOptions) {
  const { to, subject, text, html } = mailOptions;
  
  console.log(`📤 [EMAIL SEND] Attempting to send email...`);
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  
  if (!resend) {
    console.error('   ❌ [EMAIL SEND] Resend client not initialized - RESEND_API_KEY missing');
    return { ok: false, error: new Error('Email sending disabled - RESEND_API_KEY not configured') };
  }
  
  try {
    const result = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: to,
      subject: subject,
      text: text,
      html: html || undefined,
    });
    
    if (result.error) {
      console.error(`   ❌ [EMAIL SEND] Resend API error:`, result.error);
      return { ok: false, error: result.error };
    }
    
    console.log(`   ✅ [EMAIL SEND] Email sent successfully! ID: ${result.data?.id}`);
    return { ok: true, id: result.data?.id };
  } catch (err) {
    console.error(`   ❌ [EMAIL SEND] Exception:`, err.message);
    return { ok: false, error: err };
  }
}

// --------- Jina AI Embeddings helper ---------
async function getJinaEmbedding(text) {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error('JINA_API_KEY is not set');
  }

  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v4',
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jina embedding error ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data || !data.data || !data.data[0] || !Array.isArray(data.data[0].embedding)) {
    throw new Error('Unexpected Jina embedding response format');
  }
  return data.data[0].embedding;
}

// Resend uses HTTPS API - no SMTP verification needed
// Email configuration will be validated on startup in startServer()

// --------- Rate Limiting Helpers ---------
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Delay between processing emails (5 seconds for Free Tier safety)
const EMAIL_PROCESSING_DELAY_MS = 5000;

// --------- Email Gatekeeper ---------
// Filter out system/automated emails that shouldn't consume API quota
const SKIP_EMAIL_SENDERS = [
  'no-reply@accounts.google.com',
  'noreply@google.com',
  'no-reply@youtube.com',
  'noreply@medium.com',
  'no-reply@',
  'mailer-daemon@',
  'postmaster@',
];

const SKIP_EMAIL_SUBJECTS = [
  'security alert',
  'sign-in attempt',
  'new sign-in',
  'password reset',
  'verify your email',
  'confirm your email',
  'account verification',
  'two-factor authentication',
  '2-step verification',
  'suspicious activity',
];

function shouldSkipEmail(mail) {
  const senderEmail = mail.from?.value?.[0]?.address?.toLowerCase() || '';
  const senderText = mail.from?.text?.toLowerCase() || '';
  const subject = (mail.subject || '').toLowerCase();

  // Check sender against skip list
  for (const skipSender of SKIP_EMAIL_SENDERS) {
    if (senderEmail.includes(skipSender) || senderText.includes(skipSender)) {
      console.log(`   🚫 Skipping system email from: ${senderEmail}`);
      return true;
    }
  }

  // Check subject against skip list
  for (const skipSubject of SKIP_EMAIL_SUBJECTS) {
    if (subject.includes(skipSubject)) {
      console.log(`   🚫 Skipping system email with subject containing: "${skipSubject}"`);
      return true;
    }
  }

  return false;
}

// --------- Groq API with Retry Logic ---------
const MAX_GROQ_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000; // 5 seconds default (Groq has generous limits)

async function callGroqWithRetry(prompt, retryCount = 0) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an advanced AI support agent that analyzes customer emails and provides structured JSON responses."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: "json_object" }
    });
    
    return chatCompletion.choices[0]?.message?.content || '';
  } catch (error) {
    const errorMessage = error.message || '';
    const statusCode = error.status || error.code || '';

    // Check for rate limit errors
    if (statusCode === 429 || errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      if (retryCount >= MAX_GROQ_RETRIES) {
        console.error(`   ❌ Groq API: Max retries (${MAX_GROQ_RETRIES}) exceeded. Giving up.`);
        throw error;
      }

      // Try to extract retryDelay from error message
      let retryDelay = DEFAULT_RETRY_DELAY_MS;
      const retryMatch = errorMessage.match(/retry.?after[:\s]*(\d+)/i) ||
                         errorMessage.match(/(\d+)\s*seconds?/i);
      if (retryMatch) {
        retryDelay = parseInt(retryMatch[1], 10) * 1000; // Convert to ms
      }

      console.warn(`   ⏳ Groq rate limit. Waiting ${retryDelay / 1000}s before retry ${retryCount + 1}/${MAX_GROQ_RETRIES}...`);
      await sleep(retryDelay);

      return callGroqWithRetry(prompt, retryCount + 1);
    }

    // For non-rate-limit errors, throw immediately
    throw error;
  }
}

async function processProblem(problem){
  console.log("Processing problem with advanced triage:", problem);
  // Try to get embeddings with limited retries and exponential backoff.
  // If embeddings fail (quota/rate limit), fall back to doing the generative step without context.
  let embeddingVector = null;
  const maxEmbedRetries = 3;
  let embedDelay = 1000; // start with 1s
  for (let attempt = 1; attempt <= maxEmbedRetries; attempt++) {
    try {
      embeddingVector = await getJinaEmbedding(problem);
      break; // success
    } catch (e) {
      console.warn(`Jina embed attempt ${attempt} failed:`, e && e.message ? e.message : e);
      // If it's a rate limit, retry with backoff; otherwise break and fallback
      if (attempt < maxEmbedRetries) {
        console.log(`Embedding failed, retrying in ${embedDelay}ms...`);
        await sleep(embedDelay);
        embedDelay *= 2;
        continue;
      } else {
        console.log('Embedding failed and will be skipped for this request.');
        embeddingVector = null;
        break;
      }
    }
  }

  let context = '';
  if (embeddingVector && Array.isArray(embeddingVector)) {
    try {
      const queryVector = embeddingVector;
      const searchResults = await pineconeIndex.query({
        topK: 2,
        vector: queryVector,
        includeMetadata: true,
      });
      context = searchResults.matches.map(result => result.metadata.text).join("\n---\n");
    } catch (e) {
      console.warn('Failed to query Pinecone index for context, continuing without KB context:', e && e.message ? e.message : e);
      context = '';
    }
  } else {
    // No embeddings available (quota or other failure). We continue without KB context.
    context = '';
  }
  if (context) {
    console.log("✅ Retrieved KB context:", context.substring(0, 200) + (context.length > 200 ? '...' : ''));
  } else {
    console.log("⚠️  No KB context available for this query");
  }

  // Using Groq API with Llama 3.3 70B model (generous free tier)
  console.log(`📡 Using Groq model: llama-3.3-70b-versatile`);

  const prompt = `
    You are an advanced AI support agent. Your task is to perform a detailed triage of a user's email by following a step-by-step reasoning process.

    IMPORTANT INSTRUCTIONS:
    1. Analyze the user's email carefully for:
       - Number of distinct issues (multiple issues = lower confidence)
       - User sentiment (angry/frustrated = lower confidence, requires human touch)
       - Complexity of the problem
       - Whether you have enough context from the knowledge base to answer
    
    2. Classify the email into ONE of these categories: ${SUPPORT_CATEGORIES.join(", ")}.
       If multiple issues exist, choose the most critical one.
    
    3. Determine priority:
       - "Low": Simple questions, general inquiries
       - "Medium": Standard issues, single problem
       - "High": Multiple issues, billing disputes, angry customers, damaged items
    
    4. Rate your confidence (0.0 to 1.0):
       - Start at 0.9 for simple, single-issue cases
       - REDUCE by 0.2 for each additional issue detected
       - REDUCE by 0.2 if customer is angry/frustrated
       - REDUCE by 0.3 if you lack knowledge base context to properly answer
       - Minimum confidence should be 0.1
       - If confidence falls below 0.6, this MUST be reviewed by a human
    
    5. Generate a chain of thought that explains your reasoning:
       - What issues did you detect?
       - What is the user's sentiment?
       - Why did you assign this confidence score?
       - What concerns require human review?
    
    6. Generate a helpful solution ONLY if confidence >= 0.8. Otherwise, provide a brief acknowledgment.

    Knowledge Base Context:
    ---
    ${context || 'No relevant knowledge base entries found.'}
    ---
    
    User's Email: "${problem}"

    Provide your final analysis as a single JSON object with these keys:
    {
      "category": "one of the predefined categories",
      "priority": "Low", "Medium", or "High",
      "confidence": number between 0.0 and 1.0,
      "chain_of_thought": "detailed reasoning about issues detected, sentiment, and why this confidence score",
      "solution": "your proposed solution or acknowledgment"
    }
  `;

  // Use retry wrapper for rate limit handling
  const responseText = await callGroqWithRetry(prompt);
  const cleanedJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
  
  try {
      return JSON.parse(cleanedJson);
  } catch (e) {
      console.error("Failed to parse AI response as JSON:", cleanedJson);
      return { 
        category: "General Inquiry", 
        priority: "Medium", 
        confidence: 0.5, 
        chain_of_thought: "Failed to parse AI response - flagging for human review.",
        solution: "Could not process AI response. This ticket requires human review." 
      };
  }
}


// IMAP configuration using EMAIL_USER and EMAIL_PASS
const getEmailConfig = () => ({
  imap: {
    user: EMAIL_USER,
    password: EMAIL_PASS,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 15000,
    connTimeout: 30000
  }
});

// --------- IMAP Connection Verification ---------
async function verifyImapConnection() {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.error('❌ ResolveAI: EMAIL_USER or EMAIL_PASS not set in .env');
    imapConnectionHealthy = false;
    return false;
  }

  try {
    console.log(`[IMAP] Attempting connection for ${EMAIL_USER}...`);
    const connection = await imaps.connect(getEmailConfig());
    await connection.openBox('INBOX');
    connection.end();
    console.log('✅ ResolveAI: Service Account Connected');
    console.log(`   📧 Account: ${EMAIL_USER}`);
    console.log('   📬 IMAP listener is active and ready to receive emails');
    imapConnectionHealthy = true;
    return true;
  } catch (error) {
    imapConnectionHealthy = false;
    console.error('❌ ResolveAI: Failed to connect to Gmail IMAP server');

    if (error.message && error.message.includes('Invalid credentials')) {
      console.error('   🔑 Error: Invalid credentials');
      console.error('   Troubleshooting:');
      console.error('     1. Verify EMAIL_USER is your correct Gmail address');
      console.error('     2. Verify EMAIL_PASS is a 16-character Google App Password');
      console.error('     3. Generate App Password at: https://myaccount.google.com/apppasswords');
      console.error('     4. Ensure 2-Step Verification is enabled on your Google account');
    } else if (error.message && error.message.includes('AUTHENTICATIONFAILED')) {
      console.error('   🔑 Error: Authentication failed');
      console.error('   Possible causes:');
      console.error('     - App Password is incorrect or expired');
      console.error('     - App Password was revoked due to security alerts');
      console.error('     - App Password was generated for a different Google account');
      console.error('   Solution: Generate a new App Password at https://myaccount.google.com/apppasswords');
    } else {
      console.error('   🔌 Connection error:', error.message || error);
    }

    return false;
  }
}

// --------- Auto-Reconnect Logic ---------
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL_MS = 30000; // 30 seconds

async function attemptReconnect() {
  if (imapConnectionHealthy) {
    reconnectAttempts = 0;
    return;
  }

  reconnectAttempts++;
  console.log(`\n🔄 ResolveAI: Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);

  const success = await verifyImapConnection();

  if (success) {
    console.log('✅ ResolveAI: Reconnection successful! Email listener restored.');
    reconnectAttempts = 0;
  } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('❌ ResolveAI: Max reconnection attempts reached. IMAP listener disabled.');
    console.error('   Please check your credentials and restart the server.');
  }
}

// Schedule reconnection attempts every 30 seconds if connection is unhealthy
setInterval(() => {
  if (!imapConnectionHealthy && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    attemptReconnect();
  }
}, RECONNECT_INTERVAL_MS);

async function checkEmails() {
  if (!db || !pineconeIndex) {
    console.log("Database or vector store not ready, skipping email check.");
    return;
  }

  if (!imapConnectionHealthy) {
    console.log("[IMAP] Connection unhealthy, skipping email check. Reconnect will be attempted.");
    return;
  }

  let connection;
  try {
    console.log(`\n[${new Date().toISOString()}] Checking for new emails...`);
    connection = await imaps.connect(getEmailConfig());
    await connection.openBox('INBOX');
    const searchResults = await connection.search(['UNSEEN'], { bodies: [''] });

    if (searchResults.length === 0) {
      console.log("No new emails found.");
      connection.end();
      return;
    }
    console.log(`Found ${searchResults.length} new email(s). Processing sequentially...`);

    // SEQUENTIAL PROCESSING: Process one email at a time with delays
    // Using for...of instead of Promise.all to avoid hitting rate limits
    let processedCount = 0;
    let skippedCount = 0;

    for (const item of searchResults) {
      const uid = item.attributes.uid;
      const all = item.parts.find(part => part.which === "");
      const mail = await simpleParser(all.body);

      console.log('\n--- PROCESSING EMAIL ---');
      console.log('From:', mail.from?.text || 'Unknown');
      console.log('Subject:', mail.subject || '(no subject)');

      // EMAIL GATEKEEPER: Skip system/automated emails to save API quota
      if (shouldSkipEmail(mail)) {
        // Mark as read but don't process with AI
        await connection.addFlags(uid, ['\\Seen']);
        console.log(`   ✅ Marked as read (skipped AI processing)`);
        skippedCount++;
        continue;
      }

      try {
        // Process with AI triage
        const triageResult = await processProblem(mail.text || mail.subject || '');
        console.log('AI Triage Result:', triageResult);

        let autoReplySent = false;
        let emailStatus = 'pending'; // Track email send status for graceful fallback
        
        if (triageResult.confidence > 0.8) {
          console.log(`📊 [AUTO-RESOLVE] Confidence (${triageResult.confidence}) > 0.8. Attempting automatic reply...`);

          const recipientEmail = mail.from.value[0].address;
          const mailOptions = {
              to: recipientEmail,
              subject: mail.subject ? `Re: ${mail.subject}` : 'Re: Your recent inquiry',
              text: triageResult.solution,
          };

          console.log(`📧 [AUTO-REPLY] Sending to: ${recipientEmail}`);
          const sendResult = await safeSendMail(mailOptions);
          
          if (sendResult.ok) {
            console.log(`   ✅ [AUTO-REPLY] Email sent successfully to ${recipientEmail}`);
            autoReplySent = true;
            emailStatus = 'sent';
          } else {
            console.error(`   ❌ [AUTO-REPLY] Failed to send email: ${sendResult.error?.message || 'Unknown error'}`);
            emailStatus = 'failed';
            // GRACEFUL FALLBACK: Ticket will still be saved with failed status
          }
        } else {
          console.log(`📋 [HUMAN REVIEW] Confidence (${triageResult.confidence}) <= 0.8. Flagging for human review.`);
          emailStatus = 'needs_review';
        }

        // GRACEFUL FALLBACK: Always save ticket to database, even if email fails
        // Include email status in solution field for visibility
        const solutionWithStatus = emailStatus === 'failed' 
          ? `[EMAIL FAILED TO SEND]\n\n${triageResult.solution}` 
          : triageResult.solution;
        
        await db.run(
          'INSERT INTO tickets (sender, subject, body, category, priority, confidence, solution, chain_of_thought, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [mail.from?.text || 'Unknown', mail.subject, mail.text, triageResult.category, triageResult.priority, triageResult.confidence, solutionWithStatus, triageResult.chain_of_thought || null, autoReplySent ? 1 : 0]
        );
        
        console.log(`💾 [DATABASE] Ticket saved (status: ${emailStatus}, auto-resolved: ${autoReplySent})`);
        processedCount++;

      } catch (aiError) {
        // If AI processing fails (e.g., quota exhausted), save ticket without AI triage
        console.error('   ❌ AI processing failed:', aiError.message);
        console.log('   📝 Saving ticket for manual review...');

        await db.run(
          'INSERT INTO tickets (sender, subject, body, category, priority, confidence, solution, chain_of_thought) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [mail.from?.text || 'Unknown', mail.subject, mail.text, 'General Inquiry', 'Medium', 0.0, 'AI processing failed - requires manual review', 'Error: ' + aiError.message]
        );
        processedCount++;
      }

      await connection.addFlags(uid, ['\\Seen']);
      console.log(`- Marked email ${uid} as read.`);

      // FREE TIER DELAY: Wait 5 seconds between emails to stay under RPM limit
      // Only delay if there are more emails to process
      const currentIndex = searchResults.indexOf(item);
      if (currentIndex < searchResults.length - 1) {
        console.log(`\n⏳ Waiting ${EMAIL_PROCESSING_DELAY_MS / 1000}s before next email (Free Tier rate limit protection)...`);
        await sleep(EMAIL_PROCESSING_DELAY_MS);
      }
    }

    console.log(`\n📊 Email processing complete: ${processedCount} processed, ${skippedCount} skipped (system emails)`);
    connection.end();
  } catch (error) {
    console.error("Error checking emails:", error);

    // Mark connection as unhealthy to trigger reconnect
    if (error.message && (
      error.message.includes('Invalid credentials') ||
      error.message.includes('AUTHENTICATIONFAILED') ||
      error.message.includes('connection') ||
      error.message.includes('timeout')
    )) {
      console.error('[IMAP] Connection dropped. Will attempt reconnect in 30 seconds.');
      imapConnectionHealthy = false;
    }

    // Ensure connection is closed on error
    if (connection) {
      try {
        connection.end();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

// --------- Helper functions ---------
function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function parseSender(senderText) {
  if (!senderText) return { name: null, email: null };
  const match = senderText.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: null, email: senderText.trim() };
}

function mapTicketRow(row) {
  const { name, email } = parseSender(row.sender);
  const confidencePercent = row.confidence != null ? Math.round(row.confidence * 100) : null;
  
  // Status logic:
  // - 'resolved' if manually verified (is_verified = 1)
  // - 'resolved' if auto-resolved (confidence >= 80 AND is_verified = 1)
  // - 'pending' if needs review (confidence < 80 OR not verified)
  const status = row.is_verified === 1 ? 'resolved' : 'pending';
  const ticketNumber = `TKT-${String(row.id).padStart(5, '0')}`;

  return {
    ...row,
    ticket_number: ticketNumber,
    status,
    customer_name: name || email || row.sender,
    customer_email: email || row.sender,
    message: row.body,
    confidence: confidencePercent,
    chain_of_thought: row.chain_of_thought || null,
    proposed_reply: row.proposed_reply || row.solution || '',
    sender_email: email || row.sender,
    ai_category: row.category,
    ai_priority: row.priority,
    ai_confidence_score: row.confidence,
    ai_generated_reply: row.solution,
    original_message: row.body,
    received_at: row.created_at,
  };
}

// Middleware to check if user is admin
async function adminMiddleware(req, res, next) {
  // First run authMiddleware logic
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT id, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }
  const token = auth.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// --------- Auth endpoints ---------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email and password are required.' });
    }
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ detail: 'Invalid email or password.' });
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ detail: 'Invalid email or password.' });
    }
    const token = createToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error in /api/auth/login:', error);
    res.status(500).json({ detail: 'Failed to login.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// --------- Ticket + triage endpoints ---------
app.get('/api/tickets', authMiddleware, async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    
    // Optional filters
    const status = req.query.status; // 'pending', 'resolved'
    const priority = req.query.priority; // 'Low', 'Medium', 'High'
    const category = req.query.category;
    
    // Build query with filters
    let whereClause = '';
    const params = [];
    const conditions = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (priority) {
      conditions.push('priority = ?');
      params.push(priority);
    }
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    // Get total count for pagination
    const countRow = await db.get(`SELECT COUNT(*) as total FROM tickets ${whereClause}`, params);
    const total = countRow.total;
    
    // Get paginated results
    const rows = await db.all(
      `SELECT * FROM tickets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const tickets = rows.map(mapTicketRow);
    
    res.json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets.' });
  }
});

app.get('/api/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }
    res.json(mapTicketRow(row));
  } catch (error) {
    console.error('Error fetching ticket by id:', error);
    res.status(500).json({ error: 'Failed to fetch ticket.' });
  }
});

app.post('/api/tickets/:id/verify', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; 
    const { category, priority } = req.body; 

    if (!category || !priority) {
      return res.status(400).json({ error: 'Category and priority are required.' });
    }

    const result = await db.run(
      'UPDATE tickets SET category = ?, priority = ?, is_verified = 1 WHERE id = ?',
      [category, priority, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    console.log(`Ticket ${id} verified/corrected by user.`);
    res.status(200).json({ message: 'Ticket verification successful.' });

  } catch (error) {
    console.error('Error verifying ticket:', error);
    res.status(500).json({ error: 'Failed to verify ticket.' });
  }
});

// Resolve without saving to KB
app.post('/api/tickets/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Reply message is required.' });
    }

    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    // Parse sender to get email
    const { email } = parseSender(ticket.sender);
    const recipientEmail = email || ticket.sender;

    console.log(`📧 [RESOLVE] Sending reply to ticket ${id}...`);
    
    // Send email reply via Resend API
    const mailOptions = {
      to: recipientEmail,
      subject: ticket.subject ? `Re: ${ticket.subject}` : 'Re: Your support request',
      text: message,
    };

    const sendResult = await safeSendMail(mailOptions);
    
    let emailStatus = 'sent';
    if (sendResult.ok) {
      console.log(`   ✅ [RESOLVE] Email sent successfully to ${recipientEmail}`);
    } else {
      console.error(`   ❌ [RESOLVE] Email failed: ${sendResult.error?.message || 'Unknown error'}`);
      emailStatus = 'failed';
      // GRACEFUL FALLBACK: Still mark ticket as resolved, but note email failure
    }

    // Update ticket - mark as resolved even if email failed
    const solutionWithStatus = emailStatus === 'failed' 
      ? `[EMAIL FAILED TO SEND]\n\n${message}` 
      : message;
    
    await db.run(
      'UPDATE tickets SET solution = ?, is_verified = 1 WHERE id = ?',
      [solutionWithStatus, id]
    );

    console.log(`   💾 [RESOLVE] Ticket ${id} marked as resolved (email: ${emailStatus})`);
    res.status(200).json({ message: `Ticket resolved (email: ${emailStatus})` });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    res.status(500).json({ error: 'Failed to resolve ticket.' });
  }
});

// Resolve and save to knowledge base
app.post('/api/tickets/:id/resolve-and-save', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Reply message is required.' });
    }

    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    // Parse sender to get email
    const { email } = parseSender(ticket.sender);
    const recipientEmail = email || ticket.sender;

    console.log(`📧 [RESOLVE+KB] Sending reply and saving to KB for ticket ${id}...`);
    
    // Send email reply via Resend API
    const mailOptions = {
      to: recipientEmail,
      subject: ticket.subject ? `Re: ${ticket.subject}` : 'Re: Your support request',
      text: message,
    };

    const sendResult = await safeSendMail(mailOptions);
    
    let emailStatus = 'sent';
    if (sendResult.ok) {
      console.log(`   ✅ [RESOLVE+KB] Email sent successfully to ${recipientEmail}`);
    } else {
      console.error(`   ❌ [RESOLVE+KB] Email failed: ${sendResult.error?.message || 'Unknown error'}`);
      emailStatus = 'failed';
      // GRACEFUL FALLBACK: Still save to KB, but note email failure
    }

    // Update ticket in database
    const solutionWithStatus = emailStatus === 'failed' 
      ? `[EMAIL FAILED TO SEND]\n\n${message}` 
      : message;
    
    await db.run(
      'UPDATE tickets SET solution = ?, is_verified = 1 WHERE id = ?',
      [solutionWithStatus, id]
    );

    // Save to knowledge base (SQLite)
    const summary = ticket.subject || `Ticket ${id}`;
    await db.run(
      'INSERT INTO knowledge_entries (ticket_id, issue_summary, resolution, category) VALUES (?, ?, ?, ?)',
      [id, summary, message, ticket.category]
    );

    const kbText = `${summary}\n\n${message}`;
    try {
      const embeddingVector = await getJinaEmbedding(kbText);
      if (embeddingVector && Array.isArray(embeddingVector)) {
        // Pinecone SDK expects a flat array of vector objects
        await pineconeIndex.upsert([
          {
            id: `kb-${id}-${Date.now()}`,
            values: embeddingVector,
            metadata: {
              text: kbText,
              ticket_id: id,
              category: ticket.category || null,
            },
          },
        ]);
        console.log('Saved KB entry to Pinecone vector index for future triage.');
      }
    } catch (e) {
      console.warn('Failed to upsert KB entry into Pinecone (continuing anyway):', e && e.message ? e.message : e);
    }

    res.status(200).json({ message: 'Ticket resolved, email sent, and saved to knowledge base.' });
  } catch (error) {
    console.error('Error resolving ticket and saving to KB:', error);
    res.status(500).json({ error: 'Failed to resolve and save ticket.' });
  }
});

// --------- KB Request Approval Workflow ---------

// Agent requests to save a ticket resolution to KB
app.post('/api/kb-requests', authMiddleware, async (req, res) => {
  try {
    const { ticket_id, proposed_summary, proposed_resolution } = req.body;
    
    if (!ticket_id || !proposed_resolution) {
      return res.status(400).json({ error: 'ticket_id and proposed_resolution are required' });
    }
    
    // Check if ticket exists
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [ticket_id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Check if there's already a pending request for this ticket
    const existingRequest = await db.get(
      'SELECT * FROM kb_requests WHERE ticket_id = ? AND status = ?',
      [ticket_id, 'pending']
    );
    if (existingRequest) {
      return res.status(400).json({ error: 'A pending KB request already exists for this ticket' });
    }
    
    const result = await db.run(
      `INSERT INTO kb_requests (ticket_id, requested_by, proposed_summary, proposed_resolution) 
       VALUES (?, ?, ?, ?)`,
      [ticket_id, req.user.id, proposed_summary || ticket.subject, proposed_resolution]
    );
    
    console.log(`📝 KB request created by user ${req.user.id} for ticket ${ticket_id}`);
    
    res.status(201).json({ 
      id: result.lastID, 
      message: 'KB save request submitted for admin approval' 
    });
  } catch (error) {
    console.error('Error creating KB request:', error);
    res.status(500).json({ error: 'Failed to create KB request' });
  }
});

// Admin: List all KB requests
app.get('/api/kb-requests', adminMiddleware, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    
    const requests = await db.all(`
      SELECT 
        kr.*,
        t.subject as ticket_subject,
        t.sender as ticket_sender,
        t.category as ticket_category,
        u.name as requested_by_name,
        u.email as requested_by_email
      FROM kb_requests kr
      LEFT JOIN tickets t ON kr.ticket_id = t.id
      LEFT JOIN users u ON kr.requested_by = u.id
      WHERE kr.status = ?
      ORDER BY kr.created_at DESC
    `, [status]);
    
    res.json(requests);
  } catch (error) {
    console.error('Error fetching KB requests:', error);
    res.status(500).json({ error: 'Failed to fetch KB requests' });
  }
});

// Admin: Get count of pending KB requests (for badge)
app.get('/api/kb-requests/count', adminMiddleware, async (req, res) => {
  try {
    const row = await db.get('SELECT COUNT(*) as count FROM kb_requests WHERE status = ?', ['pending']);
    res.json({ count: row.count });
  } catch (error) {
    console.error('Error counting KB requests:', error);
    res.status(500).json({ error: 'Failed to count KB requests' });
  }
});

// Admin: Approve KB request
app.post('/api/kb-requests/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { review_note } = req.body;
    
    const request = await db.get('SELECT * FROM kb_requests WHERE id = ?', [id]);
    if (!request) {
      return res.status(404).json({ error: 'KB request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been reviewed' });
    }
    
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [request.ticket_id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Associated ticket not found' });
    }
    
    // Update request status
    await db.run(
      `UPDATE kb_requests SET status = 'approved', reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.user.id, review_note || null, id]
    );
    
    // Save to knowledge base (SQLite)
    await db.run(
      'INSERT INTO knowledge_entries (ticket_id, issue_summary, resolution, category) VALUES (?, ?, ?, ?)',
      [request.ticket_id, request.proposed_summary, request.proposed_resolution, ticket.category]
    );
    
    // Save to Pinecone for RAG
    const kbText = `${request.proposed_summary}\n\n${request.proposed_resolution}`;
    try {
      const embeddingVector = await getJinaEmbedding(kbText);
      if (embeddingVector && Array.isArray(embeddingVector)) {
        await pineconeIndex.upsert([
          {
            id: `kb-${request.ticket_id}-${Date.now()}`,
            values: embeddingVector,
            metadata: {
              text: kbText,
              ticket_id: request.ticket_id,
              category: ticket.category || null,
            },
          },
        ]);
        console.log('✅ Approved KB entry saved to Pinecone');
      }
    } catch (e) {
      console.warn('Failed to upsert KB entry into Pinecone:', e.message);
    }
    
    console.log(`✅ KB request ${id} approved by admin ${req.user.id}`);
    res.json({ message: 'KB request approved and saved to knowledge base' });
  } catch (error) {
    console.error('Error approving KB request:', error);
    res.status(500).json({ error: 'Failed to approve KB request' });
  }
});

// Admin: Reject KB request
app.post('/api/kb-requests/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { review_note } = req.body;
    
    const request = await db.get('SELECT * FROM kb_requests WHERE id = ?', [id]);
    if (!request) {
      return res.status(404).json({ error: 'KB request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been reviewed' });
    }
    
    await db.run(
      `UPDATE kb_requests SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.user.id, review_note || null, id]
    );
    
    console.log(`❌ KB request ${id} rejected by admin ${req.user.id}`);
    res.json({ message: 'KB request rejected' });
  } catch (error) {
    console.error('Error rejecting KB request:', error);
    res.status(500).json({ error: 'Failed to reject KB request' });
  }
});

// Manual triage endpoint used by earlier UI
app.post('/api/triage', authMiddleware, async (req, res) => {
  try {
    const { problem } = req.body;
    if (!problem) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }
    const triageResult = await processProblem(problem);
    res.json(triageResult);
  } catch (error) {
    console.error('Error in RAG pipeline:', error);
    res.status(500).json({ error: 'Failed to get a response from the AI.' });
  }
});

// Manual trigger for email checking (Admin only)
app.post('/api/check-emails', adminMiddleware, async (req, res) => {
  try {
    console.log('📧 Manual email check triggered via API...');
    await checkEmails();
    res.json({ success: true, message: 'Email check completed' });
  } catch (error) {
    console.error('Manual email check failed:', error);
    res.status(500).json({ error: 'Email check failed', details: error.message });
  }
});

// Analytics for dashboard
app.get('/api/analytics', adminMiddleware, async (req, res) => {
  try {
    const totalRow = await db.get('SELECT COUNT(*) as c FROM tickets');
    const resolvedRow = await db.get('SELECT COUNT(*) as c FROM tickets WHERE is_verified = 1');
    const pendingRow = await db.get('SELECT COUNT(*) as c FROM tickets WHERE is_verified = 0');
    const lowConfRow = await db.get('SELECT COUNT(*) as c FROM tickets WHERE confidence < 0.8');
    const highConfRow = await db.get('SELECT COUNT(*) as c FROM tickets WHERE confidence >= 0.8');
    const avgRow = await db.get('SELECT AVG(confidence) as avg_conf FROM tickets');

    const total = totalRow.c || 0;
    const resolved = resolvedRow.c || 0;
    const pending = pendingRow.c || 0;
    const resolutionRate = total === 0 ? 0 : Math.round((resolved / total) * 100);
    const avgConfidence = avgRow.avg_conf != null ? Math.round(avgRow.avg_conf * 100) : 0;

    res.json({
      total_tickets: total,
      pending_tickets: pending,
      resolved_tickets: resolved,
      resolution_rate: resolutionRate,
      low_confidence_tickets: lowConfRow.c || 0,
      high_confidence_tickets: highConfRow.c || 0,
      avg_confidence: avgConfidence,
    });
  } catch (error) {
    console.error('Error computing analytics:', error);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

// Admin: Add ticket to KB without re-sending email (for already resolved tickets)
app.post('/api/knowledge-base/add', adminMiddleware, async (req, res) => {
  try {
    const { ticket_id, summary, resolution } = req.body;
    
    if (!ticket_id || !resolution) {
      return res.status(400).json({ error: 'ticket_id and resolution are required' });
    }
    
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [ticket_id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Save to knowledge base (SQLite)
    await db.run(
      'INSERT INTO knowledge_entries (ticket_id, issue_summary, resolution, category) VALUES (?, ?, ?, ?)',
      [ticket_id, summary || ticket.subject, resolution, ticket.category]
    );
    
    // Save to Pinecone for RAG
    const kbText = `${summary || ticket.subject}\n\n${resolution}`;
    try {
      const embeddingVector = await getJinaEmbedding(kbText);
      if (embeddingVector && Array.isArray(embeddingVector)) {
        await pineconeIndex.upsert([
          {
            id: `kb-${ticket_id}-${Date.now()}`,
            values: embeddingVector,
            metadata: {
              text: kbText,
              ticket_id: ticket_id,
              category: ticket.category || null,
            },
          },
        ]);
        console.log('✅ KB entry saved to Pinecone');
      }
    } catch (e) {
      console.warn('Failed to upsert KB entry into Pinecone:', e.message);
    }
    
    res.json({ message: 'Added to knowledge base successfully' });
  } catch (error) {
    console.error('Error adding to KB:', error);
    res.status(500).json({ error: 'Failed to add to knowledge base' });
  }
});

// Knowledge base entries (resolved tickets)
// Knowledge base entries - readable by all authenticated users
app.get('/api/knowledge-base', authMiddleware, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM knowledge_entries ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching knowledge base entries:', error);
    res.status(500).json({ error: 'Failed to load knowledge base.' });
  }
});

// File metadata list
// KB files list - readable by all authenticated users
app.get('/api/knowledge-base/files', authMiddleware, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM kb_files ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching KB files:', error);
    res.status(500).json({ error: 'Failed to load files.' });
  }
});

// File upload (Admin only) - Also indexes to Pinecone for AI retrieval
app.post('/api/knowledge-base/files', adminMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required.' });
    }

    const description = req.body.description || null;
    const { originalname, filename, mimetype, size } = req.file;
    const fullPath = path.join(uploadDir, filename);

    // Save to SQLite
    const result = await db.run(
      'INSERT INTO kb_files (filename, stored_filename, file_type, file_size, description) VALUES (?, ?, ?, ?, ?)',
      [originalname, filename, mimetype, size, description]
    );

    const fileId = result.lastID;
    let indexedToPinecone = false;

    // Index text-based files to Pinecone for AI retrieval
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    const isTextFile = textTypes.includes(mimetype) || originalname.endsWith('.txt') || originalname.endsWith('.md');

    if (isTextFile) {
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        if (fileContent.trim()) {
          console.log(`📄 Indexing uploaded file to Pinecone: ${originalname}`);
          const embeddingVector = await getJinaEmbedding(fileContent);
          
          if (embeddingVector && Array.isArray(embeddingVector)) {
            await pineconeIndex.upsert([
              {
                id: `kb-file-${fileId}-${Date.now()}`,
                values: embeddingVector,
                metadata: {
                  text: fileContent.substring(0, 2000), // Store first 2000 chars
                  source: 'uploaded_file',
                  filename: originalname,
                  description: description || '',
                  file_id: fileId,
                },
              },
            ]);
            indexedToPinecone = true;
            console.log(`✅ Successfully indexed: ${originalname} to Pinecone`);
          }
        }
      } catch (indexError) {
        console.error(`⚠️ Failed to index file to Pinecone (file still saved):`, indexError.message);
      }
    }

    res.status(201).json({
      id: fileId,
      filename: originalname,
      stored_filename: filename,
      file_type: mimetype,
      file_size: size,
      description,
      indexed_to_pinecone: indexedToPinecone,
    });
  } catch (error) {
    console.error('Error uploading KB file:', error);
    res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// File download
// KB file download - readable by all authenticated users
app.get('/api/knowledge-base/files/:id', authMiddleware, async (req, res) => {
  try {
    const file = await db.get('SELECT * FROM kb_files WHERE id = ?', [req.params.id]);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }
    const fullPath = path.join(uploadDir, file.stored_filename);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File missing on server.' });
    }
    res.download(fullPath, file.filename);
  } catch (error) {
    console.error('Error downloading KB file:', error);
    res.status(500).json({ error: 'Failed to download file.' });
  }
});

// File delete
// Delete KB file (Admin only) - Also removes from Pinecone
app.delete('/api/knowledge-base/files/:id', adminMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = await db.get('SELECT * FROM kb_files WHERE id = ?', [fileId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }
    
    // Delete from disk
    const fullPath = path.join(uploadDir, file.stored_filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    
    // Try to delete from Pinecone (find vectors with matching file_id)
    try {
      // Delete by ID prefix pattern
      await pineconeIndex.deleteMany({
        filter: { file_id: { $eq: parseInt(fileId) } }
      });
      console.log(`🗑️ Removed Pinecone vectors for file ID: ${fileId}`);
    } catch (pineconeError) {
      console.warn(`⚠️ Could not remove from Pinecone (continuing):`, pineconeError.message);
    }
    
    // Delete from SQLite
    await db.run('DELETE FROM kb_files WHERE id = ?', [fileId]);
    res.status(200).json({ message: 'File deleted from storage and knowledge base.' });
  } catch (error) {
    console.error('Error deleting KB file:', error);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

app.get('/', (req, res) => {
  res.status(200).send('Server is healthy and running!');
});

async function startServer() {
  db = await open({
    filename: './triage.db',
    driver: sqlite3.Database
  });
  console.log("SQLite Database connection established.");

  await db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT,
      subject TEXT,
      body TEXT,
      category TEXT,
      priority TEXT,
      confidence REAL,
      is_verified INTEGER DEFAULT 0,
      solution TEXT,
      chain_of_thought TEXT,
      proposed_reply TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Ensured tickets table exists in triage.db.");

  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','agent')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Ensured users table exists.');

  await db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER,
      issue_summary TEXT,
      resolution TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Ensured knowledge_entries table exists.');

  await db.run(`
    CREATE TABLE IF NOT EXISTS kb_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Ensured kb_files table exists.');

  // KB approval requests - agents can request, admins approve
  await db.run(`
    CREATE TABLE IF NOT EXISTS kb_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      requested_by INTEGER NOT NULL,
      proposed_summary TEXT,
      proposed_resolution TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      reviewed_by INTEGER,
      review_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )
  `);
  console.log('Ensured kb_requests table exists.');

  // Seed demo users if none exist
  const userCountRow = await db.get('SELECT COUNT(*) as c FROM users');
  if ((userCountRow && userCountRow.c === 0) || !userCountRow) {
    console.log('Seeding demo users (admin and agent)...');
    const adminHash = await bcrypt.hash('admin123', 10);
    const agentHash = await bcrypt.hash('agent123', 10);
    await db.run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['Admin User', 'admin@resolveai.com', adminHash, 'admin']
    );
    await db.run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['Support Agent', 'agent@resolveai.com', agentHash, 'agent']
    );
    console.log('Demo users created.');
  }

  const pineconeApiKey = process.env.PINECONE_API_KEY;
  if (!pineconeApiKey) {
    console.error('\nMissing Pinecone configuration: PINECONE_API_KEY is not set.');
    process.exit(1);
  }
  
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    console.error('\n❌ Missing GROQ_API_KEY in .env file.');
    console.error('   Get your API key at: https://console.groq.com/keys');
    process.exit(1);
  }

  groq = new Groq({ apiKey: groqApiKey });
  console.log("✅ Groq AI client initialized.");
  console.log(`   🔑 API Key: ${groqApiKey.substring(0, 10)}...${groqApiKey.substring(groqApiKey.length - 4)}`);

  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  pineconeIndex = pinecone.index("resolveai-kb");
  console.log("Pinecone vector store initialized successfully.");

  // Validate email credentials and verify IMAP connection on startup
  console.log('\n========== Email Service Initialization ==========');
  if (validateEmailCredentials()) {
    await verifyImapConnection();
  } else {
    console.error('❌ ResolveAI: Email listener disabled - credentials not configured');
  }
  console.log('==================================================\n');

  // Index static knowledge base text files into Pinecone so they are available for triage
  console.log('\n========== Knowledge Base Indexing ==========');
  try {
    const kbDir = path.join(__dirname, 'knowledge_base');
    if (fs.existsSync(kbDir)) {
      const files = fs.readdirSync(kbDir).filter(f => f.toLowerCase().endsWith('.txt'));

      if (files.length === 0) {
        console.log('   No .txt files found in knowledge_base directory');
      } else {
        console.log(`   Found ${files.length} KB file(s) to index: ${files.join(', ')}`);

        for (const file of files) {
          const fullPath = path.join(kbDir, file);
          const text = fs.readFileSync(fullPath, 'utf-8');

          if (!text.trim()) {
            console.warn(`   ⚠️  Skipping empty file: ${file}`);
            continue;
          }

          try {
            console.log(`   📄 Processing: ${file} (${text.length} chars)`);
            const embeddingVector = await getJinaEmbedding(text);

            if (embeddingVector && Array.isArray(embeddingVector)) {
              // Pinecone SDK expects a flat array of vector objects
              await pineconeIndex.upsert([
                {
                  id: `static-kb-${file.replace('.txt', '')}-${Date.now()}`,
                  values: embeddingVector,
                  metadata: {
                    text: text.substring(0, 1000), // Limit metadata text to 1000 chars
                    source: 'static_file',
                    filename: file,
                  },
                },
              ]);
              console.log(`   ✅ Indexed: ${file} (${embeddingVector.length} dimensions)`);
            } else {
              console.warn(`   ⚠️  No embedding returned for: ${file}`);
            }
          } catch (e) {
            console.error(`   ❌ Failed to index ${file}:`, e && e.message ? e.message : e);
          }
        }
      }
    } else {
      console.log('   knowledge_base directory not found - skipping KB indexing');
    }
  } catch (e) {
    console.error('   ❌ Error during KB indexing:', e && e.message ? e.message : e);
  }
  console.log('=============================================\n');

  cron.schedule('*/5 * * * *', checkEmails);
  console.log('Automated email checker is scheduled to run every 5 minutes.');

  let activeServer = null;

  const attemptListen = (port, attemptsLeft = 5) => {
    const server = app.listen(port, () => {
      console.log(`\n🚀 Backend server listening on http://localhost:${port}`);
      console.log('   Press Ctrl+C to stop the server\n');
      activeServer = server;
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use.`);
        if (attemptsLeft > 0) {
          const nextPort = port + 1;
          console.log(`Attempting to listen on port ${nextPort} (${attemptsLeft - 1} attempts left)...`);
          setTimeout(() => attemptListen(nextPort, attemptsLeft - 1), 500);
        } else {
          console.error('Exhausted port retry attempts. Please free port or set PORT env variable to another port. Exiting.');
          process.exit(1);
        }
      } else {
        console.error('Server error while trying to listen:', err);
        process.exit(1);
      }
    });
  };

  attemptListen(PORT, 5);

  // --------- Graceful Shutdown Handler ---------
  const gracefulShutdown = async (signal) => {
    console.log(`\n\n🛑 Received ${signal}. Initiating graceful shutdown...`);

    // Close IMAP connection health flag to prevent new connections
    imapConnectionHealthy = false;
    console.log('   📧 IMAP listener disabled');

    // Close the HTTP server
    if (activeServer) {
      await new Promise((resolve) => {
        activeServer.close((err) => {
          if (err) {
            console.error('   ❌ Error closing HTTP server:', err.message);
          } else {
            console.log('   ✅ HTTP server closed');
          }
          resolve();
        });
      });
    }

    // Close database connection
    if (db) {
      try {
        await db.close();
        console.log('   ✅ Database connection closed');
      } catch (err) {
        console.error('   ❌ Error closing database:', err.message);
      }
    }

    // Resend API doesn't need explicit cleanup (uses HTTP)
    console.log('   ✅ Email service (Resend API) - no cleanup needed');

    console.log('\n👋 ResolveAI shutdown complete. Goodbye!\n');
    process.exit(0);
  };

  // Listen for termination signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // kill command
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));   // terminal closed
}

startServer();