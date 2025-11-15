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
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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
let genAI;
let embeddingModel;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
});

transporter.verify().then(() => {
  console.log('Nodemailer transporter verified. SMTP is ready to send emails.');
}).catch(err => {
  console.error('Failed to verify nodemailer transporter (SMTP credentials/config):', err);
});

async function processProblem(problem){
  console.log("Processing problem with advanced triage:", problem);
  // Try to get embeddings with limited retries and exponential backoff.
  // If embeddings fail (quota/rate limit), fall back to doing the generative step without context.
  let embeddingResult = null;
  const maxEmbedRetries = 3;
  let embedDelay = 1000; // start with 1s
  for (let attempt = 1; attempt <= maxEmbedRetries; attempt++) {
    try {
      embeddingResult = await embeddingModel.embedContent(problem);
      break; // success
    } catch (e) {
      console.warn(`embedContent attempt ${attempt} failed:`, e && e.message ? e.message : e);
      // If it's a 429 (rate limit), we retry with backoff; otherwise break and fallback
      const status = e && e.status;
      if (status === 429 && attempt < maxEmbedRetries) {
        console.log(`Rate limited on embedding, retrying in ${embedDelay}ms...`);
        await new Promise(r => setTimeout(r, embedDelay));
        embedDelay *= 2;
        continue;
      } else {
        console.log('Embedding failed and will be skipped for this request.');
        embeddingResult = null;
        break;
      }
    }
  }

  let context = '';
  if (embeddingResult && embeddingResult.embedding && embeddingResult.embedding.values) {
    try {
      const queryVector = embeddingResult.embedding.values;
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
  console.log("Retrieved context:", context);

  const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-flash-latest" });

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
  
  const result = await generativeModel.generateContent(prompt);
  const responseText = (await result.response).text();
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


const emailConfig = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000
  }
};


async function checkEmails() {
  if (!db || !pineconeIndex) {
    console.log("Database or vector store not ready, skipping email check.");
    return;
  }
  try {
    console.log(`\n[${new Date().toISOString()}] Checking for new emails...`);
    const connection = await imaps.connect(emailConfig);
    await connection.openBox('INBOX');
    const searchResults = await connection.search(['UNSEEN'], { bodies: [''] });
    if (searchResults.length === 0) {
      console.log("No new emails found.");
      connection.end();
      return;
    }
    console.log(`Found ${searchResults.length} new email(s). Processing...`);

    for (const item of searchResults) {
      const uid = item.attributes.uid;
      const all = item.parts.find(part => part.which === "");
      const mail = await simpleParser(all.body);

      console.log('--- PROCESSING EMAIL ---');
      console.log('From:', mail.from.text);
      console.log('Subject:', mail.subject);
      
      const triageResult = await processProblem(mail.text);
      console.log('AI Triage Result:', triageResult);

      if (triageResult.confidence > 0.8) {
        console.log(`- Confidence (${triageResult.confidence}) > 0.8. Sending automatic reply.`);
        
        const originalMessageId = mail.messageId || (mail.headers && mail.headers.get('message-id'));
        const originalReferences = mail.references || (mail.headers && mail.headers.get('references')) || [];
        const newReferences = [...(Array.isArray(originalReferences) ? originalReferences : [originalReferences]), originalMessageId].filter(Boolean);

        const mailOptions = {
            from: process.env.IMAP_USER,
            to: mail.from.value[0].address,
            subject: mail.subject ? `Re: ${mail.subject}` : 'Re: Your recent inquiry',
            text: triageResult.solution,
            headers: {
              'In-Reply-To': originalMessageId,
              'References': newReferences.join(' ')
            }
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`- Sent reply successfully to ${mail.from.value[0].address}.`);
        } catch (sendError) {
            console.error("Error sending email reply:", sendError);
        }
      } else {
        console.log(`- Confidence (${triageResult.confidence}) <= 0.8. Flagging for human review. Reply NOT sent.`);
      }

      await db.run(
        'INSERT INTO tickets (sender, subject, body, category, priority, confidence, solution, chain_of_thought) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [mail.from.text, mail.subject, mail.text, triageResult.category, triageResult.priority, triageResult.confidence, triageResult.solution, triageResult.chain_of_thought || null]
      );
      console.log('- Saved ticket to the database.');
      
      await connection.addFlags(uid, ['\\Seen']);
      console.log(`- Marked email ${uid} as read.`);
    }
    connection.end();
  } catch (error) {
    console.error("Error checking emails:", error);
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
app.get('/api/tickets', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM tickets ORDER BY created_at DESC');
    const tickets = rows.map(mapTicketRow);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets.' });
  }
});

