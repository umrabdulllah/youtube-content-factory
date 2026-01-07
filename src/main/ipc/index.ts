import type { BrowserWindow } from 'electron'
import { registerCategoriesHandlers } from './categories.ipc'
import { registerChannelsHandlers } from './channels.ipc'
import { registerProjectsHandlers } from './projects.ipc'
import { registerQueueHandlers } from './queue.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerAnalyticsHandlers } from './analytics.ipc'
import { registerFileSystemHandlers } from './filesystem.ipc'
import { registerWindowHandlers } from './window.ipc'
import { registerSearchHandlers } from './search.ipc'
import { registerAuthHandlers } from './auth.ipc'
import { registerUsersHandlers } from './users.ipc'
import { registerSyncHandlers } from './sync.ipc'
import { registerUpdaterHandlers } from './updater.ipc'
import { registerApiKeysHandlers } from './api-keys.ipc'
import { registerCloudSyncHandlers } from './cloud-sync.ipc'

let mainWindowRef: BrowserWindow | null = null

export function registerAllIpcHandlers(mainWindow?: BrowserWindow): void {
  if (mainWindow) {
    mainWindowRef = mainWindow
  }

  registerCategoriesHandlers()
  registerChannelsHandlers()
  registerProjectsHandlers()
  registerQueueHandlers()
  registerSettingsHandlers()
  registerAnalyticsHandlers()
  registerFileSystemHandlers()
  registerWindowHandlers()
  registerSearchHandlers()
  registerAuthHandlers()
  registerUsersHandlers()
  registerSyncHandlers()
  registerUpdaterHandlers()
  registerApiKeysHandlers()

  // Cloud sync needs mainWindow for events
  if (mainWindowRef) {
    registerCloudSyncHandlers(mainWindowRef)
  }

  console.log('All IPC handlers registered')
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindowRef = window
  // Re-register handlers that need window reference
  if (mainWindowRef) {
    registerCloudSyncHandlers(mainWindowRef)
  }
}
