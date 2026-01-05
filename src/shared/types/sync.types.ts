// Sync types for lightweight stats synchronization between editors and Supabase

// Project status enum (mirrors local DB statuses)
export type ProjectSyncStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

// Lightweight project stats synced to cloud
export interface ProjectStats {
  id: string
  localProjectId: string
  editorId: string
  title: string
  channelName: string | null
  categoryName: string | null
  status: ProjectSyncStatus
  localCreatedAt: string
  completedAt: string | null
  syncedAt: string
}

// Activity event types
export type ActivityEventType =
  | 'project_created'
  | 'project_started'
  | 'project_completed'
  | 'project_failed'
  | 'status_changed'
  | 'app_opened'
  | 'app_closed'
  | 'heartbeat'

// Activity log entry
export interface ActivityLog {
  id: string
  editorId: string
  editorName: string | null
  eventType: ActivityEventType
  projectTitle: string | null
  projectId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

// Daily stats per editor
export interface DailyStats {
  id: string
  editorId: string
  date: string
  projectsCreated: number
  projectsCompleted: number
  projectsFailed: number
}

// Editor online status
export interface EditorStatus {
  editorId: string
  editorName: string
  isOnline: boolean
  lastActivityAt: string | null
  lastEventType: ActivityEventType | null
  currentProject: string | null
}

// Offline sync queue item
export interface SyncQueueItem {
  id: string
  eventType: 'project_stats' | 'activity_log' | 'daily_stats'
  payload: string // JSON stringified
  attempts: number
  maxAttempts: number
  createdAt: string
  lastAttemptAt: string | null
  error: string | null
}

// Sync state
export interface SyncState {
  isOnline: boolean
  lastSyncAt: string | null
  pendingItems: number
  isSyncing: boolean
}

// Input types for creating sync data
export interface SyncProjectStatsInput {
  localProjectId: string
  title: string
  channelName: string | null
  categoryName: string | null
  status: ProjectSyncStatus
  localCreatedAt: string
  completedAt: string | null
}

export interface LogActivityInput {
  eventType: ActivityEventType
  projectTitle?: string
  projectId?: string
  metadata?: Record<string, unknown>
}

// Dashboard data for admin
export interface AdminDashboardData {
  editors: EditorStatus[]
  recentActivity: ActivityLog[]
  todayStats: {
    totalProjectsCreated: number
    totalProjectsCompleted: number
    activeEditors: number
  }
  weeklyStats: DailyStats[]
}

// Project browser filters for admin
export interface ProjectBrowserFilters {
  editorId?: string
  status?: ProjectSyncStatus
  dateFrom?: string
  dateTo?: string
  search?: string
}

// Paginated project stats response
export interface PaginatedProjectStats {
  projects: ProjectStats[]
  total: number
  page: number
  pageSize: number
}

// Sync result types
export interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}
