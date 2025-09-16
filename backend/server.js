const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize the Google Generative AI client with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/triage', async (req, res) => {
  const { emailText } = req.body;
  
  if (!emailText) {
    return res.status(400).json({ error: 'Email text is required' });
  }

  console.log('Received triage request...');

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    const prompt = `Analyze the following support email. Return ONLY a valid JSON object with this exact structure:
    {
      "classification": "A short, descriptive category for the email's main topic (e.g., Billing Inquiry, Password Reset, Bug Report, Feature Request).",
      "priority": "one of: High, Medium, Low, based on urgency and user sentiment.",
      "suggested_reply": "A professional and empathetic first response to the customer that acknowledges their specific issue and sets a clear expectation for the next steps or a resolution timeline."
    }

    Email to Analyze: "${emailText}"`;
    
    // Generate content based on the prompt
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    console.log('--- RAW AI RESPONSE ---');
    console.log(rawText);
    console.log('--- END RAW AI RESPONSE ---');

    const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    // Parse the cleaned text into a JSON object
    const jsonResponse = JSON.parse(cleanText);
    
    console.log('Triage complete:', jsonResponse);
    res.json(jsonResponse);

  } catch (error) {
    console.error('Error with Gemini API or JSON parsing:', error);
    res.status(500).json({ error: 'Failed to triage ticket' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});