import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

function App() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTickets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/tickets`);
      setTickets(response.data);
      setError(null);
      
      // Update selected ticket if it exists in new data
      if (selectedTicket) {
        const updated = response.data.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    } catch (err) {
      setError('Failed to fetch tickets. Please ensure the backend is running.');
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <div className="text-xl font-medium text-gray-700">Loading tickets...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-red-200">
          <div className="text-6xl mb-4 text-center">⚠️</div>
          <div className="text-xl text-red-600 font-medium">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <TicketList 
        tickets={tickets} 
        selectedTicket={selectedTicket} 
        onSelectTicket={setSelectedTicket} 
      />
      <TicketDetail 
        ticket={selectedTicket} 
        onUpdate={fetchTickets}
      />
    </div>
  );
}

function TicketList({ tickets, selectedTicket, onSelectTicket }) {
  const getPriorityColor = (priority) => {
    const colors = {
      'High': 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-md',
      'Medium': 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-md',
      'Low': 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md'
    };
    return colors[priority] || 'bg-gradient-to-r from-gray-400 to-gray-500 text-white shadow-md';
  };

  const getPriorityIcon = (priority) => {
    const icons = {
      'High': '🔥',
      'Medium': '⚡',
      'Low': '✅'
    };
    return icons[priority] || '📋';
  };

  const verifiedCount = tickets.filter(t => t.is_verified === 1).length;
  const pendingCount = tickets.length - verifiedCount;

  return (
    <div className="w-full lg:w-[400px] xl:w-[450px] bg-gradient-to-b from-slate-900 to-indigo-900 overflow-y-auto shadow-2xl">
      {/* Enhanced Header */}
      <div className="p-6 lg:p-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 sticky top-0 z-20 shadow-2xl border-b-4 border-white/20">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="bg-white/30 p-3 rounded-2xl backdrop-blur-md shadow-xl">
              <span className="text-4xl">🤖</span>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">ResolveAI</h1>
            <p className="text-purple-200 text-sm font-medium mt-0.5">AI-Powered Support Triage</p>
          </div>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg">
            <div className="text-xs font-semibold text-purple-200 mb-1">Total</div>
            <div className="text-2xl font-black text-white">{tickets.length}</div>
          </div>
          <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg">
            <div className="text-xs font-semibold text-green-200 mb-1">Verified</div>
            <div className="text-2xl font-black text-white">{verifiedCount}</div>
          </div>
          <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg">
            <div className="text-xs font-semibold text-amber-200 mb-1">Pending</div>
            <div className="text-2xl font-black text-white">{pendingCount}</div>
          </div>
        </div>
      </div>
      
      {/* Tickets List */}
      <div className="p-3 lg:p-4 space-y-3">
        {tickets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-white/5 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4">
              <span className="text-6xl">📭</span>
            </div>
            <p className="text-white/60 font-semibold text-lg">No tickets available</p>
            <p className="text-white/40 text-sm mt-2">New tickets will appear here</p>
          </div>
        ) : (
          tickets.map((ticket, index) => (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket(ticket)}
              style={{ animationDelay: `${index * 0.05}s` }}
              className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-300 animate-[slideIn_0.5s_ease-out_forwards] opacity-0 ${
                selectedTicket?.id === ticket.id 
                  ? 'bg-gradient-to-br from-white to-purple-50 shadow-2xl scale-[1.02] ring-4 ring-purple-400/50' 
                  : 'bg-white/10 backdrop-blur-md hover:bg-white/20 hover:shadow-xl hover:scale-[1.01] border border-white/10'
              }`}
            >
              {/* Glow Effect for Selected */}
              {selectedTicket?.id === ticket.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur-xl"></div>
              )}
              
              <div className="relative">
                {/* Header Row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg ${
                        selectedTicket?.id === ticket.id 
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600' 
                          : 'bg-gradient-to-br from-slate-600 to-slate-700'
                      }`}>
                        {ticket.sender_email.charAt(0).toUpperCase()}
                      </div>
                      {ticket.is_verified === 1 && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                          <span className="text-white text-xs font-bold">✓</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${
                        selectedTicket?.id === ticket.id ? 'text-gray-900' : 'text-white'
                      }`}>
                        {ticket.sender_email}
                      </p>
                      <p className={`text-xs truncate mt-0.5 ${
                        selectedTicket?.id === ticket.id ? 'text-gray-600' : 'text-white/60'
                      }`}>
                        Ticket #{ticket.id}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Subject */}
                <div className={`mb-3 p-3 rounded-lg ${
                  selectedTicket?.id === ticket.id 
                    ? 'bg-indigo-50' 
                    : 'bg-white/5'
                }`}>
                  <p className={`text-sm font-semibold line-clamp-2 ${
                    selectedTicket?.id === ticket.id ? 'text-gray-800' : 'text-white/90'
                  }`}>
                    {ticket.subject || '(no subject)'}
                  </p>
                </div>
                
                {/* Badges Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-3 py-1.5 rounded-lg font-bold shadow-md ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white'
                      : 'bg-white/20 text-white backdrop-blur-sm'
                  }`}>
                    {ticket.ai_category}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-black shadow-lg ${getPriorityColor(ticket.ai_priority)}`}>
                    <span>{getPriorityIcon(ticket.ai_priority)}</span>
                    {ticket.ai_priority}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-white/10 text-white/70'
                  }`}>
                    {(ticket.ai_confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TicketDetail({ ticket, onUpdate }) {
  const [editedCategory, setEditedCategory] = useState('');
  const [editedPriority, setEditedPriority] = useState('');
  const [verifying, setVerifying] = useState(false);

  const categories = [
    'Shipping Inquiry',
    'Return Request',
    'Billing Question',
    'General Inquiry',
    'Uncategorized'
  ];

  const priorities = ['Low', 'Medium', 'High'];

  useEffect(() => {
    if (ticket) {
      setEditedCategory(ticket.ai_category);
      setEditedPriority(ticket.ai_priority);
    }
  }, [ticket]);

  const handleVerify = async () => {
    if (!ticket) return;

    setVerifying(true);
    try {
      await axios.post(`${API_BASE_URL}/tickets/${ticket.id}/verify`, {
        category: editedCategory,
        priority: editedPriority
      });
      alert('Ticket verified successfully!');
      onUpdate();
    } catch (err) {
      alert('Failed to verify ticket. Please try again.');
      console.error('Error verifying ticket:', err);
    } finally {
      setVerifying(false);
    }
  };

  if (!ticket) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
        <div className="text-center max-w-md">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 rounded-3xl w-40 h-40 flex items-center justify-center mx-auto shadow-2xl border-4 border-white">
              <span className="text-7xl animate-bounce">📧</span>
            </div>
          </div>
          <h2 className="text-3xl lg:text-4xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            Select a Ticket
          </h2>
          <p className="text-gray-600 text-lg">Choose a ticket from the list to view its details and AI analysis</p>
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400">
            <span>←</span>
            <span>Pick any ticket on the left</span>
          </div>
        </div>
      </div>
    );
  }

  const getPriorityColor = (priority) => {
    const colors = {
      'High': 'text-red-600 font-bold',
      'Medium': 'text-amber-600 font-bold',
      'Low': 'text-emerald-600 font-bold'
    };
    return colors[priority] || 'text-gray-600 font-bold';
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      'High': 'bg-gradient-to-r from-red-500 to-pink-500',
      'Medium': 'bg-gradient-to-r from-amber-400 to-orange-400',
      'Low': 'bg-gradient-to-r from-emerald-500 to-green-500'
    };
    return badges[priority] || 'bg-gradient-to-r from-gray-400 to-gray-500';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-gradient-to-br from-gray-50 to-purple-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="relative bg-white rounded-3xl shadow-2xl p-6 lg:p-10 mb-8 border-2 border-purple-200 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white text-sm font-black rounded-full shadow-lg">
                    <span>🎫</span>
                    <span>TICKET #{ticket.id}</span>
                  </div>
                  {ticket.is_verified === 1 && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold rounded-full shadow-lg animate-pulse">
                      <span>✓</span>
                      <span>VERIFIED</span>
                    </div>
                  )}
                </div>
                <h2 className="text-3xl lg:text-4xl font-black text-gray-900 mb-6 leading-tight">
                  {ticket.subject || '(no subject)'}
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-3 rounded-xl shadow-md border border-indigo-200">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                      {ticket.sender_email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-semibold">From</div>
                      <div className="font-bold text-gray-900">{ticket.sender_email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-pink-50 px-5 py-3 rounded-xl shadow-md border border-purple-200">
                    <span className="text-2xl">🕒</span>
                    <div>
                      <div className="text-xs text-gray-500 font-semibold">Received</div>
                      <div className="font-bold text-gray-900 text-sm">{formatDate(ticket.received_at)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Analysis */}
        <div className="relative bg-gradient-to-br from-slate-900 to-indigo-900 rounded-3xl shadow-2xl p-6 lg:p-10 mb-8 border-2 border-indigo-500 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzAtMS4xLS45LTItMi0ycy0yIC45LTIgMiAuOSAyIDIgMiAyLS45IDItMnptLTIgMjJjMS4xIDAgMi0uOSAyLTJzLS45LTItMi0yLTIgLjktMiAyIC45IDIgMiAyem0xMi0xMGMxLjEgMCAyLS45IDItMnMtLjktMi0yLTItMiAuOS0yIDIgLjkgMiAyIDJ6TTEyIDMwYzEuMSAwIDItLjkgMi0ycy0uOS0yLTItMi0yIC45LTIgMiAuOSAyIDIgMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-500 p-4 rounded-2xl shadow-xl">
                  <span className="text-4xl">🤖</span>
                </div>
                <div>
                  <h3 className="text-2xl lg:text-3xl font-black text-white">AI Analysis</h3>
                  <p className="text-indigo-300 text-sm font-medium">Powered by Advanced Machine Learning</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Category Card */}
              <div className="group bg-white/10 backdrop-blur-md rounded-2xl p-6 border-2 border-white/20 shadow-xl hover:bg-white/15 transition-all duration-300 hover:scale-105">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-3 rounded-xl shadow-lg">
                    <span className="text-2xl">📂</span>
                  </div>
                  <div className="text-xs font-bold text-white/60 uppercase tracking-wider">Category</div>
                </div>
                <p className="font-black text-white text-2xl">{ticket.ai_category}</p>
              </div>
              
              {/* Priority Card */}
              <div className="group bg-white/10 backdrop-blur-md rounded-2xl p-6 border-2 border-white/20 shadow-xl hover:bg-white/15 transition-all duration-300 hover:scale-105">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-3 rounded-xl shadow-lg ${getPriorityBadge(ticket.ai_priority)}`}>
                    <span className="text-2xl">
                      {ticket.ai_priority === 'High' ? '🔥' : ticket.ai_priority === 'Medium' ? '⚡' : '✅'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white/60 uppercase tracking-wider">Priority</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-4 py-2 rounded-xl text-white text-lg font-black shadow-lg ${getPriorityBadge(ticket.ai_priority)}`}>
                    {ticket.ai_priority}
                  </span>
                </div>
              </div>
              
              {/* Confidence Card */}
              <div className="group bg-white/10 backdrop-blur-md rounded-2xl p-6 border-2 border-white/20 shadow-xl hover:bg-white/15 transition-all duration-300 hover:scale-105">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-gradient-to-br from-green-500 to-emerald-500 p-3 rounded-xl shadow-lg">
                    <span className="text-2xl">📊</span>
                  </div>
                  <div className="text-xs font-bold text-white/60 uppercase tracking-wider">Confidence</div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white text-3xl">
                      {(ticket.ai_confidence_score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="relative w-full bg-white/20 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                      className="absolute h-full bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500 rounded-full transition-all duration-1000 shadow-lg"
                      style={{ width: `${(ticket.ai_confidence_score * 100)}%` }}
                    >
                      <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Original Message */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 lg:p-8 mb-8 border-2 border-gray-200 hover:border-indigo-300 transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-3 rounded-xl shadow-lg">
              <span className="text-3xl">📨</span>
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900">Original Message</h3>
              <p className="text-sm text-gray-500 font-medium">Customer's original inquiry</p>
            </div>
          </div>
          <div className="relative bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-50 rounded-2xl p-6 border-2 border-gray-200 shadow-inner">
            <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
              ORIGINAL
            </div>
            <pre className="text-base text-gray-800 whitespace-pre-wrap font-sans leading-relaxed pt-8">
              {ticket.original_message}
            </pre>
          </div>
        </div>

        {/* AI Generated Reply */}
        <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl shadow-2xl p-6 lg:p-8 mb-8 border-2 border-indigo-400 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/20 backdrop-blur-md p-3 rounded-xl shadow-lg border border-white/30">
                <span className="text-3xl">💬</span>
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">AI Generated Reply</h3>
                <p className="text-sm text-purple-200 font-medium">Smart automated response</p>
              </div>
            </div>
            <div className="relative bg-white rounded-2xl p-6 shadow-2xl border-2 border-purple-200">
              <div className="absolute top-4 right-4 flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                <span>🤖</span>
                <span>AI GENERATED</span>
              </div>
              <pre className="text-base text-gray-800 whitespace-pre-wrap font-sans leading-relaxed pt-8">
                {ticket.ai_generated_reply}
              </pre>
            </div>
          </div>
        </div>

        {/* Verification Section */}
        <div className="relative bg-white rounded-3xl shadow-2xl p-6 lg:p-10 border-2 border-purple-300 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-8">
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-4 rounded-2xl shadow-xl">
                <span className="text-3xl">✓</span>
              </div>
              <div>
                <h3 className="text-2xl lg:text-3xl font-black text-gray-900">Verification & Correction</h3>
                <p className="text-sm text-gray-500 font-medium">Review and confirm AI predictions</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-3 uppercase tracking-wider">
                  <span className="text-xl">📂</span>
                  Category
                </label>
                <div className="relative">
                  <select
                    value={editedCategory}
                    onChange={(e) => setEditedCategory(e.target.value)}
                    disabled={ticket.is_verified === 1}
                    className="w-full px-5 py-4 border-3 border-purple-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/50 focus:border-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-gradient-to-br from-white to-purple-50 shadow-lg font-bold text-gray-900 transition-all appearance-none cursor-pointer hover:border-purple-400"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-3 uppercase tracking-wider">
                  <span className="text-xl">🎯</span>
                  Priority
                </label>
                <div className="relative">
                  <select
                    value={editedPriority}
                    onChange={(e) => setEditedPriority(e.target.value)}
                    disabled={ticket.is_verified === 1}
                    className="w-full px-5 py-4 border-3 border-purple-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/50 focus:border-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-gradient-to-br from-white to-purple-50 shadow-lg font-bold text-gray-900 transition-all appearance-none cursor-pointer hover:border-purple-400"
                  >
                    {priorities.map(pri => (
                      <option key={pri} value={pri}>{pri}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleVerify}
              disabled={ticket.is_verified === 1 || verifying}
              className={`group relative w-full py-5 px-8 rounded-2xl font-black text-xl transition-all duration-300 transform shadow-2xl overflow-hidden ${
                ticket.is_verified === 1
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white cursor-not-allowed'
                  : verifying
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white cursor-wait'
                  : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white hover:scale-[1.02] hover:shadow-3xl active:scale-[0.98]'
              }`}
            >
              {!ticket.is_verified && !verifying && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 transform -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
              )}
              {verifying && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              )}
              <span className="relative flex items-center justify-center gap-3">
                {ticket.is_verified === 1 ? (
                  <>
                    <span className="text-2xl">✓</span>
                    <span>VERIFIED</span>
                  </>
                ) : verifying ? (
                  <>
                    <span className="text-2xl animate-spin">⏳</span>
                    <span>VERIFYING...</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">✓</span>
                    <span>CONFIRM & VERIFY</span>
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

