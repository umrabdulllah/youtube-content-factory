// IPC handlers for auto-updater functionality
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getUpdateState,
  getCurrentVersion,
} from '../services/updater'
import { handleIpcError } from '../utils/ipc-error-handler'

export function registerUpdaterHandlers(): void {
  // Check for updates
  ipcMain.handle(IPC_CHANNELS.UPDATER.CHECK_FOR_UPDATES, async () => {
    return handleIpcError(async () => {
      return await checkForUpdates()
    })
  })

  // Download update
  ipcMain.handle(IPC_CHANNELS.UPDATER.DOWNLOAD_UPDATE, async () => {
    return handleIpcError(async () => {
      return await downloadUpdate()
    })
  })

  // Install update (quit and install)
  ipcMain.handle(IPC_CHANNELS.UPDATER.INSTALL_UPDATE, async () => {
    return handleIpcError(async () => {
      installUpdate()
      return { success: true }
    })
  })

  // Get current state
  ipcMain.handle(IPC_CHANNELS.UPDATER.GET_STATE, async () => {
    return handleIpcError(async () => {
      return getUpdateState()
    })
  })

  // Get current version
  ipcMain.handle(IPC_CHANNELS.UPDATER.GET_CURRENT_VERSION, async () => {
    return handleIpcError(async () => {
      return getCurrentVersion()
    })
  })

  console.log('Updater IPC handlers registered')
}
