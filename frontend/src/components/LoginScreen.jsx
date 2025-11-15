import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { API } from '@/App';

const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        onLogin(data.token, data.user);
      } else {
        setError(data.detail || 'Invalid email or password');
      }
    } catch (err) {
      setError('Failed to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="flex items-center justify-center min-h-screen bg-[#111827] fade-in"
      data-testid="login-screen"
    >
      <div className="w-full max-w-md p-8 space-y-6 bg-[#1F2937] rounded-lg shadow-2xl border border-[#374151]">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#8B5CF6]" data-testid="login-title">
            ResolveAI
          </h1>
          <p className="mt-2 text-gray-400">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-300">
              Company Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-[#111827] border-[#374151] text-white placeholder:text-gray-500 focus:border-[#8B5CF6] focus:ring-[#8B5CF6]"
              data-testid="email-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-[#111827] border-[#374151] text-white placeholder:text-gray-500 focus:border-[#8B5CF6] focus:ring-[#8B5CF6]"
              data-testid="password-input"
            />
          </div>

          {error && (
            <Alert variant="destructive" data-testid="login-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold"
            data-testid="login-button"
          >
            {loading ? 'Signing in...' : 'Login'}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-[#111827] rounded border border-[#374151]">
          <p className="text-xs text-gray-400 mb-2 font-semibold">Demo Credentials:</p>
          <div className="space-y-1 text-xs text-gray-500">
            <p><span className="text-[#8B5CF6]">Admin:</span> admin@resolveai.com / admin123</p>
            <p><span className="text-[#8B5CF6]">Agent:</span> agent@resolveai.com / agent123</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;