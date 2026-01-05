import { ipcMain, shell, app } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { validateFilePath } from '../utils/path-validation'
import * as settingsQueries from '../database/queries/settings'
import { getLogFilePath, getLogsDirectory } from '../utils/logger'

export function registerFileSystemHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SYSTEM.OPEN_PATH, async (_, filePath: string) => {
    // Get the configured base path to validate against
    const settings = settingsQueries.getSettings()
    const basePath = settings.basePath

    if (!basePath) {
      throw new Error('Base path not configured')
    }

    // Validate the path is within the allowed base directory
    const validation = validateFilePath(filePath, basePath)
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file path')
    }

    await shell.openPath(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.FILE_SYSTEM.GET_APP_PATH, async () => {
    return app.getPath('userData')
  })

  ipcMain.handle(IPC_CHANNELS.FILE_SYSTEM.GET_LOG_PATH, async () => {
    return getLogFilePath()
  })

  ipcMain.handle(IPC_CHANNELS.FILE_SYSTEM.OPEN_LOGS_FOLDER, async () => {
    const logsDir = getLogsDirectory()
    await shell.openPath(logsDir)
    return logsDir
  })
}
