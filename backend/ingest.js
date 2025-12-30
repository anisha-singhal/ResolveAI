const { Pinecone } = require("@pinecone-database/pinecone");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Jina AI Embeddings helper (same as server.js)
async function getJinaEmbedding(text) {
    const apiKey = process.env.JINA_API_KEY;
    if (!apiKey) {
        throw new Error('JINA_API_KEY is not set in .env file');
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

async function main() {
    try {
        console.log("Starting Pinecone ingestion process...\n");

        // Validate environment variables
        if (!process.env.PINECONE_API_KEY) {
            throw new Error('PINECONE_API_KEY is not set in .env file');
        }
        if (!process.env.JINA_API_KEY) {
            throw new Error('JINA_API_KEY is not set in .env file');
        }

        const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        const indexName = "resolveai-kb";
        const pineconeIndex = pinecone.index(indexName);
        console.log(`✅ Connected to Pinecone index "${indexName}"`);
        console.log(`✅ Using Jina AI for embeddings\n`);

        const knowledgeBaseDir = path.join(__dirname, 'knowledge_base');
        
        if (!fs.existsSync(knowledgeBaseDir)) {
            console.log("❌ knowledge_base directory not found.");
            console.log("   Create a 'knowledge_base' folder and add .txt files to ingest.");
            return;
        }

        const files = fs.readdirSync(knowledgeBaseDir);
        const documents = [];

        for (const file of files) {
            if (file.endsWith('.txt')) {
                const filePath = path.join(knowledgeBaseDir, file);
                const text = fs.readFileSync(filePath, 'utf8');
                if (text.trim()) {
                    documents.push({ text: text, source: file });
                    console.log(`📄 Loaded document: ${file} (${text.length} chars)`);
                } else {
                    console.log(`⚠️  Skipping empty file: ${file}`);
                }
            }
        }
        
        if (documents.length === 0) {
            console.log("\n❌ No .txt documents found to ingest.");
            return;
        }

        console.log(`\n🚀 Starting embedding and ingestion of ${documents.length} document(s)...\n`);

        for (const doc of documents) {
            console.log(`   Processing: ${doc.source}`);
            
            try {
                const embeddingVector = await getJinaEmbedding(doc.text);
                
                const record = {
                    id: `static-kb-${doc.source.replace('.txt', '')}-${Date.now()}`,
                    values: embeddingVector,
                    metadata: {
                        text: doc.text.substring(0, 2000), // Limit metadata to 2000 chars
                        source: doc.source,
                    },
                };

                await pineconeIndex.upsert([record]);
                console.log(`   ✅ Successfully ingested: ${doc.source} (${embeddingVector.length} dimensions)`);
            } catch (error) {
                console.error(`   ❌ Failed to ingest ${doc.source}:`, error.message);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("\n🎉 Ingestion process complete!");
        
    } catch (error) {
        console.error("\n❌ Error during ingestion:", error.message);
        process.exit(1);
    }
}

main();
