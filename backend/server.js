const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const cron = require('node-cron');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const nodemailer = require('nodemailer');

const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = 3001;

const SUPPORT_CATEGORIES = ["Shipping Inquiry", "Return Request", "Billing Question", "General Inquiry"];

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

  const embeddingResult = await embeddingModel.embedContent(problem);
  const queryVector = embeddingResult.embedding.values;

  const searchResults = await pineconeIndex.query({
      topK: 2,
      vector: queryVector,
      includeMetadata: true,
  });

  const context = searchResults.matches.map(result => result.metadata.text).join("\n---\n");
  console.log("Retrieved context:", context);

  const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-flash-latest" });

  const prompt = `
    You are an advanced AI support agent. Your task is to perform a detailed triage of a user's email by following a step-by-step reasoning process.

    Step 1: Analyze the user's email and summarize the core problem.
    Step 2: Classify the email into one of the following predefined categories: ${SUPPORT_CATEGORIES.join(", ")}.
    Step 3: Determine the priority: "Low", "Medium", or "High".
    Step 4: Rate your confidence in this analysis from 0.0 to 1.0.
    Step 5: Generate a helpful solution for the user based ONLY on the provided context.

    Knowledge Base Context:
    ---
    ${context}
    ---
    User's Email: "${problem}"

    Provide your final analysis as a single JSON object with the keys "category", "priority", "confidence", and "solution".
  `;
  
  const result = await generativeModel.generateContent(prompt);
  const responseText = (await result.response).text();
  const cleanedJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
  
  try {
      return JSON.parse(cleanedJson);
  } catch (e) {
      console.error("Failed to parse AI response as JSON:", cleanedJson);
      return { category: "Uncategorized", priority: "Medium", confidence: 0.5, solution: "Could not process AI response." };
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

      const originalMessageId = mail.messageId || 
        mail.headers.get('message-id') || 
        mail.headers.get('Message-ID');

      const messageReferences = mail.references || 
        mail.headers.get('references') || 
        mail.headers.get('References') || [];

      const references = Array.isArray(messageReferences) 
        ? messageReferences 
        : messageReferences.split(/[\s,]+/).filter(Boolean);

      const domain = process.env.IMAP_USER.split('@')[1];
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 10);
      const replyMessageId = `<reply.${timestamp}.${randomStr}@${domain}>`;

      const allReferences = [...references];
      if (originalMessageId && !allReferences.includes(originalMessageId)) {
        allReferences.push(originalMessageId);
      }

  const originalSubject = (typeof mail.subject === 'string') ? mail.subject : '';
  const cleanSubject = (originalSubject || '').replace(/^(Re|RE|Fw|FW|Fwd|FWD):\s+/g, '').trim();
  const replySubject = cleanSubject ? `Re: ${cleanSubject}` : '';

      const toAddress = (mail.from.value && mail.from.value[0] && mail.from.value[0].address) || 
                       mail.from.address || 
                       process.env.IMAP_USER;

      console.log('Processing incoming mail:', {
        originalMessageId,
        existingReferences: references,
        subject: mail.subject,
        headers: mail.headers
      });

      const headers = {
        'Message-ID': replyMessageId,
        'Thread-Topic': cleanSubject,
        'Thread-Index': `${timestamp}.${randomStr}`
      };

      if (originalMessageId) headers['In-Reply-To'] = originalMessageId;
      if (allReferences.length) headers['References'] = allReferences.join(' ');

      const mailOptions = {
        from: {
          name: 'Customer Support',
          address: process.env.IMAP_USER
        },
        to: toAddress,
        subject: replySubject,
        text: triageResult.solution,
        messageId: replyMessageId,
        inReplyTo: originalMessageId || undefined,
        references: allReferences.length ? allReferences.join(' ') : undefined,
        headers
      };

      try {
        console.log('Raw incoming headers (first 30):', [...(mail.headers || [])].slice(0, 30));
      } catch (e) {
        console.log('Could not enumerate raw headers:', e);
      }

      console.log('Computed threading fields:', {
        originalMessageId,
        allReferences,
        replySubject
      });

      console.log('Outgoing mail threading details:', {
        messageId: mailOptions.messageId,
        inReplyTo: mailOptions.inReplyTo,
        subject: mailOptions.subject,
        references: mailOptions.references
      });

      try {
          console.log('Sending reply with mailOptions:', {
            to: mailOptions.to,
            subject: mailOptions.subject,
            messageId: mailOptions.messageId,
            inReplyTo: mailOptions.inReplyTo,
            references: mailOptions.references,
            headers: mailOptions.headers
          });

          const info = await transporter.sendMail(mailOptions);

          console.log('- sendMail result:', {
            accepted: info.accepted,
            rejected: info.rejected,
            envelope: info.envelope,
            messageId: info.messageId || mailOptions.messageId
          });

          console.log(`- Sent reply successfully to ${toAddress}`);
      } catch (sendError) {
          console.error('Error sending email reply (sendMail failed):', sendError);
      }

      await db.run(
        'INSERT INTO tickets (sender, subject, body, category, priority, confidence, solution) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [mail.from.text, mail.subject, mail.text, triageResult.category, triageResult.priority, triageResult.confidence, triageResult.solution]
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

app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await db.all('SELECT * FROM tickets ORDER BY created_at DESC');
        res.json(tickets);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ error: 'Failed to fetch tickets.' });
    }
});

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
      solution TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Ensured tickets table exists in triage.db.");

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
          // small delay before retry to avoid tight loop
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