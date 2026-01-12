/**
 * IPC Error Handler Utility
 * Provides consistent error handling for all IPC handlers in the main process.
 * Errors are logged and re-thrown with better messages, allowing Electron's
 * native IPC error propagation to work with the existing renderer code.
 */

/**
 * Wraps an async IPC handler function with consistent error handling.
 * Logs errors for debugging and re-throws with improved messages.
 *
 * @example
 * ipcMain.handle('channel', async (_, args) => {
 *   return handleIpcError(async () => {
 *     // handler logic
 *     return data
 *   })
 * })
 */
export async function handleIpcError<T>(handler: () => Promise<T>): Promise<T> {
  try {
    return await handler()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
    const errorCode = error instanceof Error && 'code' in error ? String(error.code) : undefined

    // Log error for debugging
    console.error('[IPC Error]', {
      message: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Re-throw with improved error for renderer
    throw new Error(errorMessage)
  }
}
