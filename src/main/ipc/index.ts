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

export function registerAllIpcHandlers(): void {
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

  console.log('All IPC handlers registered')
}
