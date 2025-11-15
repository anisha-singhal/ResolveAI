import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, Send, Save } from 'lucide-react';
import { API } from '@/App';
import { toast } from 'sonner';

const TicketReview = ({ user }) => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editedReply, setEditedReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  const fetchTicket = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/tickets/${ticketId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTicket(data);
        setEditedReply(data.proposed_reply);
      } else {
        setError('Failed to load ticket');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: editedReply })
      });

      if (response.ok) {
        toast.success('Ticket resolved successfully!');
        navigate('/dashboard/queue');
      } else {
        toast.error('Failed to resolve ticket');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveAndSave = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/tickets/${ticketId}/resolve-and-save`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: editedReply })
      });

      if (response.ok) {
        toast.success('Ticket resolved and saved to knowledge base!');
        navigate('/dashboard/queue');
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Failed to resolve ticket');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B5CF6]" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertDescription>{error || 'Ticket not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="ticket-review">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          onClick={() => navigate('/dashboard/queue')}
          className="border-[#374151] text-white hover:bg-[#374151]"
          data-testid="back-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Queue
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white" data-testid="ticket-header">
            Ticket {ticket.ticket_number}: {ticket.subject}
          </h1>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="triage" className="w-full">
        <TabsList className="bg-[#1F2937] border border-[#374151]">
          <TabsTrigger 
            value="triage"
            className="data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white"
            data-testid="tab-triage"
          >
            AI Triage
          </TabsTrigger>
          <TabsTrigger 
            value="respond"
            className="data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white"
            data-testid="tab-respond"
          >
            Review & Respond
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Triage */}
        <TabsContent value="triage" className="space-y-6 mt-6">
          <Card className="bg-[#1F2937] border-[#374151]">
            <CardHeader>
              <CardTitle className="text-white">Customer Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-4 text-sm">
                  <span className="text-gray-400">From:</span>
                  <span className="text-white font-medium">{ticket.customer_name}</span>
                  <span className="text-gray-500">({ticket.customer_email})</span>
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <span className="text-gray-400">Subject:</span>
                  <span className="text-white font-medium">{ticket.subject}</span>
                </div>
              </div>
              <div className="p-4 bg-[#111827] rounded border border-[#374151]">
                <p className="text-gray-300 whitespace-pre-wrap">{ticket.message}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1F2937] border-[#374151]">
            <CardHeader>
              <CardTitle className="text-white">AI Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-gray-400 text-sm">Category:</span>
                  <Badge className="ml-2 bg-[#8B5CF6] text-white">{ticket.category}</Badge>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Priority:</span>
                  <Badge variant="outline" className="ml-2 border-orange-500 text-orange-400">
                    {ticket.priority}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${
                    ticket.confidence < 80 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {ticket.confidence}%
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Confidence Score</div>
                </div>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-2">Chain of Thought:</h4>
                <div className="p-4 bg-[#111827] rounded border border-[#374151]">
                  <p className="text-gray-400 text-sm italic">"{ticket.chain_of_thought}"</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Review & Respond */}
        <TabsContent value="respond" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column: Original Message */}
            <Card className="bg-[#1F2937] border-[#374151]">
              <CardHeader>
                <CardTitle className="text-white">Original Message</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="text-sm">
                    <span className="text-gray-400">From:</span>
                    <span className="text-white font-medium ml-2">{ticket.customer_name}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-400">Email:</span>
                    <span className="text-white ml-2">{ticket.customer_email}</span>
                  </div>
                </div>
                <div className="p-4 bg-[#111827] rounded border border-[#374151] max-h-96 overflow-y-auto">
                  <p className="text-gray-300 whitespace-pre-wrap">{ticket.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Proposed Reply */}
            <Card className="bg-[#1F2937] border-[#374151]">
              <CardHeader>
                <CardTitle className="text-white">Proposed Reply (Editable)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editedReply}
                  onChange={(e) => setEditedReply(e.target.value)}
                  className="min-h-[400px] bg-[#111827] border-[#374151] text-white focus:border-[#8B5CF6] focus:ring-[#8B5CF6]"
                  data-testid="reply-textarea"
                />
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Button
              onClick={handleResolve}
              disabled={submitting || !editedReply.trim()}
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
              data-testid="send-approve-button"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send & Approve
            </Button>

            {user.role === 'admin' && (
              <Button
                onClick={handleResolveAndSave}
                disabled={submitting || !editedReply.trim()}
                variant="outline"
                className="border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white"
                data-testid="send-save-kb-button"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Send & Save to KB
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TicketReview;