import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  Tv,
  ListTodo,
  Settings,
  Plus,
  ChevronRight,
  ChevronLeft,
  Users,
  LogOut,
  Activity,
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from '../ui/button'
import { useAuth } from '../../contexts/AuthContext'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const mainNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: FolderKanban, label: 'Categories', path: '/categories' },
  { icon: Tv, label: 'Channels', path: '/channels' },
  { icon: ListTodo, label: 'Queue', path: '/queue' },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-bg-surface border-r border-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* New Project Button */}
      <div className="p-3">
        <Button
          onClick={() => navigate('/projects/new')}
          className={cn(
            'w-full justify-start gap-2',
            collapsed && 'justify-center px-0'
          )}
        >
          <Plus className="w-4 h-4" />
          {!collapsed && 'New Project'}
        </Button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {mainNavItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                collapsed && 'justify-center px-0'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-border space-y-1">
        {/* Admin Only - Admin Dashboard */}
        {isAdmin && (
          <Link
            to="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              location.pathname === '/admin'
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              collapsed && 'justify-center px-0'
            )}
          >
            <Activity className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Admin Dashboard</span>}
          </Link>
        )}

        {/* Admin Only - User Management */}
        {isAdmin && (
          <Link
            to="/users"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              location.pathname === '/users'
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              collapsed && 'justify-center px-0'
            )}
          >
            <Users className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Users</span>}
          </Link>
        )}

        <Link
          to="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
            location.pathname === '/settings'
              ? 'bg-accent/10 text-accent'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
            collapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full transition-colors',
            'text-text-secondary hover:bg-red-500/10 hover:text-red-500',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full transition-colors',
            'text-text-tertiary hover:bg-bg-hover hover:text-text-secondary',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
