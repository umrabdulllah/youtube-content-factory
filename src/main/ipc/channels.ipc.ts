import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as channelsQueries from '../database/queries/channels'
import type { UserContext } from '../database/queries/channels'
import * as categoriesQueries from '../database/queries/categories'
import { fileManager } from '../services/file-manager'
import { handleIpcError } from '../utils/ipc-error-handler'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import * as cloudSyncService from '../services/category-channel-sync.service'
import type { CreateChannelInput, UpdateChannelInput, UserRole } from '../../shared/types'
import { hasPermission } from '../../shared/permissions'

/**
 * Get current user context (userId and role)
 */
async function getCurrentUserContext(): Promise<UserContext | undefined> {
  if (!isSupabaseConfigured()) return undefined

  try {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return undefined

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) return undefined

    return { userId: user.id, role: profile.role as UserRole }
  } catch {
    return undefined
  }
}

/**
 * Check if current user can create/modify channels
 */
async function canManageChannels(): Promise<{ allowed: boolean; userContext?: UserContext }> {
  const userContext = await getCurrentUserContext()
  if (!userContext) {
    return { allowed: true }
  }

  const allowed = hasPermission(userContext.role, 'channels:create')
  return { allowed, userContext }
}

export function registerChannelsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CHANNELS.GET_ALL, async () => {
    return handleIpcError(async () => {
      const userContext = await getCurrentUserContext()
      return channelsQueries.getAllChannels(userContext)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.GET_BY_ID, async (_, id: string) => {
    return handleIpcError(async () => {
      return channelsQueries.getChannelById(id)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.GET_BY_CATEGORY, async (_, categoryId: string) => {
    return handleIpcError(async () => {
      return channelsQueries.getChannelsByCategory(categoryId)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.CREATE, async (_, input: CreateChannelInput) => {
    return handleIpcError(async () => {
      // Check if user can create channels (admin or manager)
      const { allowed, userContext } = await canManageChannels()
      if (!allowed) {
        throw new Error('You do not have permission to create channels')
      }

      // Validate required fields
      if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new Error('Channel name is required')
      }
      if (!input.categoryId || typeof input.categoryId !== 'string') {
        throw new Error('Category ID is required')
      }

      const channel = channelsQueries.createChannel(input, userContext)
      const category = categoriesQueries.getCategoryById(input.categoryId)

      if (category) {
        // Create channel directory on disk
        await fileManager.createChannelDirectory(category.slug, channel)
      }

      // Push to cloud for sync (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.pushChannel(channel)
        } catch (error) {
          console.error('[Channels] Failed to push to cloud:', error)
        }
      }

      return channel
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.UPDATE, async (_, input: UpdateChannelInput) => {
    return handleIpcError(async () => {
      // Check if user can update channels
      const { allowed, userContext } = await canManageChannels()
      if (!allowed) {
        throw new Error('You do not have permission to update channels')
      }

      // Validate required fields
      if (!input.id || typeof input.id !== 'string') {
        throw new Error('Channel ID is required')
      }
      if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim().length === 0)) {
        throw new Error('Channel name cannot be empty')
      }

      const oldChannel = channelsQueries.getChannelById(input.id)
      const channel = channelsQueries.updateChannel(input)

      if (oldChannel) {
        const category = categoriesQueries.getCategoryById(oldChannel.categoryId)

        if (category) {
          // If name changed, rename directory
          if (input.name && oldChannel.name !== input.name) {
            await fileManager.renameChannelDirectory(category.slug, oldChannel.slug, channel.slug)
          }

          // Update channel.json
          await fileManager.updateChannelMetadata(category.slug, channel)
        }
      }

      // Push to cloud for sync (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.pushChannel(channel)
        } catch (error) {
          console.error('[Channels] Failed to push update to cloud:', error)
        }
      }

      return channel
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.DELETE, async (_, id: string) => {
    return handleIpcError(async () => {
      // Check if user can delete channels (admin or manager)
      const { allowed, userContext } = await canManageChannels()
      if (!allowed) {
        throw new Error('You do not have permission to delete channels')
      }

      const channel = channelsQueries.getChannelById(id)

      if (channel) {
        const category = categoriesQueries.getCategoryById(channel.categoryId)

        if (category) {
          // Delete directory on disk
          await fileManager.deleteChannelDirectory(category.slug, channel.slug)
        }
      }

      // Delete from cloud (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.deleteCloudChannel(id)
        } catch (error) {
          console.error('[Channels] Failed to delete from cloud:', error)
        }
      }

      channelsQueries.deleteChannel(id)
      return { deleted: true }
    })
  })
}
