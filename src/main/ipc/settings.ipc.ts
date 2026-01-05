import { ipcMain, dialog, app } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as settingsQueries from '../database/queries/settings'
import { validateBasePath } from '../utils/path-validation'
import { handleIpcError } from '../utils/ipc-error-handler'
import type { AppSettings, VoiceTemplate } from '../../shared/types'

const VOICE_API_BASE_URL = 'https://voiceapi.csv666.ru'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
    return handleIpcError(async () => {
      return settingsQueries.getSettings()
    })
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SET, async (_, settings: Partial<AppSettings>) => {
    return handleIpcError(async () => {
      // Validate basePath if it's being set
      if (settings.basePath !== undefined) {
        const validation = validateBasePath(settings.basePath)
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid base path')
        }
      }

      // Validate maxConcurrentTasks (1-10)
      if (settings.maxConcurrentTasks !== undefined) {
        if (typeof settings.maxConcurrentTasks !== 'number' ||
            settings.maxConcurrentTasks < 1 ||
            settings.maxConcurrentTasks > 10) {
          throw new Error('Max concurrent tasks must be a number between 1 and 10')
        }
      }

      settingsQueries.setSettings(settings)
      return { updated: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_VALUE, async (_, key: keyof AppSettings) => {
    return handleIpcError(async () => {
      return settingsQueries.getSettingValue(key)
    })
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SET_VALUE, async (_, key: keyof AppSettings, value: unknown) => {
    return handleIpcError(async () => {
      // Validate basePath if it's being set
      if (key === 'basePath' && typeof value === 'string') {
        const validation = validateBasePath(value)
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid base path')
        }
      }

      // Validate maxConcurrentTasks (1-10)
      if (key === 'maxConcurrentTasks') {
        if (typeof value !== 'number' || value < 1 || value > 10) {
          throw new Error('Max concurrent tasks must be a number between 1 and 10')
        }
      }

      settingsQueries.setSettingValue(key, value as AppSettings[typeof key])
      return { updated: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SELECT_DIRECTORY, async () => {
    return handleIpcError(async () => {
      const result = await dialog.showOpenDialog({
        title: 'Select Base Directory',
        defaultPath: app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select Folder',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const selectedPath = result.filePaths[0]

      // Validate the selected path
      const validation = validateBasePath(selectedPath)
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid directory selected')
      }

      return selectedPath
    })
  })

  // Fetch voice templates from the Russian TTS API
  ipcMain.handle(IPC_CHANNELS.SETTINGS.FETCH_VOICE_TEMPLATES, async (_, apiKey: string) => {
    return handleIpcError(async () => {
      if (!apiKey) {
        throw new Error('API key is required')
      }

      // Fetch templates
      const templatesResponse = await fetch(`${VOICE_API_BASE_URL}/templates`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      })

      if (!templatesResponse.ok) {
        if (templatesResponse.status === 401) {
          throw new Error('Invalid API key')
        }
        throw new Error(`Failed to fetch templates: ${templatesResponse.status}`)
      }

      const templatesData = await templatesResponse.json()

      // Map to our VoiceTemplate format
      const templates: VoiceTemplate[] = templatesData.map((t: { uuid?: string; id?: string; name: string }) => ({
        id: t.uuid || t.id || '',
        uuid: t.uuid,
        name: t.name,
      }))

      // Also fetch balance
      let balance: number | undefined
      try {
        const balanceResponse = await fetch(`${VOICE_API_BASE_URL}/balance`, {
          method: 'GET',
          headers: {
            'X-API-Key': apiKey,
          },
        })

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json()
          balance = balanceData.balance
        }
      } catch {
        // Balance fetch is optional, don't fail if it fails
        console.warn('Failed to fetch voice balance')
      }

      return { templates, balance }
    })
  })

  // Check voice API balance
  ipcMain.handle(IPC_CHANNELS.SETTINGS.CHECK_VOICE_BALANCE, async (_, apiKey: string) => {
    return handleIpcError(async () => {
      if (!apiKey) {
        throw new Error('API key is required')
      }

      const response = await fetch(`${VOICE_API_BASE_URL}/balance`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid API key')
        }
        throw new Error(`Failed to fetch balance: ${response.status}`)
      }

      const data = await response.json()
      return { balance: data.balance }
    })
  })
}
