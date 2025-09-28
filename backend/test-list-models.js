const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fetch = require('node-fetch');

async function listModels() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('Set GOOGLE_API_KEY in backend/.env');
    process.exit(1);
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const text = await res.text();
    console.log('Status:', res.status, res.statusText);
    console.log('Body:', text);
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

listModels();
