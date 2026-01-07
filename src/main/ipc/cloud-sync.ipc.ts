/**
 * IPC handlers for cloud synchronization of categories and channels
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { handleIpcError } from '../utils/ipc-error-handler'
import * as cloudSyncService from '../services/category-channel-sync.service'

let mainWindow: BrowserWindow | null = null

export function registerCloudSyncHandlers(window: BrowserWindow): void {
  mainWindow = window

  /**
   * Check if cloud has updates
   */
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC.CHECK_FOR_UPDATES, async () => {
    return handleIpcError(async () => {
      return cloudSyncService.checkForUpdates()
    })
  })

  /**
   * Pull all categories and channels from cloud
   */
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC.PULL_ALL, async () => {
    return handleIpcError(async () => {
      try {
        await cloudSyncService.pullAll()

        // Notify renderer that sync is complete
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_COMPLETE)
        }

        return { success: true }
      } catch (error) {
        // Notify renderer of sync error
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_ERROR,
            error instanceof Error ? error.message : 'Sync failed'
          )
        }
        throw error
      }
    })
  })

  /**
   * Pull only categories from cloud
   */
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC.PULL_CATEGORIES, async () => {
    return handleIpcError(async () => {
      await cloudSyncService.pullCategories()
      return { success: true }
    })
  })

  /**
   * Pull only channels from cloud
   */
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC.PULL_CHANNELS, async () => {
    return handleIpcError(async () => {
      await cloudSyncService.pullChannels()
      return { success: true }
    })
  })

  /**
   * Get current sync status
   */
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC.GET_STATUS, async () => {
    return handleIpcError(async () => {
      return cloudSyncService.getSyncStatus()
    })
  })

  /**
   * Push all categories and channels to cloud (Admin only)
   */
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC.PUSH_ALL, async () => {
    return handleIpcError(async () => {
      try {
        const result = await cloudSyncService.pushAll()

        // Notify renderer that sync is complete
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_COMPLETE)
        }

        return result
      } catch (error) {
        // Notify renderer of sync error
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_ERROR,
            error instanceof Error ? error.message : 'Push failed'
          )
        }
        throw error
      }
    })
  })
}

/**
 * Emit sync complete event to renderer
 */
export function emitSyncComplete(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_COMPLETE)
  }
}

/**
 * Emit sync error event to renderer
 */
export function emitSyncError(message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_ERROR, message)
  }
}
