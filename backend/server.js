const express = require('express');
const cors = require('cors')
require('dotenv').config();
const {GoogleGenerativeAI} = require('@google/generative-ai');

const app = express();
const PORT = 3001

app.use(cors())
app.use(express.json()) // Allow backend to accept JSON from the frontend

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/triage', async (req, res) => {
  const { emailText } = req.body;
  console.log('Received email text:', emailText);

  if(!emailText){ 
    return res.status(400).json({error: 'Email text is required'});
  }
  
  console.log('Received triage request...');

  try{
    const model = genAI.getGenerativeModel({model: "gemini-pro"})
    const prompt = `Analyze the following support email and return ONLY a valid JSON object with this exact structure:
    {
      "classification": "one of: Billing Issue, Technical Bug, Feature Request",
      "priority": "one of: High, Medium, Low",
      "suggested_reply": "A brief, helpful first response to the customer"
    }

    Here are the definitions for context:
    - Classification Categories:
      - "Billing Issue": For payment problems, subscription issues, or refund requests.
      - "Technical Bug": For system errors, a feature not working, or performance problems.
      - "Feature Request": For suggestions for new features or requests for enhancements.
    - Priority Levels:
      - "High": For issues where the system is down, payment has failed, or there is a security concern.
      - "Medium": For a feature that is not working correctly or a general non-critical bug.
      - "Low": For feature requests or minor issues.

    Email to Analyze: "${emailText}"`;
    
    const result = await model.generateContent(prompt)
    const response = await result.response

    const jsonResponse = JSON.parse(response.text());

    console.log('Triage complete:', jsonResponse);
    res.json(jsonResponse);
  }
  catch(error){
    console.error('Error during triage:', error);
    res.status(500).json({error: 'Internal server error'});
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});