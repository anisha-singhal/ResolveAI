import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTriage = async () => {
    if (!problem) {
      setError('Please enter a problem description.');
      return;
    }
    setIsLoading(true);
    setSolution('');
    setError('');

    try {
      const res = await axios.post('http://localhost:3001/api/triage', {
        problem: problem, 
      });
      setSolution(res.data.solution);
    } catch (err) {
      console.error('Error calling triage API:', err);
      setError('Failed to get a solution. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>ResolveAI Triage</h1>
      <p>Describe your technical problem below:</p>
      
      <textarea
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder="Enter your query here..."
        rows="5"
      />
      
      <button onClick={handleTriage} disabled={isLoading}>
        {isLoading ? 'Getting Solution...' : 'Get Solution'}
      </button>

      {error && <p className="error">{error}</p>}
      
      {solution && (
        <div className="solution">
          <h2>Suggested Solution:</h2>
          <pre>{solution}</pre>
        </div>
      )}
    </div>
  );
}

export default App;