app.get('/api/tickets/:id', async (req, res) => {
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

app.post('/api/tickets/:id/verify', async (req, res) => {
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
app.post('/api/tickets/:id/resolve', async (req, res) => {
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

    // Send email reply
    const mailOptions = {
      from: process.env.IMAP_USER,
      to: recipientEmail,
      subject: ticket.subject ? `Re: ${ticket.subject}` : 'Re: Your support request',
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${recipientEmail} for ticket ${id}`);
    } catch (sendError) {
      console.error('Error sending email:', sendError);
      return res.status(500).json({ error: 'Failed to send email reply.' });
    }

    // Update ticket in database
    await db.run(
      'UPDATE tickets SET solution = ?, is_verified = 1 WHERE id = ?',
      [message, id]
    );

    res.status(200).json({ message: 'Ticket resolved and email sent.' });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    res.status(500).json({ error: 'Failed to resolve ticket.' });
  }
});

// Resolve and save to knowledge base
app.post('/api/tickets/:id/resolve-and-save', async (req, res) => {
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

    // Send email reply
    const mailOptions = {
      from: process.env.IMAP_USER,
      to: recipientEmail,
      subject: ticket.subject ? `Re: ${ticket.subject}` : 'Re: Your support request',
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${recipientEmail} for ticket ${id}`);
    } catch (sendError) {
      console.error('Error sending email:', sendError);
      return res.status(500).json({ error: 'Failed to send email reply.' });
    }

    // Update ticket in database
    await db.run(
      'UPDATE tickets SET solution = ?, is_verified = 1 WHERE id = ?',
      [message, id]
    );

    // Save to knowledge base
    const summary = ticket.subject || `Ticket ${id}`;
    await db.run(
      'INSERT INTO knowledge_entries (ticket_id, issue_summary, resolution, category) VALUES (?, ?, ?, ?)',
      [id, summary, message, ticket.category]
    );

    res.status(200).json({ message: 'Ticket resolved, email sent, and saved to knowledge base.' });
  } catch (error) {
    console.error('Error resolving ticket and saving to KB:', error);
    res.status(500).json({ error: 'Failed to resolve and save ticket.' });
  }
});

// Manual triage endpoint used by earlier UI
app.post('/api/triage', async (req, res) => {
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

// Analytics for dashboard
app.get('/api/analytics', async (req, res) => {
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

// Knowledge base entries (resolved tickets)
app.get('/api/knowledge-base', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM knowledge_entries ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching knowledge base entries:', error);
    res.status(500).json({ error: 'Failed to load knowledge base.' });
  }
});

// File metadata list
app.get('/api/knowledge-base/files', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM kb_files ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching KB files:', error);
    res.status(500).json({ error: 'Failed to load files.' });
  }
});

// File upload
app.post('/api/knowledge-base/files', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required.' });
    }

    const description = req.body.description || null;
    const { originalname, filename, mimetype, size } = req.file;

    const result = await db.run(
      'INSERT INTO kb_files (filename, stored_filename, file_type, file_size, description) VALUES (?, ?, ?, ?, ?)',
      [originalname, filename, mimetype, size, description]
    );

    res.status(201).json({
      id: result.lastID,
      filename: originalname,
      stored_filename: filename,
      file_type: mimetype,
      file_size: size,
      description,
    });
  } catch (error) {
    console.error('Error uploading KB file:', error);
    res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// File download
app.get('/api/knowledge-base/files/:id', async (req, res) => {
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
app.delete('/api/knowledge-base/files/:id', async (req, res) => {
  try {
    const file = await db.get('SELECT * FROM kb_files WHERE id = ?', [req.params.id]);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }
    const fullPath = path.join(uploadDir, file.stored_filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    await db.run('DELETE FROM kb_files WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'File deleted.' });
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
  
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  embeddingModel = genAI.getGenerativeModel({ model: "embedding-001", taskType: "RETRIEVAL_QUERY"});
  console.log("Google AI Embedding model initialized.");

  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  pineconeIndex = pinecone.index("resolveai-kb");
  console.log("Pinecone vector store initialized successfully.");

  cron.schedule('* * * * *', checkEmails);
  console.log('Automated email checker is scheduled to run every minute.');

  const attemptListen = (port, attemptsLeft = 5) => {
    const server = app.listen(port, () => {
      console.log(`Backend server listening on http://localhost:${port}`);
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
}

startServer();