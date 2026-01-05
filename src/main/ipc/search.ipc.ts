import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as searchQueries from '../database/queries/search'
import { handleIpcError } from '../utils/ipc-error-handler'

export function registerSearchHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SEARCH.QUERY,
    async (_, query: string, limit?: number) => {
      return handleIpcError(async () => {
        if (!query || query.trim().length === 0) {
          return {
            categories: [],
            channels: [],
            projects: [],
            total: 0,
          }
        }
        // Validate limit parameter (1-100)
        const validLimit = Math.max(1, Math.min(limit || 10, 100))
        return searchQueries.search(query.trim(), validLimit)
      })
    }
  )
}
