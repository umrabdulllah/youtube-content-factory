// Hook for managing auto-updater state in the renderer
import { useState, useEffect, useCallback } from 'react'
import type { UpdateState, UpdateInfo, ProgressInfo } from '@shared/types'

export interface UseUpdaterReturn {
  state: UpdateState
  isChecking: boolean
  isDownloading: boolean
  isUpdateAvailable: boolean
  isUpdateDownloaded: boolean
  hasError: boolean
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
}

const initialState: UpdateState = {
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,
  currentVersion: '',
}

export function useUpdater(): UseUpdaterReturn {
  const [state, setState] = useState<UpdateState>(initialState)

  // Load initial state
  useEffect(() => {
    window.api.updater.getState().then(setState).catch(console.error)
  }, [])

  // Subscribe to state changes
  useEffect(() => {
    const unsubStateChange = window.api.updater.onStateChange((newState) => {
      setState(newState)
    })

    const unsubProgress = window.api.updater.onDownloadProgress((progress: ProgressInfo) => {
      setState((prev) => ({ ...prev, progress }))
    })

    const unsubAvailable = window.api.updater.onUpdateAvailable((info: UpdateInfo) => {
      setState((prev) => ({
        ...prev,
        status: 'available',
        updateInfo: info,
      }))
    })

    const unsubDownloaded = window.api.updater.onUpdateDownloaded((info: UpdateInfo) => {
      setState((prev) => ({
        ...prev,
        status: 'downloaded',
        updateInfo: info,
        progress: null,
      }))
    })

    const unsubError = window.api.updater.onError((error: string) => {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error,
        progress: null,
      }))
    })

    return () => {
      unsubStateChange()
      unsubProgress()
      unsubAvailable()
      unsubDownloaded()
      unsubError()
    }
  }, [])

  const checkForUpdates = useCallback(async () => {
    try {
      await window.api.updater.checkForUpdates()
    } catch (error) {
      console.error('Failed to check for updates:', error)
    }
  }, [])

  const downloadUpdate = useCallback(async () => {
    try {
      await window.api.updater.downloadUpdate()
    } catch (error) {
      console.error('Failed to download update:', error)
    }
  }, [])

  const installUpdate = useCallback(() => {
    window.api.updater.installUpdate().catch(console.error)
  }, [])

  return {
    state,
    isChecking: state.status === 'checking',
    isDownloading: state.status === 'downloading',
    isUpdateAvailable: state.status === 'available',
    isUpdateDownloaded: state.status === 'downloaded',
    hasError: state.status === 'error',
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  }
}
