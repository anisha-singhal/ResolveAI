import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {

  return (
    <div className = "App">
      <h1>ResolveAI - Triage Agent</h1>
      <div className = "input-section">
        <textarea 
        placeholder = "Paste Customer Support email here"
        rows = "10"
        cols = "60"
        />
        <button>Triage Ticket</button>
        </div> 
        <h2>Triage Report</h2>
    </div>
  );
}

export default App
