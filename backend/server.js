const express = require('express');
const cors = require('cors');
require('dotenv').config();
const cron = require('node-cron');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

const { PineconeStore } = require("@langchain/pinecone");
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TaskType } = require("@google/generative-ai");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const pinecone = new Pinecone();
const pineconeIndex = pinecone.index("resolveai-kb");
const embeddings = new GoogleGenerativeAIEmbeddings({
    modelName: "text-embedding-004",
    taskType: TaskType.RETRIEVAL_QUERY,
});

const vectorStore = new PineconeStore(embeddings, { pineconeIndex });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

async function processProblem(problem){
  console.log("Processing problem:", problem);

  const searchResults = await vectorStore.similaritySearch(problem, 1);
  const context = searchResults.map(result => result.pageContent).join("\n---\n");
  console.log("Retrieved context:", context);

  const prompt = `
    You are a customer support agent.
    Use the following context to answer the user's question.
    If the context does not contain the answer, state that you do not have that information.
    Context: --- ${context} ---
    User's Question: "${problem}"
  `;

  const result = await model.generateContent(prompt);
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
  try {
    console.log(`\n[${new Date().toISOString()}] Checking for new emails...`);
    const connection = await imaps.connect(emailConfig);
    await connection.openBox('INBOX');
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: [''] };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      console.log("No new emails found.");
      connection.end();
      return;
    }
    console.log(`Found ${messages.length} new email(s). Processing...`);

    for (const item of messages) {
      const uid = item.attributes.uid;

      const all = item.parts.find(part => part.which === "");
      const mail = await simpleParser(all.body);

      console.log('--- NEW EMAIL ---');
      console.log('From:', mail.from.text);
      console.log('Subject:', mail.subject);
      console.log('-----------------');

      const solution = await processProblem(mail.text);
            
      console.log('AI Generated Solution:', solution);
      console.log('------------------------');
      
      await connection.addFlags(uid, ['\\Seen']);
      console.log(`- Marked email ${uid} as read.`);
    }
      
    connection.end();
  } catch (error) {
      console.error("Error checking emails:", error);
  }
}
// Runs every minute
cron.schedule('* * * * *', () => {
    checkEmails();
});

app.post('/api/triage', async (req, res) => {
  console.log('Received triage request...');
  try {
    const problem = req.body.problem;

    if (!problem) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }

    const solution = await processProblem(problem);
    res.json({ solution: solution });

  } catch (error) {
    console.error('Error in RAG pipeline:', error);
    res.status(500).json({ error: 'Failed to get a response from the AI.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});