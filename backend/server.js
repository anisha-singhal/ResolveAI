const express = require('express');
const app = express();
const PORT = 3001

app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is running!'});
})

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});