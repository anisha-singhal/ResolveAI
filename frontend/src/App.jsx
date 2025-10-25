// frontend/src/App.jsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css'; // We'll update this next

function App() {
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    // Function to fetch tickets from the backend
    const fetchTickets = async () => {
      setIsLoading(true); // Set loading state when fetching starts
      try {
        const res = await axios.get('http://localhost:3001/api/tickets');
        setTickets(res.data);
        setError(''); // Clear any previous errors
      } catch (err) {
        console.error('Error fetching tickets:', err);
        setError('Failed to load tickets. Is the backend server running?');
        // Keep existing tickets if fetch fails, don't clear them
      } finally {
        setIsLoading(false); // Clear loading state when fetching finishes
      }
    };
    
    fetchTickets(); // Fetch immediately on component mount

    // Set up polling to refresh tickets every 15 seconds
    const interval = setInterval(fetchTickets, 15000); 

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(interval);

  }, []); // Empty dependency array means this runs only once on mount + cleanup on unmount

  // Helper function to get color class based on priority
  const getPriorityClass = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium'; // Default color
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">ResolveAI Dashboard</h1>
      
      {/* Show loading indicator */}
      {isLoading && tickets.length === 0 && <p className="text-center text-gray-500">Loading tickets...</p>}
      
      {/* Show error message */}
      {error && <p className="error text-center text-red-600 bg-red-100 p-3 rounded-md">{error}</p>}
      
      <div className="dashboard-grid grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Ticket List Column */}
        <div className="ticket-list md:col-span-1 bg-white shadow-md rounded-lg overflow-hidden">
          <h2 className="text-xl font-semibold p-4 border-b border-gray-200 bg-gray-50">Inbox ({tickets.length})</h2>
          <div className="ticket-items overflow-y-auto h-[70vh]"> {/* Scrollable list */}
            {tickets.length === 0 && !isLoading && !error && <p className="p-4 text-gray-500">No tickets found.</p>}
            {tickets.map((ticket) => (
              <div 
                key={ticket.id} 
                className={`ticket-item p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 ${selectedTicket?.id === ticket.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''}`}
                onClick={() => setSelectedTicket(ticket)}
              >
                <div className="ticket-header flex justify-between items-center mb-1">
                  <span className="sender font-semibold text-sm truncate">{ticket.sender || 'Unknown Sender'}</span>
                  <span className={`priority text-xs font-bold px-2 py-0.5 rounded-full text-white ${getPriorityClass(ticket.priority)}`}>
                    {ticket.priority || 'N/A'}
                  </span>
                </div>
                <div className="subject text-gray-700 text-sm truncate">{ticket.subject || '(no subject)'}</div>
                <div className="category text-gray-500 text-xs mt-1">{ticket.category || 'Uncategorized'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ticket Details Column */}
        <div className="ticket-details md:col-span-2 bg-white shadow-md rounded-lg p-6 h-[calc(70vh + 73px)] overflow-y-auto"> {/* Match height and scroll */}
          {selectedTicket ? (
            <>
              <h2 className="text-2xl font-semibold mb-3">{selectedTicket.subject || '(no subject)'}</h2>
              <div className="text-sm text-gray-600 mb-4">
                <p><strong>From:</strong> {selectedTicket.sender || 'Unknown Sender'}</p>
                <p><strong>Received:</strong> {new Date(selectedTicket.created_at).toLocaleString()}</p>
                 <p className="mt-2">
                   <strong>AI Category:</strong> {selectedTicket.category || 'N/A'} | 
                   <strong className="ml-2">Priority:</strong> 
                   <span className={`ml-1 font-semibold ${getPriorityClass(selectedTicket.priority)} px-1 rounded`}>{selectedTicket.priority || 'N/A'}</span> | 
                   <strong className="ml-2">Confidence:</strong> {(selectedTicket.confidence * 100).toFixed(0)}%
                 </p>
              </div>
              <hr className="my-4"/>
              <h3 className="text-lg font-semibold mb-2">Original Message:</h3>
              <pre className="email-body bg-gray-50 p-4 rounded-md text-sm whitespace-pre-wrap break-words">{selectedTicket.body || '(no message body)'}</pre>
              <hr className="my-4"/>
              <h3 className="text-lg font-semibold mb-2">AI Generated Reply:</h3>
              <pre className="ai-solution bg-blue-50 p-4 rounded-md text-sm whitespace-pre-wrap break-words">{selectedTicket.solution || '(no solution generated)'}</pre>
            </>
          ) : (
            <p className="text-center text-gray-500 mt-10">Select a ticket from the list to view its details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;