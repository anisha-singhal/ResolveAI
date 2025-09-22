const express = require('express');
const cors = require('cors');
require('dotenv').config();

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

app.post('/api/triage', async (req, res) => {
  console.log('Received triage request...');
  try {
    const problem = req.body.problem;

    if (!problem) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }
    
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

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ solution: text });
  } catch (error) {
    console.error('Error in RAG pipeline:', error);
    res.status(500).json({ error: 'Failed to get a response from the AI.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});