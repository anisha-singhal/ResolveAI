import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Inbox, BarChart3, BookOpen, LogOut } from 'lucide-react';

const Sidebar = ({ user, onLogout, onNavigate, currentPath }) => {
  const isActive = (path) => currentPath.includes(path);

  return (
    <div 
      className="sidebar-fixed w-64 bg-[#3730A3] flex flex-col"
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white" data-testid="sidebar-logo">
          ResolveAI
        </h1>
      </div>

      <Separator className="bg-[#4338CA]" />

      {/* Navigation */}
      <div className="flex-1 p-4 space-y-2">
        <Button
          onClick={() => onNavigate('/dashboard/queue')}
          className={`w-full justify-start ${
            isActive('/queue') || currentPath === '/dashboard' || currentPath === '/dashboard/'
              ? 'bg-[#4338CA] hover:bg-[#4F46E5]'
              : 'bg-transparent hover:bg-[#4338CA]'
          } text-white`}
          data-testid="queue-button"
        >
          <Inbox className="mr-2 h-4 w-4" />
          Queue
        </Button>

        {user.role === 'admin' && (
          <>
            <Button
              onClick={() => onNavigate('/dashboard/analytics')}
              className={`w-full justify-start ${
                isActive('/analytics')
                  ? 'bg-[#4338CA] hover:bg-[#4F46E5]'
                  : 'bg-transparent hover:bg-[#4338CA]'
              } text-white`}
              data-testid="analytics-button"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>

            <Button
              onClick={() => onNavigate('/dashboard/knowledge-base')}
              className={`w-full justify-start ${
                isActive('/knowledge-base')
                  ? 'bg-[#4338CA] hover:bg-[#4F46E5]'
                  : 'bg-transparent hover:bg-[#4338CA]'
              } text-white`}
              data-testid="knowledge-base-button"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Knowledge Base
            </Button>
          </>
        )}
      </div>

      {/* User Profile */}
      <div className="p-4 space-y-4">
        <Separator className="bg-[#4338CA]" />
        <div className="flex items-center space-x-3" data-testid="user-profile">
          <Avatar className="h-10 w-10 bg-[#8B5CF6]">
            <AvatarFallback className="bg-[#8B5CF6] text-white font-semibold">
              {user.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{user.name}</p>
            <p className="text-xs text-gray-300 capitalize">{user.role}</p>
          </div>
        </div>
        <Button
          onClick={onLogout}
          variant="outline"
          className="w-full justify-start border-[#4338CA] text-white hover:bg-[#4338CA] hover:text-white"
          data-testid="logout-button"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;