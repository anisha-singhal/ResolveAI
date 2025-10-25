import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  RiRobot2Fill,
  RiTicketLine,
  RiCheckboxCircleFill,
  RiMailLine,
  RiUser3Line,
  RiCalendarLine,
  RiHashtag,
  RiBarChartBoxLine,
  RiShieldCheckLine,
  RiChat3Line,
  RiReplyLine,
  RiInboxArchiveLine
} from 'react-icons/ri';

function App() {
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const [editedCategory, setEditedCategory] = useState('');
  const [editedPriority, setEditedPriority] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Define categories and priorities
  const SUPPORT_CATEGORIES = ["Shipping Inquiry", "Return Request", "Billing Question", "General Inquiry", "Uncategorized"];
  const PRIORITIES = ["Low", "Medium", "High"];

  useEffect(() => {
    const fetchTickets = async () => {
      if (tickets.length === 0) setIsLoading(true);
      try {
        const res = await axios.get('http://localhost:3001/api/tickets');
        setTickets(res.data);
        setError('');
      } catch (err) {
        console.error('Error fetching tickets:', err);
        setError('Failed to load tickets. Please ensure the backend server is running.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTickets();
    const interval = setInterval(fetchTickets, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      setEditedCategory(selectedTicket.category || SUPPORT_CATEGORIES[SUPPORT_CATEGORIES.length - 1]);
      setEditedPriority(selectedTicket.priority || PRIORITIES[1]);
    }
  }, [selectedTicket]);

  const handleVerification = async () => {
    if (!selectedTicket || isVerifying || selectedTicket.is_verified === 1) return;

    setIsVerifying(true);
    setError('');

    try {
      await axios.post(`http://localhost:3001/api/tickets/${selectedTicket.id}/verify`, {
        category: editedCategory,
        priority: editedPriority,
      });

      const updatedTickets = tickets.map(t =>
        t.id === selectedTicket.id
          ? { ...t, category: editedCategory, priority: editedPriority, is_verified: 1 }
          : t
      );
      setTickets(updatedTickets);
      setSelectedTicket(prev => ({ ...prev, category: editedCategory, priority: editedPriority, is_verified: 1 }));
      
      alert('Ticket verified successfully!');
    } catch (err) {
      console.error("Error verifying ticket", err);
      const errorMsg = `Failed to verify ticket: ${err.response?.data?.error || err.message}`;
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setIsVerifying(false);
    }
  };

  const verifiedCount = tickets.filter(t => t.is_verified === 1).length;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Dark Purple */}
      <div className="w-80 bg-purple-800 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-purple-700">
          <div className="flex items-center gap-3 mb-3">
            <RiRobot2Fill className="w-8 h-8 text-purple-200" />
            <div>
              <h1 className="text-2xl font-bold text-white">ResolveAI</h1>
              <p className="text-purple-200 text-sm">Intelligent Support Triage</p>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="px-6 py-4 border-b border-purple-700">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-purple-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <RiTicketLine className="w-4 h-4 text-purple-200" />
                <span className="text-purple-200 text-xs">Total Tickets</span>
              </div>
              <div className="text-white text-xl font-bold mt-1">{tickets.length}</div>
            </div>
            <div className="bg-purple-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <RiCheckboxCircleFill className="w-4 h-4 text-green-400" />
                <span className="text-purple-200 text-xs">Verified</span>
              </div>
              <div className="text-white text-xl font-bold mt-1">{verifiedCount}</div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && tickets.length === 0 ? (
            <div className="p-6 text-center">
              <RiInboxArchiveLine className="w-12 h-12 text-purple-400 mx-auto mb-2" />
              <p className="text-purple-200">Loading tickets...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-6 text-center">
              <RiInboxArchiveLine className="w-12 h-12 text-purple-400 mx-auto mb-2" />
              <p className="text-purple-200">No tickets available</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`p-4 border-b border-purple-700 cursor-pointer transition-colors duration-150 hover:bg-purple-700 ${
                  selectedTicket?.id === ticket.id ? 'bg-purple-600 border-r-4 border-purple-300' : ''
                }`}
                onClick={() => { setSelectedTicket(ticket); setError(''); }}
              >
                <div className="flex items-start gap-2 mb-2">
                  {ticket.is_verified === 1 && (
                    <RiCheckboxCircleFill className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm font-medium truncate">
                      {ticket.sender || 'Unknown Sender'}
                    </div>
                    <div className="text-purple-200 text-sm truncate mt-1">
                      {ticket.subject || '(no subject)'}
                    </div>
                    <div className="text-purple-300 text-xs mt-1">
                      {ticket.category || 'Uncategorized'}
                    </div>
                    <div className="text-purple-300 text-xs mt-1">
                      Priority: {ticket.priority || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-slate-100 overflow-y-auto">
        {selectedTicket ? (
          <div className="p-8 max-w-5xl mx-auto">
            {/* Header Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {selectedTicket.subject || '(no subject)'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <RiUser3Line className="w-4 h-4" />
                  <span><strong>From:</strong> {selectedTicket.sender || 'Unknown Sender'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RiCalendarLine className="w-4 h-4" />
                  <span><strong>Received:</strong> {new Date(selectedTicket.created_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RiHashtag className="w-4 h-4" />
                  <span><strong>Ticket ID:</strong> {selectedTicket.id}</span>
                </div>
              </div>
            </div>

            {/* AI Analysis Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <RiBarChartBoxLine className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-800">AI Analysis</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">AI Category:</span>
                  <p className="text-gray-800 font-medium">{selectedTicket.category || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-500">AI Priority:</span>
                  <p className="text-gray-800 font-medium">{selectedTicket.priority || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Confidence:</span>
                  <p className="text-gray-800 font-medium">
                    {(selectedTicket.confidence * 100).toFixed(0)}%
                    {selectedTicket.is_verified === 1 && (
                      <span className="ml-2 text-green-600 font-semibold">(Verified ✅)</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Verification/Correction Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <RiShieldCheckLine className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-800">Verification & Correction</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="category-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Category:
                  </label>
                  <select
                    id="category-select"
                    value={editedCategory}
                    onChange={(e) => setEditedCategory(e.target.value)}
                    disabled={selectedTicket.is_verified === 1}
                    className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                  >
                    {SUPPORT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="priority-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Priority:
                  </label>
                  <select
                    id="priority-select"
                    value={editedPriority}
                    onChange={(e) => setEditedPriority(e.target.value)}
                    disabled={selectedTicket.is_verified === 1}
                    className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                  >
                    {PRIORITIES.map(pri => (
                      <option key={pri} value={pri}>{pri}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleVerification}
                disabled={isVerifying || selectedTicket.is_verified === 1}
                className={`w-full px-6 py-3 rounded-md text-white font-semibold transition-colors duration-150 ${
                  selectedTicket.is_verified === 1
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50'
                }`}
              >
                {isVerifying ? 'Verifying...' : (selectedTicket.is_verified === 1 ? 'Verified' : 'Confirm & Verify')}
              </button>
            </div>

            {/* Original Message Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <RiMailLine className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-800">Original Message</h3>
              </div>
              <div className="bg-gray-50 p-4 rounded-md border">
                <pre className="text-sm whitespace-pre-wrap break-words text-gray-700">
                  {selectedTicket.body || '(no message body)'}
                </pre>
              </div>
            </div>

            {/* AI Generated Reply Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-2 mb-4">
                <RiReplyLine className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-800">AI Generated Reply</h3>
              </div>
              <div className="bg-purple-50 p-4 rounded-md border border-purple-200">
                <pre className="text-sm whitespace-pre-wrap break-words text-gray-700">
                  {selectedTicket.solution || '(no solution generated)'}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          // Placeholder when no ticket is selected
          <div className="flex flex-col items-center justify-center h-full text-center">
            <RiChat3Line className="w-24 h-24 text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-500 mb-2">Select a Ticket</h3>
            <p className="text-gray-400">Choose a ticket from the list to view its details</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
