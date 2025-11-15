import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, TrendingUp, AlertCircle, CheckCircle2, Inbox } from 'lucide-react';
import { API } from '@/App';

const Analytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      } else {
        setError('Failed to load analytics');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
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
    <div className="p-8 space-y-6" data-testid="analytics-view">
      <div>
        <h1 className="text-3xl font-bold text-white" data-testid="analytics-title">Analytics Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of support ticket metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-[#1F2937] border-[#374151]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Tickets
            </CardTitle>
            <Inbox className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{analytics.total_tickets}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#1F2937] border-[#374151]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Pending Reviews
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-400">{analytics.pending_tickets}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#1F2937] border-[#374151]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Resolved
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">{analytics.resolved_tickets}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#1F2937] border-[#374151]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Resolution Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-[#8B5CF6]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#8B5CF6]">{analytics.resolution_rate}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#1F2937] border-[#374151]">
          <CardHeader>
            <CardTitle className="text-white">AI Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-gray-300">Low Confidence (&lt; 80%)</span>
              </div>
              <span className="text-2xl font-bold text-white">{analytics.low_confidence_tickets}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-gray-300">High Confidence (≥ 80%)</span>
              </div>
              <span className="text-2xl font-bold text-white">{analytics.high_confidence_tickets}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1F2937] border-[#374151]">
          <CardHeader>
            <CardTitle className="text-white">Average AI Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32">
              <div className="text-6xl font-bold text-[#8B5CF6]">{analytics.avg_confidence}%</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Analytics;