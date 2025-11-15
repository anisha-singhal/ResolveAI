import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { API } from '@/App';
import { toast } from 'sonner';

const QueueView = ({ user }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTickets();

    // Show toast notification after 5 seconds for low confidence ticket
    const toastTimer = setTimeout(() => {
      const lowConfidenceTicket = tickets.find(t => t.confidence < 80 && t.status === 'pending');
      if (lowConfidenceTicket) {
        toast(
          `New Ticket for Review (ID: ${lowConfidenceTicket.ticket_number}) - Confidence: ${lowConfidenceTicket.confidence}%`,
          {
            description: 'Click to review this ticket',
            action: {
              label: 'Review',
              onClick: () => navigate(`/dashboard/ticket/${lowConfidenceTicket.id}`)
            },
            duration: 10000,
          }
        );
      }
    }, 5000);

    return () => clearTimeout(toastTimer);
  }, []);

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/tickets`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      } else {
        setError('Failed to load tickets');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleTicketClick = (ticketId) => {
    navigate(`/dashboard/ticket/${ticketId}`);
  };

  const getConfidenceBadge = (confidence, status) => {
    if (status === 'resolved') {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Resolved
        </Badge>
      );
    }

    if (confidence < 80) {
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
          <AlertCircle className="mr-1 h-3 w-3" />
          Review Required
        </Badge>
      );
    }

    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Auto-Resolved
      </Badge>
    );
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical':
        return 'text-red-400';
      case 'High':
        return 'text-orange-400';
      case 'Medium':
        return 'text-yellow-400';
      case 'Low':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B5CF6]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="queue-view">
      <div>
        <h1 className="text-3xl font-bold text-white" data-testid="queue-title">Agent Queue</h1>
        <p className="text-gray-400 mt-1">
          {tickets.filter(t => t.status === 'pending').length} tickets waiting for review
        </p>
      </div>

      <div className="space-y-4">
        {tickets.length === 0 ? (
          <Card className="bg-[#1F2937] border-[#374151]">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400">No tickets in queue</p>
            </CardContent>
          </Card>
        ) : (
          tickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="ticket-card bg-[#1F2937] border-[#374151] hover:border-[#8B5CF6] cursor-pointer"
              onClick={() => handleTicketClick(ticket.id)}
              data-testid={`ticket-card-${ticket.id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-[#8B5CF6] font-semibold">
                        {ticket.ticket_number}
                      </span>
                      {getConfidenceBadge(ticket.confidence, ticket.status)}
                      <Badge 
                        variant="outline" 
                        className={`border-gray-600 ${getPriorityColor(ticket.priority)}`}
                      >
                        {ticket.priority}
                      </Badge>
                      <Badge variant="outline" className="border-gray-600 text-gray-400">
                        {ticket.category}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-white">
                      {ticket.subject}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      <span className="truncate">{ticket.customer_name}</span>
                      <span>•</span>
                      <span className="truncate break-all max-w-xs">{ticket.customer_email}</span>
                    </div>
                    <p className="text-gray-400 text-sm line-clamp-2 break-words">
                      {ticket.message}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <div className="text-2xl font-bold text-white">
                      {ticket.confidence}%
                    </div>
                    <div className="text-xs text-gray-400">Confidence</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default QueueView;