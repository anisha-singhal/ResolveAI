const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        console.log("Starting Pinecone ingestion process...");

        const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        const indexName = "resolveai-kb";
        const pineconeIndex = pinecone.index(indexName);
        console.log(`- Connected to Pinecone index "${indexName}"`);

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001", taskType: "RETRIEVAL_DOCUMENT" });
        console.log("- Google AI Embedding model initialized for document ingestion.");

        const knowledgeBaseDir = path.join(__dirname, 'knowledge_base');
        const files = fs.readdirSync(knowledgeBaseDir);
        const documents = [];

        for (const file of files) {
            if (file.endsWith('.txt')) {
                const filePath = path.join(knowledgeBaseDir, file);
                const text = fs.readFileSync(filePath, 'utf8');
                documents.push({ text: text, source: file });
                console.log(`- Loaded document: ${file}`);
            }
        }
        
        if (documents.length === 0) {
            console.log("No documents to ingest.");
            return;
        }

        console.log("Starting document embedding and ingestion into Pinecone...");

        for (const doc of documents) {
            console.log(`-- Processing: ${doc.source}`);
            
            const embeddingResult = await embeddingModel.embedContent(doc.text);
            const vector = embeddingResult.embedding.values;

            const record = {
                id: doc.source,
                values: vector,
                metadata: {
                    text: doc.text,
                    source: doc.source,
                },
            };

            await pineconeIndex.upsert([record]);
            console.log(`-- Successfully ingested: ${doc.source}`);
        }

        console.log("\nSuccessfully ingested all documents into Pinecone!");
        
    } catch (error) {
        console.error("Error during ingestion:", error);
    }
}

main();