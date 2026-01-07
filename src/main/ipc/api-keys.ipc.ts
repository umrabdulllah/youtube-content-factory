/**
 * IPC handlers for centralized API key management
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { handleIpcError } from '../utils/ipc-error-handler'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import * as apiKeysService from '../services/api-keys.service'
import type { ApiKeyType } from '../../shared/types'

export function registerApiKeysHandlers(): void {
  /**
   * Get all API keys
   * Admin: Returns full key values
   * Editor: Returns masked values
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.GET_ALL, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        // Return empty if Supabase not configured
        return {
          anthropicApi: null,
          openaiApi: null,
          replicateApi: null,
          voiceApi: null,
        }
      }

      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      // Check user role
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
        // Admin gets full keys
        return apiKeysService.getAllKeysForAdmin()
      } else {
        // Editor gets masked keys
        return apiKeysService.getMaskedKeys()
      }
    })
  })

  /**
   * Get masked API keys (always safe for any user)
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.GET_MASKED, async () => {
    return handleIpcError(async () => {
      return apiKeysService.getMaskedKeys()
    })
  })

  /**
   * Get API key configuration status
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.GET_STATUS, async () => {
    return handleIpcError(async () => {
      return apiKeysService.getKeyStatus()
    })
  })

  /**
   * Set an API key (Admin only)
   */
  ipcMain.handle(
    IPC_CHANNELS.API_KEYS.SET,
    async (_, keyType: ApiKeyType, value: string) => {
      return handleIpcError(async () => {
        if (!keyType || typeof keyType !== 'string') {
          throw new Error('Invalid key type')
        }

        const validTypes: ApiKeyType[] = ['anthropicApi', 'openaiApi', 'replicateApi', 'voiceApi']
        if (!validTypes.includes(keyType)) {
          throw new Error(`Invalid key type: ${keyType}`)
        }

        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          throw new Error('API key value is required')
        }

        await apiKeysService.setApiKey(keyType, value.trim())
        return { success: true }
      })
    }
  )

  /**
   * Delete an API key (Admin only)
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.DELETE, async (_, keyType: ApiKeyType) => {
    return handleIpcError(async () => {
      if (!keyType || typeof keyType !== 'string') {
        throw new Error('Invalid key type')
      }

      await apiKeysService.deleteApiKey(keyType)
      return { success: true }
    })
  })

  /**
   * Force refresh API keys from cloud
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.REFRESH_CACHE, async () => {
    return handleIpcError(async () => {
      await apiKeysService.refreshFromCloud()
      return { success: true }
    })
  })
}
