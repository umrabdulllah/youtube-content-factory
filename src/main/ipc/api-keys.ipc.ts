/**
 * IPC handlers for API key management
 *
 * Role-based access:
 * - Admin: Manages org-wide keys (shared with editors)
 * - Manager: Manages personal keys (isolated, no fallback)
 * - Editor: Read-only access to masked org-wide keys
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { handleIpcError } from '../utils/ipc-error-handler'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import * as apiKeysService from '../services/api-keys.service'
import type { ApiKeyType, UserRole } from '../../shared/types'

/**
 * Helper to get current user context
 */
async function getCurrentUserContext(): Promise<{ userId: string; role: UserRole }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw new Error('User profile not found')
  }

  return { userId: user.id, role: profile.role as UserRole }
}

export function registerApiKeysHandlers(): void {
  /**
   * Get all API keys
   * Admin: Returns full org-wide key values
   * Manager: Returns full personal key values
   * Editor: Returns masked org-wide values
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

      const { userId, role } = await getCurrentUserContext()

      if (role === 'admin') {
        // Admin gets full org-wide keys
        return apiKeysService.getAllKeysForAdmin()
      } else if (role === 'manager') {
        // Manager gets full personal keys
        return apiKeysService.getAllKeysForUser(userId, role)
      } else {
        // Editor gets masked org-wide keys
        return apiKeysService.getMaskedKeys()
      }
    })
  })

  /**
   * Get masked API keys (always safe for any user)
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.GET_MASKED, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return {
          anthropicApi: null,
          openaiApi: null,
          replicateApi: null,
          voiceApi: null,
        }
      }

      const { userId, role } = await getCurrentUserContext()
      return apiKeysService.getMaskedKeysForUser(userId, role)
    })
  })

  /**
   * Get API key configuration status
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.GET_STATUS, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return {
          anthropicApi: false,
          openaiApi: false,
          replicateApi: false,
          voiceApi: false,
        }
      }

      const { userId, role } = await getCurrentUserContext()
      return apiKeysService.getKeyStatusForUser(userId, role)
    })
  })

  /**
   * Set an API key
   * Admin: Sets org-wide key
   * Manager: Sets personal key
   * Editor: Not allowed
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

        const { userId, role } = await getCurrentUserContext()

        if (role === 'admin') {
          // Admin sets org-wide keys
          await apiKeysService.setApiKey(keyType, value.trim())
        } else if (role === 'manager') {
          // Manager sets personal keys
          await apiKeysService.setUserApiKey(userId, keyType, value.trim())
        } else {
          throw new Error('Only admins and managers can set API keys')
        }

        return { success: true }
      })
    }
  )

  /**
   * Delete an API key
   * Admin: Deletes org-wide key
   * Manager: Deletes personal key
   * Editor: Not allowed
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.DELETE, async (_, keyType: ApiKeyType) => {
    return handleIpcError(async () => {
      if (!keyType || typeof keyType !== 'string') {
        throw new Error('Invalid key type')
      }

      const { userId, role } = await getCurrentUserContext()

      if (role === 'admin') {
        // Admin deletes org-wide keys
        await apiKeysService.deleteApiKey(keyType)
      } else if (role === 'manager') {
        // Manager deletes personal keys
        await apiKeysService.deleteUserApiKey(userId, keyType)
      } else {
        throw new Error('Only admins and managers can delete API keys')
      }

      return { success: true }
    })
  })

  /**
   * Force refresh API keys from cloud
   */
  ipcMain.handle(IPC_CHANNELS.API_KEYS.REFRESH_CACHE, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return { success: true }
      }

      const { userId, role } = await getCurrentUserContext()

      if (role === 'manager') {
        // Manager refreshes personal keys
        await apiKeysService.refreshUserKeysFromCloud(userId)
      } else {
        // Admin/Editor refreshes org-wide keys
        await apiKeysService.refreshFromCloud()
      }

      return { success: true }
    })
  })
}
