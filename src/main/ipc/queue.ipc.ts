import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as queueQueries from '../database/queries/queue'
import { queueManager } from '../services/queue-manager'
import { handleIpcError } from '../utils/ipc-error-handler'

export function registerQueueHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.QUEUE.GET_ALL, async () => {
    return handleIpcError(async () => {
      return queueQueries.getAllQueueTasks()
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE.GET_STATS, async () => {
    return handleIpcError(async () => {
      const concurrencyStats = queueManager.getConcurrencyStats()
      return queueQueries.getQueueStats(concurrencyStats)
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE.PAUSE, async () => {
    return handleIpcError(async () => {
      queueManager.pause()
      return { paused: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE.RESUME, async () => {
    return handleIpcError(async () => {
      queueManager.resume()
      return { paused: false }
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE.CANCEL_TASK, async (_, taskId: string) => {
    return handleIpcError(async () => {
      await queueManager.cancelTask(taskId)
      return { cancelled: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE.RETRY_TASK, async (_, taskId: string) => {
    return handleIpcError(async () => {
      queueQueries.retryTask(taskId)
      return { retried: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE.REORDER_TASK, async (_, taskId: string, newPriority: number) => {
    return handleIpcError(async () => {
      // Validate priority (0-100)
      const validPriority = Math.max(0, Math.min(newPriority, 100))
      queueQueries.updateTaskPriority(taskId, validPriority)
      return { reordered: true }
    })
  })

  // Get pause state
  ipcMain.handle(IPC_CHANNELS.QUEUE.GET_PAUSED, async () => {
    return handleIpcError(async () => {
      return queueManager.getIsPaused()
    })
  })
}
