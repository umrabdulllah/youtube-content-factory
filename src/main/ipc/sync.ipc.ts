import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { isSupabaseConfigured, getSupabase } from '../services/supabase'
import { getSyncService } from '../services/sync/sync-service'
import { getPendingSyncCount } from '../database/queries/sync'
import { handleIpcError } from '../utils/ipc-error-handler'
import type {
  SyncProjectStatsInput,
  LogActivityInput,
  ProjectBrowserFilters,
} from '../../shared/types'

/**
 * Helper to verify the current user is an admin
 */
async function requireAdmin(): Promise<string> {
  const supabase = getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    throw new Error('User profile not found')
  }

  if (profile.role !== 'admin') {
    throw new Error('Admin access required')
  }

  return user.id
}

export function registerSyncHandlers(): void {
  // Get current sync state
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_STATE, async () => {
    return handleIpcError(async () => {
      const syncService = getSyncService()
      return syncService.getSyncState()
    })
  })

  // Force sync now
  ipcMain.handle(IPC_CHANNELS.SYNC.SYNC_NOW, async () => {
    return handleIpcError(async () => {
      const syncService = getSyncService()
      return await syncService.syncNow()
    })
  })

  // Log activity event
  ipcMain.handle(IPC_CHANNELS.SYNC.LOG_ACTIVITY, async (_, input: LogActivityInput) => {
    return handleIpcError(async () => {
      const syncService = getSyncService()
      await syncService.logActivity(input)
      return { success: true }
    })
  })

  // Sync a project's stats
  ipcMain.handle(IPC_CHANNELS.SYNC.SYNC_PROJECT, async (_, input: SyncProjectStatsInput) => {
    return handleIpcError(async () => {
      const syncService = getSyncService()
      await syncService.syncProject(input)
      return { success: true }
    })
  })

  // Get pending sync count
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_PENDING_COUNT, async () => {
    return handleIpcError(async () => {
      return getPendingSyncCount()
    })
  })

  // =====================
  // Admin-only handlers
  // =====================

  // Get admin dashboard data
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_DASHBOARD, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      await requireAdmin()
      const syncService = getSyncService()
      return await syncService.getAdminDashboard()
    })
  })

  // Get single editor status
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_EDITOR_STATUS, async (_, editorId: string) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      await requireAdmin()
      const syncService = getSyncService()
      const allEditors = await syncService.getAllEditorStatuses()
      return allEditors.find((e) => e.editorId === editorId) || null
    })
  })

  // Get all editor statuses
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_ALL_EDITORS, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      await requireAdmin()
      const syncService = getSyncService()
      return await syncService.getAllEditorStatuses()
    })
  })

  // Get activity feed
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_ACTIVITY_FEED, async (_, limit?: number) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      await requireAdmin()
      const syncService = getSyncService()
      return await syncService.getActivityFeed(limit)
    })
  })

  // Get project stats with filters
  ipcMain.handle(
    IPC_CHANNELS.SYNC.GET_PROJECT_STATS,
    async (_, filters: ProjectBrowserFilters, page?: number, pageSize?: number) => {
      return handleIpcError(async () => {
        if (!isSupabaseConfigured()) {
          throw new Error('Supabase not configured')
        }

        await requireAdmin()
        const syncService = getSyncService()
        return await syncService.getProjectStats(filters, page, pageSize)
      })
    }
  )

  // Get daily stats
  ipcMain.handle(IPC_CHANNELS.SYNC.GET_DAILY_STATS, async (_, days?: number) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      await requireAdmin()
      const syncService = getSyncService()
      return await syncService.getDailyStats(days)
    })
  })
}
