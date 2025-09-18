const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { TaskType } = require("@google/generative-ai");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let vectorStore;

async function initializeVectorStore() {
  try {
    console.log("Loading knowledge base...");
    const docPath = path.join(__dirname, 'knowledge_base', 'return_policy.txt');
    const documentText = fs.readFileSync(docPath, 'utf8');

    const embeddings = new GoogleGenerativeAIEmbeddings({
        modelName: "text-embedding-004",
        taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    vectorStore = await MemoryVectorStore.fromTexts(
      [documentText],
      [{ id: 1 }],
      embeddings
    );
    console.log("✅ Knowledge base loaded and vectorized successfully.");
  } catch (error) {
    console.error("❌ Error initializing vector store:", error);
  }
}

app.post('/api/triage', async (req, res) => {
  console.log('Received triage request...');
  try {
    const problem = req.body.problem;

    if (!problem) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }

    if (!vectorStore) {
        return res.status(500).json({ error: 'Knowledge base is not ready.' });
    }

    const searchResults = await vectorStore.similaritySearch(problem, 1);
    const context = searchResults.map(result => result.pageContent).join("\n---\n");
    console.log("Retrieved context:", context);

    const prompt = `
      You are a customer support agent.
      Use the following context to answer the user's question. 
      If the context does not contain the answer, state that you do not have that information.

      Context:
      ---
      ${context}
      ---

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
  initializeVectorStore();
});