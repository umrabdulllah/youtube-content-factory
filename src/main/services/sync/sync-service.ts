import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { getSupabase, isSupabaseConfigured } from '../supabase'
import { getOfflineQueue, cleanupOfflineQueue } from './offline-queue'
import {
  getLastSyncTime,
  setLastSyncTime,
  getEditorId,
  setEditorId,
  getPendingSyncCount,
  markProjectSynced,
  markProjectNeedsSync,
} from '../../database/queries/sync'
import type {
  SyncState,
  SyncProjectStatsInput,
  LogActivityInput,
  ActivityEventType,
  ProjectStats,
  ActivityLog,
  EditorStatus,
  DailyStats,
  AdminDashboardData,
  ProjectBrowserFilters,
  PaginatedProjectStats,
  SyncQueueItem,
  SyncResult,
} from '../../../shared/types'

const HEARTBEAT_INTERVAL = 60000 // 60 seconds
const SYNC_INTERVAL = 30000 // 30 seconds

export class SyncService extends EventEmitter {
  private isOnline = false
  private isSyncing = false
  private heartbeatTimer: NodeJS.Timeout | null = null
  private currentUserId: string | null = null
  private mainWindow: BrowserWindow | null = null

  constructor() {
    super()
  }

  /**
   * Initialize the sync service
   */
  async initialize(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow

    if (!isSupabaseConfigured()) {
      console.log('[SyncService] Supabase not configured, sync disabled')
      return
    }

    // Check initial online status
    await this.checkOnlineStatus()

    // Start offline queue processing
    const offlineQueue = getOfflineQueue()
    offlineQueue.startPeriodicProcessing(this.processSyncItem.bind(this), SYNC_INTERVAL)

    // Setup event listeners for offline queue
    offlineQueue.on('itemSynced', () => this.emitStateChange())
    offlineQueue.on('itemFailed', () => this.emitStateChange())
    offlineQueue.on('processingStarted', () => {
      this.isSyncing = true
      this.emitStateChange()
    })
    offlineQueue.on('processingComplete', () => {
      this.isSyncing = false
      this.emitStateChange()
    })

    // Start heartbeat
    this.startHeartbeat()

    console.log('[SyncService] Initialized')
  }

  /**
   * Set the current user ID (called after login)
   */
  setCurrentUser(userId: string): void {
    this.currentUserId = userId
    setEditorId(userId)
    console.log('[SyncService] Current user set:', userId)
  }

  /**
   * Clear the current user (called after logout)
   */
  clearCurrentUser(): void {
    this.currentUserId = null
    console.log('[SyncService] Current user cleared')
  }

