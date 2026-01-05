import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

export function registerWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW.MINIMIZE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW.MAXIMIZE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW.CLOSE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })
}
