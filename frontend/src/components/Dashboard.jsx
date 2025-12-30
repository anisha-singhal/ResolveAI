import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import QueueView from '@/components/QueueView';
import TicketReview from '@/components/TicketReview';
import Analytics from '@/components/Analytics';
import KnowledgeBase from '@/components/KnowledgeBase';
import KBRequests from '@/components/KBRequests';

const Dashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path) => {
    navigate(path);
  };

  return (
    <div className="flex min-h-screen bg-[#111827]" data-testid="dashboard">
      {/* Fixed Sidebar */}
      <Sidebar 
        user={user} 
        onLogout={onLogout}
        onNavigate={handleNavigation}
        currentPath={location.pathname}
      />

      {/* Main Content Area - Scrollable */}
      <div className="main-content-offset flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<QueueView user={user} />} />
          <Route path="/queue" element={<QueueView user={user} />} />
          <Route path="/ticket/:ticketId" element={<TicketReview user={user} />} />
          {/* Knowledge Base - visible to all users (read-only for agents) */}
          <Route path="/knowledge-base" element={<KnowledgeBase user={user} />} />
          {/* Admin only routes */}
          {user.role === 'admin' && (
            <>
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/kb-requests" element={<KBRequests />} />
            </>
          )}
        </Routes>
      </div>
    </div>
  );
};

export default Dashboard;