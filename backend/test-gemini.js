// backend/test-gemini.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function runTest() {
    try {
        console.log("Attempting to connect to Google Generative AI...");
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        
    // Use the model resource name that ListModels returned for your project
    const model = genAI.getGenerativeModel({ model: "models/gemini-flash-latest" });

        console.log("Model initialized. Sending a simple prompt...");

        const prompt = "What is the capital of France?";
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log("SUCCESS! The API call worked.");
        console.log("Response from Gemini:", text);

    } catch (error) {
        console.error("FAILURE! The API call failed.");
        console.error("--- Error Details ---");
        console.error(error);
        console.error("---------------------");
        console.error("This confirms the issue is with your API key or Google Cloud project setup, not the server code.");
    }
}

runTest();