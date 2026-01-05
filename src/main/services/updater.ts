// Auto-updater service using electron-updater
import { app, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo as ElectronUpdateInfo, ProgressInfo as ElectronProgressInfo } from 'electron-updater'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { UpdateState, UpdateInfo, ProgressInfo, CheckForUpdatesResult, DownloadResult } from '../../shared/types'

// Current update state
let updateState: UpdateState = {
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,
  currentVersion: app.getVersion(),
}

// Reference to main window for sending events
let mainWindow: BrowserWindow | null = null

// Check interval (4 hours in ms)
const CHECK_INTERVAL = 4 * 60 * 60 * 1000
let checkIntervalId: NodeJS.Timeout | null = null

// Transform electron-updater UpdateInfo to our type
function transformUpdateInfo(info: ElectronUpdateInfo): UpdateInfo {
  return {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes ?? undefined,
    releaseName: info.releaseName ?? undefined,
    files: info.files.map(f => ({
      url: f.url,
      size: f.size,
      sha512: f.sha512,
    })),
    path: info.path,
    sha512: info.sha512,
  }
}

// Transform electron-updater ProgressInfo to our type
function transformProgressInfo(info: ElectronProgressInfo): ProgressInfo {
  return {
    total: info.total,
    delta: info.delta,
    transferred: info.transferred,
    percent: info.percent,
    bytesPerSecond: info.bytesPerSecond,
  }
}

// Send state change to renderer
function sendStateChange() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.UPDATER.ON_STATE_CHANGE, updateState)
  }
}

// Update state helper
function setState(partial: Partial<UpdateState>) {
  updateState = { ...updateState, ...partial }
  sendStateChange()
}

// Configure auto-updater
function configureAutoUpdater() {
  // Disable auto download - we want manual control
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // For development, allow updates from any channel
  if (process.env.NODE_ENV === 'development') {
    autoUpdater.allowDowngrade = true
    autoUpdater.forceDevUpdateConfig = true
  }

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...')
    setState({ status: 'checking', error: null })
  })

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    console.log(`[Updater] Update available: ${info.version}`)
    const updateInfo = transformUpdateInfo(info)
    setState({ status: 'available', updateInfo })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATER.ON_UPDATE_AVAILABLE, updateInfo)
    }
  })

  autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
    console.log(`[Updater] No update available. Current: ${app.getVersion()}, Latest: ${info.version}`)
    setState({ status: 'not-available', updateInfo: transformUpdateInfo(info) })
  })

  autoUpdater.on('download-progress', (progressObj: ElectronProgressInfo) => {
    const progress = transformProgressInfo(progressObj)
    console.debug(`[Updater] Download progress: ${progress.percent.toFixed(1)}%`)
    setState({ status: 'downloading', progress })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATER.ON_DOWNLOAD_PROGRESS, progress)
    }
  })

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    console.log(`[Updater] Update downloaded: ${info.version}`)
    const updateInfo = transformUpdateInfo(info)
    setState({ status: 'downloaded', updateInfo, progress: null })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATER.ON_UPDATE_DOWNLOADED, updateInfo)
    }
  })

  autoUpdater.on('error', (err: Error) => {
    console.error(`[Updater] Error: ${err.message}`)
    setState({ status: 'error', error: err.message, progress: null })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.UPDATER.ON_ERROR, err.message)
    }
  })
}

// Initialize the updater service
export function initializeUpdater(window: BrowserWindow): void {
  mainWindow = window
  configureAutoUpdater()

  // Check for updates after 5 second delay on startup
  setTimeout(() => {
    checkForUpdates().catch(err => {
      console.error(`[Updater] Initial check failed: ${err.message}`)
    })
  }, 5000)

  // Set up periodic checks every 4 hours
  checkIntervalId = setInterval(() => {
    checkForUpdates().catch(err => {
      console.error(`[Updater] Periodic check failed: ${err.message}`)
    })
  }, CHECK_INTERVAL)

  console.log('[Updater] Service initialized')
}

// Cleanup the updater service
export function cleanupUpdater(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }
  mainWindow = null
  console.log('[Updater] Service cleaned up')
}

// Check for updates
export async function checkForUpdates(): Promise<CheckForUpdatesResult> {
  try {
    setState({ status: 'checking', error: null })
    const result = await autoUpdater.checkForUpdates()

    if (result && result.updateInfo) {
      const isAvailable = result.updateInfo.version !== app.getVersion()
      return {
        updateAvailable: isAvailable,
        updateInfo: transformUpdateInfo(result.updateInfo),
        error: null,
      }
    }

    return {
      updateAvailable: false,
      updateInfo: null,
      error: null,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    setState({ status: 'error', error: errorMessage })
    return {
      updateAvailable: false,
      updateInfo: null,
      error: errorMessage,
    }
  }
}

// Download update
export async function downloadUpdate(): Promise<DownloadResult> {
  try {
    if (updateState.status !== 'available') {
      return { success: false, error: 'No update available to download' }
    }

    setState({ status: 'downloading', progress: null })
    await autoUpdater.downloadUpdate()
    return { success: true, error: null }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Download failed'
    setState({ status: 'error', error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

// Install update (quit and install)
export function installUpdate(): void {
  if (updateState.status !== 'downloaded') {
    console.warn('[Updater] Cannot install - update not downloaded')
    return
  }

  console.log('[Updater] Installing update and restarting...')
  autoUpdater.quitAndInstall(false, true)
}

// Get current state
export function getUpdateState(): UpdateState {
  return { ...updateState }
}

// Get current version
export function getCurrentVersion(): string {
  return app.getVersion()
}
