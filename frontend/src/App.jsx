import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [emailText, setEmailText] = useState('');
  const [triageResult, setTriageResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTriage = async () => {
    setIsLoading(true);
    setError('');
    setTriageResult(null);
    try {
      const response = await axios.post('http://localhost:3001/api/triage', {
        emailText: emailText,
      });
      setTriageResult(response.data);
    } catch (err) {
      console.error("Error calling triage API:", err);
      setError('Failed to get triage report. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>ResolveAI - Triage Agent</h1>
      </header>
      <main className="triage-section">
        <textarea
          className="email-input"
          placeholder="Paste customer email here..."
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          disabled={isLoading}
        ></textarea>
        
        <button 
          className="triage-button" 
          onClick={handleTriage} 
          disabled={isLoading}
        >
          {isLoading ? 'Analyzing...' : 'Triage Ticket'}
        </button>
        
        {error && <p className="error-message">{error}</p>}
        
        {triageResult && (
          <div className="triage-report">
            <h2>Response:</h2>
            <p className="suggested-reply">
              {triageResult.suggested_reply}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;