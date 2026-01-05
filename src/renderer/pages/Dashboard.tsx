import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  Tv,
  FileVideo,
  Clock,
  CheckCircle,
  ListTodo,
  TrendingUp,
  BarChart3,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatRelativeTime } from '../lib/format'

interface DashboardStats {
  totalCategories: number
  totalChannels: number
  totalProjects: number
  completedToday: number
  inQueue: number
  recentActivity: Array<{
    id: string
    type: string
    title: string
    status: string
    timestamp: string
    channelName: string | null
    categoryName: string | null
  }>
}

interface CategoryStats {
  name: string
  count: number
  color: string
}

interface TimelineData {
  date: string
  created: number
  completed: number
}

export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [categoryStats, setCategoryStats] = React.useState<CategoryStats[]>([])
  const [timelineData, setTimelineData] = React.useState<TimelineData[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    try {
      const [dashboardData, catStats, timeline] = await Promise.all([
        window.api.analytics.getDashboard(),
        window.api.analytics.getCategoryStats(),
        window.api.analytics.getTimeline(14), // Last 14 days
      ])
      setStats(dashboardData)
      setCategoryStats(catStats)
      setTimelineData(timeline)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Welcome back</h2>
        <p className="text-text-secondary text-sm mt-1">
          Here's what's happening with your content factory
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Categories"
          value={stats?.totalCategories || 0}
          icon={FolderKanban}
          color="blue"
          onClick={() => navigate('/categories')}
        />
        <StatCard
          title="Channels"
          value={stats?.totalChannels || 0}
          icon={Tv}
          color="purple"
          onClick={() => navigate('/channels')}
        />
        <StatCard
          title="Total Projects"
          value={stats?.totalProjects || 0}
          icon={FileVideo}
          color="green"
        />
        <StatCard
          title="In Queue"
          value={stats?.inQueue || 0}
          icon={ListTodo}
          color="yellow"
          onClick={() => navigate('/queue')}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Timeline Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Activity Timeline</CardTitle>
            <BarChart3 className="w-4 h-4 text-text-tertiary" />
          </CardHeader>
          <CardContent>
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b6b6b"
                    fontSize={10}
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return `${date.getMonth() + 1}/${date.getDate()}`
                    }}
                  />
                  <YAxis stroke="#6b6b6b" fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #2e2e2e',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value)
                      return date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    formatter={(value) => (
                      <span style={{ color: '#a0a0a0' }}>{value}</span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="created"
                    name="Created"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorCreated)"
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#22c55e"
                    fillOpacity={1}
                    fill="url(#colorCompleted)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60 text-text-tertiary">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No activity data yet</p>
                  <p className="text-xs mt-1">Create projects to see activity trends</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Distribution Pie Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Projects by Category</CardTitle>
            <FolderKanban className="w-4 h-4 text-text-tertiary" />
          </CardHeader>
          <CardContent>
            {categoryStats.length > 0 && categoryStats.some(c => c.count > 0) ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={categoryStats.filter(c => c.count > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="count"
                    >
                      {categoryStats.filter(c => c.count > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #2e2e2e',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, name: string) => [`${value} projects`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {categoryStats.slice(0, 5).map((cat, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-text-secondary truncate max-w-[120px]">
                          {cat.name}
                        </span>
                      </div>
                      <span className="text-text-primary font-medium">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-60 text-text-tertiary">
                <div className="text-center">
                  <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No categories yet</p>
                  <p className="text-xs mt-1">Create categories to see distribution</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Activity Feed + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <Clock className="w-4 h-4 text-text-tertiary" />
          </CardHeader>
          <CardContent>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    onClick={() => navigate(`/projects/${activity.id}`)}
                    className="flex items-center gap-3 p-3 rounded-md bg-bg-elevated/50 hover:bg-bg-hover transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <FileVideo className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {activity.title}
                        </p>
                        <StatusBadge status={activity.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activity.categoryName && (
                          <span className="text-xs text-text-tertiary bg-bg-elevated px-1.5 py-0.5 rounded">
                            {activity.categoryName}
                          </span>
                        )}
                        {activity.channelName && (
                          <span className="text-xs text-accent/70">
                            {activity.channelName}
                          </span>
                        )}
                        <span className="text-xs text-text-tertiary">
                          {formatRelativeTime(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-text-tertiary">
                <FileVideo className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No recent activity</p>
                <p className="text-xs mt-1">Create your first project to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Today's Progress</CardTitle>
            <TrendingUp className="w-4 h-4 text-text-tertiary" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-md bg-success/10 border border-success/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-success" />
                <div>
                  <p className="text-2xl font-bold text-success">
                    {stats?.completedToday || 0}
                  </p>
                  <p className="text-xs text-text-secondary">Projects completed today</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-md bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-3">
                <ListTodo className="w-5 h-5 text-warning" />
                <div>
                  <p className="text-2xl font-bold text-warning">
                    {stats?.inQueue || 0}
                  </p>
                  <p className="text-xs text-text-secondary">Tasks in queue</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  icon: React.ElementType
  color: 'blue' | 'purple' | 'green' | 'yellow'
  onClick?: () => void
}

function StatCard({ title, value, icon: Icon, color, onClick }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
  }

  const iconColors = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
  }

  return (
    <Card
      className={`bg-gradient-to-br ${colorClasses[color]} border cursor-pointer hover:scale-[1.02] transition-transform`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-text-secondary text-sm">{title}</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{value}</p>
          </div>
          <Icon className={`w-8 h-8 ${iconColors[color]}`} />
        </div>
      </CardContent>
    </Card>
  )
}

interface StatusBadgeProps {
  status: string
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<string, { label: string; className: string }> = {
    draft: {
      label: 'Draft',
      className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    },
    queued: {
      label: 'Queued',
      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    },
    generating: {
      label: 'Processing',
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    },
    completed: {
      label: 'Completed',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
    },
    archived: {
      label: 'Archived',
      className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    },
  }

  const { label, className } = config[status] || {
    label: status,
    className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  }

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${className}`}
    >
      {label}
    </span>
  )
}
