import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as analyticsQueries from '../database/queries/analytics'
import { handleIpcError } from '../utils/ipc-error-handler'

export function registerAnalyticsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ANALYTICS.GET_DASHBOARD, async () => {
    return handleIpcError(async () => {
      return analyticsQueries.getDashboardStats()
    })
  })

  ipcMain.handle(IPC_CHANNELS.ANALYTICS.GET_CATEGORY_STATS, async () => {
    return handleIpcError(async () => {
      return analyticsQueries.getCategoryStats()
    })
  })

  ipcMain.handle(IPC_CHANNELS.ANALYTICS.GET_TIMELINE, async (_, days: number) => {
    return handleIpcError(async () => {
      // Validate days parameter
      const validDays = Math.max(1, Math.min(days || 30, 365))
      return analyticsQueries.getTimeline(validDays)
    })
  })
}
