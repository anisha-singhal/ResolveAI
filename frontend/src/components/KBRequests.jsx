import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Clock, BookOpen, User } from 'lucide-react';
import { API } from '@/App';
import { toast } from 'sonner';

const KBRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState({});

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/kb-requests?status=pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      } else {
        setError('Failed to load KB requests');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    setProcessingId(requestId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/kb-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ review_note: reviewNotes[requestId] || '' })
      });

      if (response.ok) {
        toast.success('KB request approved and saved to knowledge base!');
        setRequests(prev => prev.filter(r => r.id !== requestId));
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to approve request');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId) => {
    if (!reviewNotes[requestId]?.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setProcessingId(requestId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/kb-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ review_note: reviewNotes[requestId] })
      });

      if (response.ok) {
        toast.success('KB request rejected');
        setRequests(prev => prev.filter(r => r.id !== requestId));
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to reject request');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    } finally {
      setProcessingId(null);
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
    <div className="p-8 space-y-6" data-testid="kb-requests-view">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center">
          <Clock className="mr-3 h-8 w-8 text-amber-500" />
          KB Approval Requests
        </h1>
        <p className="text-gray-400 mt-1">
          {requests.length} pending request{requests.length !== 1 ? 's' : ''} from agents
        </p>
      </div>

      {requests.length === 0 ? (
        <Card className="bg-[#1F2937] border-[#374151]">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-400">No pending KB requests</p>
            <p className="text-gray-500 text-sm mt-2">
              All agent requests have been reviewed
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {requests.map((request) => (
            <Card
              key={request.id}
              className="bg-[#1F2937] border-[#374151]"
              data-testid={`kb-request-${request.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-white text-xl flex items-center">
                      <BookOpen className="mr-2 h-5 w-5 text-[#8B5CF6]" />
                      {request.proposed_summary || request.ticket_subject}
                    </CardTitle>
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-400">
                      <span className="flex items-center">
                        <User className="h-4 w-4 mr-1" />
                        Requested by: {request.requested_by_name}
                      </span>
                      <Badge variant="outline" className="border-gray-600 text-gray-400">
                        {request.ticket_category}
                      </Badge>
                      <span>
                        {new Date(request.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50">
                    Pending Review
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Original ticket info */}
                <div>
                  <h4 className="text-gray-400 text-sm font-semibold mb-2">Original Customer:</h4>
                  <p className="text-gray-300 text-sm">{request.ticket_sender}</p>
                </div>

                {/* Proposed resolution */}
                <div>
                  <h4 className="text-gray-400 text-sm font-semibold mb-2">Proposed KB Entry:</h4>
                  <div className="p-4 bg-[#111827] rounded border border-[#374151] max-h-48 overflow-y-auto">
                    <p className="text-gray-300 whitespace-pre-wrap text-sm">
                      {request.proposed_resolution}
                    </p>
                  </div>
                </div>

                {/* Review note input */}
                <div>
                  <h4 className="text-gray-400 text-sm font-semibold mb-2">
                    Review Note (required for rejection):
                  </h4>
                  <Textarea
                    value={reviewNotes[request.id] || ''}
                    onChange={(e) => setReviewNotes(prev => ({ ...prev, [request.id]: e.target.value }))}
                    placeholder="Add a note (optional for approval, required for rejection)..."
                    className="bg-[#111827] border-[#374151] text-white placeholder:text-gray-500 min-h-[80px]"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex justify-end space-x-4 pt-2">
                  <Button
                    onClick={() => handleReject(request.id)}
                    disabled={processingId === request.id}
                    variant="outline"
                    className="border-red-500 text-red-400 hover:bg-red-500 hover:text-white"
                  >
                    {processingId === request.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApprove(request.id)}
                    disabled={processingId === request.id}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {processingId === request.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Approve & Save to KB
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default KBRequests;

