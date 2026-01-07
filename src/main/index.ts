import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeLogging, logger } from './utils/logger'
import { initializeDatabase, closeDatabase } from './database'
import { registerAllIpcHandlers } from './ipc'
import { queueManager } from './services/queue-manager'
import { initializeSupabase, cleanupSupabase } from './services/supabase'
import { initializeSyncService, cleanupSyncService } from './services/sync/sync-service'
import { initializeUpdater, cleanupUpdater } from './services/updater'

// Initialize logging as early as possible to capture all output
initializeLogging()

// ES Module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Note: electron-squirrel-startup is only needed for Windows installer shortcuts
// We'll handle this when building for production

// Disable GPU acceleration for stability
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

async function createWindow() {
  try {
    // Initialize database before creating window
    await initializeDatabase()
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  try {
    // Initialize Supabase client for auth
    initializeSupabase()
  } catch (error) {
    console.error('Failed to initialize Supabase:', error)
  }

  // Create the browser window.
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#141414',
    ...(isMac ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    } : {
      frame: true,
    }),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for better-sqlite3
    },
  })

  // Register IPC handlers (with mainWindow for handlers that need it)
  registerAllIpcHandlers(mainWindow)

  // Start the queue manager to process any pending tasks
  try {
    queueManager.start()
  } catch (error) {
    console.error('Failed to start queue manager:', error)
  }

  // Initialize sync service for stats synchronization
  try {
    await initializeSyncService(mainWindow)
  } catch (error) {
    console.error('Failed to initialize sync service:', error)
  }

  // Initialize auto-updater service
  try {
    initializeUpdater(mainWindow)
  } catch (error) {
    console.error('Failed to initialize updater:', error)
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Show window when ready (with fallback timeout)
  let windowShown = false
  mainWindow.once('ready-to-show', () => {
    if (!windowShown) {
      windowShown = true
      mainWindow?.show()
    }
  })

  // Fallback: show window after 5 seconds even if ready-to-show didn't fire
  setTimeout(() => {
    if (!windowShown && mainWindow) {
      windowShown = true
      console.warn('Forcing window show after timeout')
      mainWindow.show()
    }
  }, 5000)

  // Log renderer errors
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(createWindow)

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Stop queue manager and close database before quitting
app.on('before-quit', async () => {
  queueManager.stop()
  cleanupUpdater()
  await cleanupSyncService()
  await cleanupSupabase()
  closeDatabase()
  logger.close()
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Export for access from other modules
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
