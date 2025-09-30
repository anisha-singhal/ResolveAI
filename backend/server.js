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

app.use(cors());
app.use(express.json());

let db; 
let pineconeIndex;
let genAI;
let embeddingModel;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD
    }
});

async function processProblem(problem){
  console.log("Processing problem:", problem);

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
    You are a customer support agent.
    Use the following context to answer the user's question.
    If the context does not contain the answer, state that you do not have that information.
    Context: --- ${context} ---
    User's Question: "${problem}"
  `;
  const result = await generativeModel.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

const emailConfig = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 3000
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

      console.log('--- DETAILED EMAIL HEADERS ---');
      console.log(mail.headers);
      console.log('----------------------------');

      let headerMessageId;
      try {
        headerMessageId = (mail.headers && typeof mail.headers.get === 'function')
          ? mail.headers.get('message-id')
          : (mail.headers && (mail.headers['message-id'] || mail.headers['Message-ID']));
      } catch (e) {
        headerMessageId = undefined;
      }
      const originalMessageId = mail.messageId || headerMessageId;

      const replySubject = (mail.subject && mail.subject !== 'undefined') ? `Re: ${mail.subject}` : 'Re:';

      const solution = await processProblem(mail.text);
      console.log('AI Generated Solution:', solution);

      const toAddress = (mail.from && mail.from.value && mail.from.value[0] && mail.from.value[0].address)
        ? mail.from.value[0].address
        : (mail.from && mail.from.address) || process.env.IMAP_USER;

      const mailOptions = {
          from: process.env.IMAP_USER,
          to: toAddress,
          subject: replySubject,
          text: solution,
      };

      if (originalMessageId) {
        mailOptions.inReplyTo = originalMessageId;
        mailOptions.references = originalMessageId;
        mailOptions.headers = Object.assign({}, mailOptions.headers, {
          'In-Reply-To': originalMessageId,
          'References': originalMessageId,
        });
      }

      try {
          await transporter.sendMail(mailOptions);
          console.log(`- Sent reply successfully to ${mail.from.value[0].address}.`);
      } catch (sendError) {
          console.error("Error sending email reply:", sendError);
      }

      await db.run(
        'INSERT INTO tickets (sender, subject, body, solution) VALUES (?, ?, ?, ?)',
        [mail.from.text, mail.subject, mail.text, solution]
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

app.post('/api/triage', async (req, res) => {
  try {
    const { problem } = req.body;
    if (!problem) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }
    const solution = await processProblem(problem);
    res.json({ solution });
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
  embeddingModel = genAI.getGenerativeModel({ model: "embedding-001",  taskType: "RETRIEVAL_QUERY"});
  console.log("Google AI Embedding model initialized.");

  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  pineconeIndex = pinecone.index("resolveai-kb");
  console.log("Pinecone vector store initialized successfully.");

  cron.schedule('* * * * *', checkEmails);
  console.log('Automated email checker is scheduled to run every minute.');

  app.listen(PORT, () => {
    console.log(`Backend server listening on http://localhost:${PORT}`);
  });
}

startServer();