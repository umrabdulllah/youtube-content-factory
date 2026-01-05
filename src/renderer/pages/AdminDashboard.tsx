import * as React from 'react'
import {
  Users,
  Activity,
  BarChart3,
  CheckCircle,
  FileVideo,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { EditorStatusGrid } from '../components/EditorActivityCard'
import type { AdminDashboardData, ActivityLog, ActivityEventType } from '@shared/types'

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function getEventIcon(eventType: ActivityEventType) {
  switch (eventType) {
    case 'project_created':
      return FileVideo
    case 'project_completed':
      return CheckCircle
    case 'project_failed':
      return AlertCircle
    case 'project_started':
    case 'status_changed':
      return Activity
    case 'app_opened':
    case 'app_closed':
      return Users
    default:
      return Activity
  }
}

function getEventColor(eventType: ActivityEventType): string {
  switch (eventType) {
    case 'project_created':
      return 'text-blue-400'
    case 'project_completed':
      return 'text-green-400'
    case 'project_failed':
      return 'text-red-400'
    case 'project_started':
    case 'status_changed':
      return 'text-yellow-400'
    case 'app_opened':
    case 'app_closed':
      return 'text-purple-400'
    default:
      return 'text-text-tertiary'
  }
}

function getEventLabel(eventType: ActivityEventType): string {
  const labels: Record<ActivityEventType, string> = {
    project_created: 'Created',
    project_started: 'Started',
    project_completed: 'Completed',
    project_failed: 'Failed',
    status_changed: 'Updated',
    app_opened: 'Came online',
    app_closed: 'Went offline',
    heartbeat: 'Active',
  }
  return labels[eventType] || eventType
}

export function AdminDashboard() {
  const [data, setData] = React.useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    try {
      const dashboardData = await window.api.sync.getDashboard()
      setData(dashboardData)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard'
      setError(message)
      console.error('Failed to load admin dashboard:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()

    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="w-10 h-10 text-error mb-3" />
        <p className="text-text-primary font-medium">Failed to load dashboard</p>
        <p className="text-text-secondary text-sm mt-1">{error}</p>
        <Button variant="outline" onClick={handleRefresh} className="mt-4">
          Try Again
        </Button>
      </div>
    )
  }

  // Process weekly stats for chart
  const chartData = processWeeklyStats(data?.weeklyStats || [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Admin Dashboard</h2>
          <p className="text-text-secondary text-sm mt-1">
            Monitor editor activity and project statistics
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing} size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Active Editors"
          value={data?.todayStats.activeEditors || 0}
          subtitle={`${data?.editors.length || 0} total editors`}
          icon={Users}
          color="purple"
        />
        <StatCard
          title="Projects Today"
          value={data?.todayStats.totalProjectsCreated || 0}
          subtitle="Created today"
          icon={FileVideo}
          color="blue"
        />
        <StatCard
          title="Completed Today"
          value={data?.todayStats.totalProjectsCompleted || 0}
          subtitle="Finished today"
          icon={CheckCircle}
          color="green"
        />
      </div>

      {/* Editor Status Grid */}
      <EditorStatusGrid editors={data?.editors || []} />

      {/* Charts and Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Stats Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Weekly Activity</CardTitle>
            <BarChart3 className="w-4 h-4 text-text-tertiary" />
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                  <XAxis dataKey="date" stroke="#6b6b6b" fontSize={10} />
                  <YAxis stroke="#6b6b6b" fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #2e2e2e',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    formatter={(value) => <span style={{ color: '#a0a0a0' }}>{value}</span>}
                  />
                  <Bar dataKey="created" name="Created" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60 text-text-tertiary">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No activity data yet</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Live Activity</CardTitle>
            <Clock className="w-4 h-4 text-text-tertiary" />
          </CardHeader>
          <CardContent>
            {data?.recentActivity && data.recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {data.recentActivity.slice(0, 10).map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-text-tertiary">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  subtitle: string
  icon: React.ElementType
  color: 'blue' | 'purple' | 'green'
}

function StatCard({ title, value, subtitle, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
  }

  const iconColors = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
  }

  return (
    <Card className={`bg-gradient-to-br ${colorClasses[color]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-text-secondary text-sm">{title}</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{value}</p>
            <p className="text-xs text-text-tertiary mt-1">{subtitle}</p>
          </div>
          <Icon className={`w-8 h-8 ${iconColors[color]}`} />
        </div>
      </CardContent>
    </Card>
  )
}

interface ActivityItemProps {
  activity: ActivityLog
}

function ActivityItem({ activity }: ActivityItemProps) {
  const Icon = getEventIcon(activity.eventType)
  const colorClass = getEventColor(activity.eventType)

  return (
    <div className="flex items-start gap-3 p-2 rounded-md hover:bg-bg-elevated/50 transition-colors">
      <div className={`mt-0.5 ${colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {activity.editorName || 'Unknown'}
          </span>
          <Badge variant="secondary" className="h-4 text-[10px]">
            {getEventLabel(activity.eventType)}
          </Badge>
        </div>
        {activity.projectTitle && (
          <p className="text-xs text-text-secondary truncate mt-0.5">{activity.projectTitle}</p>
        )}
        <p className="text-xs text-text-tertiary mt-0.5">{formatTimeAgo(activity.createdAt)}</p>
      </div>
    </div>
  )
}

// Helper to process weekly stats into chart format
function processWeeklyStats(
  stats: Array<{ date: string; projectsCreated: number; projectsCompleted: number }>
) {
  // Group by date
  const byDate = new Map<string, { created: number; completed: number }>()

  for (const stat of stats) {
    const existing = byDate.get(stat.date) || { created: 0, completed: 0 }
    byDate.set(stat.date, {
      created: existing.created + stat.projectsCreated,
      completed: existing.completed + stat.projectsCompleted,
    })
  }

  // Convert to array and format dates
  return Array.from(byDate.entries())
    .map(([date, data]) => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...data,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
