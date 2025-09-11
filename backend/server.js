const express = require('express');
const cors = require('cors')
const app = express();
const PORT = 3001

app.use(cors())
app.use(express.json()) // Allow backend to accept JSON from the frontend

app.post('/api/triage', (req, res) => {
  const { emailText } = req.body;
  console.log('Received email text:', emailText);

    const fakeTriageReport = {
    classification: 'Billing Issue',
    priority: 'High',
    suggested_reply: 'This is a test reply from the backend.'
  };

  res.json(fakeTriageReport);
})

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});