  /**
   * Check if we're online by pinging Supabase
   */
  private async checkOnlineStatus(): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      this.isOnline = false
      return false
    }

    try {
      const supabase = getSupabase()
      // Simple query to check connectivity
      await supabase.from('user_profiles').select('id').limit(1)
      this.isOnline = true
    } catch {
      this.isOnline = false
    }

    return this.isOnline
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return {
      isOnline: this.isOnline,
      lastSyncAt: getLastSyncTime(),
      pendingItems: getPendingSyncCount(),
      isSyncing: this.isSyncing,
    }
  }

  /**
   * Emit state change to renderer
   */
  private emitStateChange(): void {
    const state = this.getSyncState()
    this.emit('stateChange', state)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('sync:onSyncStateChange', state)
    }
  }

  /**
   * Process a single sync queue item
   */
  private async processSyncItem(item: SyncQueueItem): Promise<boolean> {
    if (!isSupabaseConfigured()) return false

    try {
      const payload = JSON.parse(item.payload)

      switch (item.eventType) {
        case 'project_stats':
          return await this.syncProjectStatsToSupabase(payload)
        case 'activity_log':
          return await this.syncActivityLogToSupabase(payload)
        case 'daily_stats':
          return await this.syncDailyStatsToSupabase(payload)
        default:
          console.warn('[SyncService] Unknown event type:', item.eventType)
          return false
      }
    } catch (error) {
      console.error('[SyncService] Error processing sync item:', error)
      throw error
    }
  }

  /**
   * Sync project stats to Supabase
   */
  private async syncProjectStatsToSupabase(
    data: SyncProjectStatsInput & { editorId: string }
  ): Promise<boolean> {
    const supabase = getSupabase()

    const { error } = await supabase.from('project_stats').upsert(
      {
        id: uuid(),
        local_project_id: data.localProjectId,
        editor_id: data.editorId,
        title: data.title,
        channel_name: data.channelName,
        category_name: data.categoryName,
        status: data.status,
        local_created_at: data.localCreatedAt,
        completed_at: data.completedAt,
        synced_at: new Date().toISOString(),
      },
      {
        onConflict: 'local_project_id,editor_id',
      }
    )

    if (error) {
      console.error('[SyncService] Error syncing project stats:', error)
      throw error
    }

    // Mark project as synced locally
    markProjectSynced(data.localProjectId, data.localProjectId, data.status)
    setLastSyncTime(new Date().toISOString())

    return true
  }

  /**
   * Sync activity log to Supabase
   */
  private async syncActivityLogToSupabase(data: {
    editorId: string
    eventType: ActivityEventType
    projectTitle?: string
    projectId?: string
    metadata?: Record<string, unknown>
    createdAt: string
  }): Promise<boolean> {
    const supabase = getSupabase()

    const { error } = await supabase.from('activity_log').insert({
      id: uuid(),
      editor_id: data.editorId,
      event_type: data.eventType,
      project_title: data.projectTitle || null,
      project_id: data.projectId || null,
      metadata: data.metadata || null,
      created_at: data.createdAt,
    })

    if (error) {
      console.error('[SyncService] Error syncing activity log:', error)
      throw error
    }

    return true
  }

  /**
   * Sync daily stats to Supabase
   */
  private async syncDailyStatsToSupabase(data: {
    editorId: string
    date: string
    projectsCreated: number
    projectsCompleted: number
    projectsFailed: number
  }): Promise<boolean> {
    const supabase = getSupabase()

    const { error } = await supabase.from('daily_stats').upsert(
      {
        id: uuid(),
        editor_id: data.editorId,
        date: data.date,
        projects_created: data.projectsCreated,
        projects_completed: data.projectsCompleted,
        projects_failed: data.projectsFailed,
      },
      {
        onConflict: 'editor_id,date',
      }
    )

    if (error) {
      console.error('[SyncService] Error syncing daily stats:', error)
      throw error
    }

    return true
  }

  // =====================
  // Public API
  // =====================

  /**
   * Sync a project's stats (called when project is created/updated)
   */
  async syncProject(input: SyncProjectStatsInput): Promise<void> {
    const editorId = this.currentUserId || getEditorId()
    if (!editorId) {
      console.warn('[SyncService] No editor ID, skipping project sync')
      return
    }

    const payload = { ...input, editorId }

    // Mark project needs sync
    markProjectNeedsSync(input.localProjectId, input.status)

    // Add to offline queue
    const offlineQueue = getOfflineQueue()
    offlineQueue.addItem('project_stats', payload)

    console.log('[SyncService] Project sync queued:', input.localProjectId)
  }

  /**
   * Log an activity event
   */
  async logActivity(input: LogActivityInput): Promise<void> {
    const editorId = this.currentUserId || getEditorId()
    if (!editorId) {
      console.warn('[SyncService] No editor ID, skipping activity log')
      return
    }

    const payload = {
      editorId,
      eventType: input.eventType,
      projectTitle: input.projectTitle,
      projectId: input.projectId,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    }

    // Add to offline queue
    const offlineQueue = getOfflineQueue()
    offlineQueue.addItem('activity_log', payload)

    console.log('[SyncService] Activity logged:', input.eventType)
  }

  /**
   * Force sync now
   */
  async syncNow(): Promise<SyncResult> {
    if (!isSupabaseConfigured()) {
      return { success: false, syncedCount: 0, failedCount: 0, errors: ['Supabase not configured'] }
    }

    // Check online status first
    const online = await this.checkOnlineStatus()
    if (!online) {
      return { success: false, syncedCount: 0, failedCount: 0, errors: ['Offline'] }
    }

    const offlineQueue = getOfflineQueue()
    const result = await offlineQueue.processQueue(this.processSyncItem.bind(this))

    return {
      success: result.failed === 0,
      syncedCount: result.success,
      failedCount: result.failed,
      errors: result.failed > 0 ? [`${result.failed} items failed to sync`] : [],
    }
  }

  // =====================
  // Heartbeat
  // =====================

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return

    const sendHeartbeat = async () => {
      const editorId = this.currentUserId || getEditorId()
      if (!editorId || !isSupabaseConfigured()) return

      try {
        const supabase = getSupabase()
        await supabase.from('activity_log').insert({
          id: uuid(),
          editor_id: editorId,
          event_type: 'heartbeat',
          created_at: new Date().toISOString(),
        })
        this.isOnline = true
      } catch {
        this.isOnline = false
      }

      this.emitStateChange()
    }

    // Send initial heartbeat
    sendHeartbeat()

    // Schedule periodic heartbeats
    this.heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // =====================
  // Admin Dashboard API
  // =====================

  /**
   * Get admin dashboard data (admin only)
   */
  async getAdminDashboard(): Promise<AdminDashboardData> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured')
    }

    const supabase = getSupabase()

    // Get all editors with their online status
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name, email')
      .eq('role', 'editor')

    // Get recent activity to determine online status
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentActivity } = await supabase
      .from('activity_log')
      .select('editor_id, event_type, project_title, created_at')
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })

    // Build editor status map
    const editorActivityMap = new Map<
      string,
      { lastActivity: string; lastEventType: string; currentProject: string | null }
    >()
    for (const activity of recentActivity || []) {
      if (!editorActivityMap.has(activity.editor_id)) {
        editorActivityMap.set(activity.editor_id, {
          lastActivity: activity.created_at,
          lastEventType: activity.event_type,
          currentProject: activity.project_title,
        })
      }
    }

    const editors: EditorStatus[] = (profiles || []).map((profile) => {
      const activity = editorActivityMap.get(profile.id)
      return {
        editorId: profile.id,
        editorName: profile.display_name || profile.email,
        isOnline: !!activity,
        lastActivityAt: activity?.lastActivity || null,
        lastEventType: (activity?.lastEventType as ActivityEventType) || null,
        currentProject: activity?.currentProject || null,
      }
    })

    // Get recent activity feed (last 50)
    const { data: activityFeed } = await supabase
      .from('activity_log')
      .select(
        `
        id,
        editor_id,
        event_type,
        project_title,
        project_id,
        metadata,
        created_at,
        user_profiles!inner(display_name, email)
      `
      )
      .neq('event_type', 'heartbeat')
      .order('created_at', { ascending: false })
      .limit(50)

    const recentActivityLogs: ActivityLog[] = (activityFeed || []).map((item) => {
      const profile = item.user_profiles as unknown as { display_name: string | null; email: string } | null
      return {
        id: item.id,
        editorId: item.editor_id,
        editorName: profile?.display_name || profile?.email || null,
        eventType: item.event_type as ActivityEventType,
        projectTitle: item.project_title,
        projectId: item.project_id,
        metadata: item.metadata as Record<string, unknown> | null,
        createdAt: item.created_at,
      }
    })

    // Get today's stats
    const today = new Date().toISOString().split('T')[0]
    const { data: todayStats } = await supabase
      .from('daily_stats')
      .select('projects_created, projects_completed')
      .eq('date', today)

    const totalProjectsCreated = (todayStats || []).reduce(
      (sum, s) => sum + (s.projects_created || 0),
      0
    )
    const totalProjectsCompleted = (todayStats || []).reduce(
      (sum, s) => sum + (s.projects_completed || 0),
      0
    )

    // Get weekly stats
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: weeklyData } = await supabase
      .from('daily_stats')
      .select('*')
      .gte('date', weekAgo)
      .order('date', { ascending: false })

    const weeklyStats: DailyStats[] = (weeklyData || []).map((row) => ({
      id: row.id,
      editorId: row.editor_id,
      date: row.date,
      projectsCreated: row.projects_created || 0,
      projectsCompleted: row.projects_completed || 0,
      projectsFailed: row.projects_failed || 0,
    }))

    return {
      editors,
      recentActivity: recentActivityLogs,
      todayStats: {
        totalProjectsCreated,
        totalProjectsCompleted,
        activeEditors: editors.filter((e) => e.isOnline).length,
      },
      weeklyStats,
    }
  }

  /**
   * Get all editor statuses (admin only)
   */
  async getAllEditorStatuses(): Promise<EditorStatus[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured')
    }

    const dashboard = await this.getAdminDashboard()
    return dashboard.editors
  }

  /**
   * Get activity feed (admin only)
   */
  async getActivityFeed(limit = 50): Promise<ActivityLog[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured')
    }

    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('activity_log')
      .select(
        `
        id,
        editor_id,
        event_type,
        project_title,
        project_id,
        metadata,
        created_at,
        user_profiles!inner(display_name, email)
      `
      )
      .neq('event_type', 'heartbeat')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    return (data || []).map((item) => {
      const profile = item.user_profiles as unknown as { display_name: string | null; email: string } | null
      return {
        id: item.id,
        editorId: item.editor_id,
        editorName: profile?.display_name || profile?.email || null,
        eventType: item.event_type as ActivityEventType,
        projectTitle: item.project_title,
        projectId: item.project_id,
        metadata: item.metadata as Record<string, unknown> | null,
        createdAt: item.created_at,
      }
    })
  }

  /**
   * Get project stats with filters (admin only)
   */
  async getProjectStats(filters: ProjectBrowserFilters, page = 1, pageSize = 20): Promise<PaginatedProjectStats> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured')
    }

    const supabase = getSupabase()

    let query = supabase.from('project_stats').select('*', { count: 'exact' })

    if (filters.editorId) {
      query = query.eq('editor_id', filters.editorId)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.dateFrom) {
      query = query.gte('local_created_at', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte('local_created_at', filters.dateTo)
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`)
    }

    const offset = (page - 1) * pageSize
    query = query.order('synced_at', { ascending: false }).range(offset, offset + pageSize - 1)

    const { data, count, error } = await query

    if (error) {
      throw error
    }

    const projects: ProjectStats[] = (data || []).map((row) => ({
      id: row.id,
      localProjectId: row.local_project_id,
      editorId: row.editor_id,
      title: row.title,
      channelName: row.channel_name,
      categoryName: row.category_name,
      status: row.status,
      localCreatedAt: row.local_created_at,
      completedAt: row.completed_at,
      syncedAt: row.synced_at,
    }))

    return {
      projects,
      total: count || 0,
      page,
      pageSize,
    }
  }

  /**
   * Get daily stats (admin only)
   */
  async getDailyStats(days = 7): Promise<DailyStats[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured')
    }

    const supabase = getSupabase()

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('daily_stats')
      .select('*')
      .gte('date', startDate)
      .order('date', { ascending: false })

    if (error) {
      throw error
    }

    return (data || []).map((row) => ({
      id: row.id,
      editorId: row.editor_id,
      date: row.date,
      projectsCreated: row.projects_created || 0,
      projectsCompleted: row.projects_completed || 0,
      projectsFailed: row.projects_failed || 0,
    }))
  }

  // =====================
  // Cleanup
  // =====================

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopHeartbeat()
    cleanupOfflineQueue()

    // Log app closed event
    const editorId = this.currentUserId || getEditorId()
    if (editorId && isSupabaseConfigured()) {
      try {
        const supabase = getSupabase()
        await supabase.from('activity_log').insert({
          id: uuid(),
          editor_id: editorId,
          event_type: 'app_closed',
          created_at: new Date().toISOString(),
        })
      } catch (error) {
        console.error('[SyncService] Error logging app_closed:', error)
      }
    }

    this.removeAllListeners()
    console.log('[SyncService] Cleaned up')
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService()
  }
  return syncServiceInstance
}

export async function initializeSyncService(mainWindow: BrowserWindow): Promise<void> {
  const service = getSyncService()
  await service.initialize(mainWindow)
}

export async function cleanupSyncService(): Promise<void> {
  if (syncServiceInstance) {
    await syncServiceInstance.cleanup()
    syncServiceInstance = null
  }
}
