// ingest.js
const { PineconeStore } = require("@langchain/pinecone");
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { Document } = require("langchain/document");
const { TaskType } = require("@google/generative-ai");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        console.log("Starting Pinecone ingestion process...");

        const pinecone = new Pinecone(); 
        const indexName = "resolveai-kb";
        const pineconeIndex = pinecone.index(indexName);
        console.log(`- Connected to Pinecone index "${indexName}"`);

        const knowledgeBaseDir = path.join(__dirname, 'knowledge_base');
        const files = fs.readdirSync(knowledgeBaseDir);
        const docs = [];

        for (const file of files) {
            if (file.endsWith('.txt')) {
                const filePath = path.join(knowledgeBaseDir, file);
                const text = fs.readFileSync(filePath, 'utf8');
                docs.push(new Document({ pageContent: text, metadata: { source: file } }));
                console.log(`- Loaded document: ${file}`);
            }
        }
        
        if (docs.length === 0) {
            console.log("No documents to ingest.");
            return;
        }

        const embeddings = new GoogleGenerativeAIEmbeddings({
            modelName: "text-embedding-004",
            taskType: TaskType.RETRIEVAL_DOCUMENT,
        });
        
        console.log("Starting document ingestion into Pinecone...");
        await PineconeStore.fromDocuments(docs, embeddings, {
            pineconeIndex,
        });

        console.log("Successfully ingested documents into Pinecone!");
        
    } catch (error) {
        console.error("Error during ingestion:", error);
    }
}

main();