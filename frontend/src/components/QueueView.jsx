import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { API } from '@/App';
import { toast } from 'sonner';

const QueueView = ({ user }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ status: '', priority: '', category: '' });
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTickets();

    // Auto-refresh tickets every 30 seconds
    const refreshInterval = setInterval(() => {
      fetchTickets(true);
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [pagination.page, filters]);

  useEffect(() => {
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
  }, [tickets]);

  const fetchTickets = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.category) params.append('category', filters.category);
      
      const response = await fetch(`${API}/tickets?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      } else {
        setError('Failed to load tickets');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value === 'all' ? '' : value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1 on filter change
  };

  const handleTicketClick = (ticketId) => {
    navigate(`/dashboard/ticket/${ticketId}`);
  };

  const handleManualRefresh = () => {
    fetchTickets();
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

  if (loading && tickets.length === 0) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white" data-testid="queue-title">Agent Queue</h1>
          <p className="text-gray-400 mt-1">
            {pagination.total} total tickets • Page {pagination.page} of {pagination.totalPages}
          </p>
        </div>
        <Button
          onClick={handleManualRefresh}
          variant="outline"
          size="sm"
          disabled={refreshing}
          className="border-[#374151] text-gray-300 hover:bg-[#374151]"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={filters.status || 'all'} onValueChange={(v) => handleFilterChange('status', v)}>
          <SelectTrigger className="w-40 bg-[#1F2937] border-[#374151] text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-[#1F2937] border-[#374151]">
            <SelectItem value="all" className="text-white hover:bg-[#374151]">All Status</SelectItem>
            <SelectItem value="pending" className="text-white hover:bg-[#374151]">Pending</SelectItem>
            <SelectItem value="resolved" className="text-white hover:bg-[#374151]">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.priority || 'all'} onValueChange={(v) => handleFilterChange('priority', v)}>
          <SelectTrigger className="w-40 bg-[#1F2937] border-[#374151] text-white">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent className="bg-[#1F2937] border-[#374151]">
            <SelectItem value="all" className="text-white hover:bg-[#374151]">All Priority</SelectItem>
            <SelectItem value="High" className="text-white hover:bg-[#374151]">High</SelectItem>
            <SelectItem value="Medium" className="text-white hover:bg-[#374151]">Medium</SelectItem>
            <SelectItem value="Low" className="text-white hover:bg-[#374151]">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.category || 'all'} onValueChange={(v) => handleFilterChange('category', v)}>
          <SelectTrigger className="w-48 bg-[#1F2937] border-[#374151] text-white">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="bg-[#1F2937] border-[#374151]">
            <SelectItem value="all" className="text-white hover:bg-[#374151]">All Categories</SelectItem>
            <SelectItem value="Shipping Inquiry" className="text-white hover:bg-[#374151]">Shipping Inquiry</SelectItem>
            <SelectItem value="Return Request" className="text-white hover:bg-[#374151]">Return Request</SelectItem>
            <SelectItem value="Billing Question" className="text-white hover:bg-[#374151]">Billing Question</SelectItem>
            <SelectItem value="General Inquiry" className="text-white hover:bg-[#374151]">General Inquiry</SelectItem>
          </SelectContent>
        </Select>

        {(filters.status || filters.priority || filters.category) && (
          <Button
            onClick={() => setFilters({ status: '', priority: '', category: '' })}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            Clear Filters
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {tickets.length === 0 ? (
          <Card className="bg-[#1F2937] border-[#374151]">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400">No tickets found</p>
              {(filters.status || filters.priority || filters.category) && (
                <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
              )}
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

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-[#374151]">
          <p className="text-sm text-gray-400">
            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              variant="outline"
              size="sm"
              className="border-[#374151] text-white hover:bg-[#374151] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    variant={pagination.page === pageNum ? 'default' : 'outline'}
                    size="sm"
                    className={pagination.page === pageNum 
                      ? 'bg-[#8B5CF6] text-white' 
                      : 'border-[#374151] text-white hover:bg-[#374151]'
                    }
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            
            <Button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext}
              variant="outline"
              size="sm"
              className="border-[#374151] text-white hover:bg-[#374151] disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueView;
