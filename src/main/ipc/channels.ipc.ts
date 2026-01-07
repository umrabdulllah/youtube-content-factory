import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as channelsQueries from '../database/queries/channels'
import * as categoriesQueries from '../database/queries/categories'
import { fileManager } from '../services/file-manager'
import { handleIpcError } from '../utils/ipc-error-handler'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import * as cloudSyncService from '../services/category-channel-sync.service'
import type { CreateChannelInput, UpdateChannelInput } from '../../shared/types'

/**
 * Check if current user is admin
 */
async function isCurrentUserAdmin(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true // Default to admin if no auth

  try {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    return profile?.role === 'admin'
  } catch {
    return false
  }
}

export function registerChannelsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CHANNELS.GET_ALL, async () => {
    return handleIpcError(async () => {
      return channelsQueries.getAllChannels()
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
      // Check if user is admin (only admins can create channels)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can create channels')
      }

      // Validate required fields
      if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new Error('Channel name is required')
      }
      if (!input.categoryId || typeof input.categoryId !== 'string') {
        throw new Error('Category ID is required')
      }

      const channel = channelsQueries.createChannel(input)
      const category = categoriesQueries.getCategoryById(input.categoryId)

      if (category) {
        // Create channel directory on disk
        await fileManager.createChannelDirectory(category.slug, channel)
      }

      // Push to cloud for sync with editors
      try {
        await cloudSyncService.pushChannel(channel)
      } catch (error) {
        console.error('[Channels] Failed to push to cloud:', error)
      }

      return channel
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.UPDATE, async (_, input: UpdateChannelInput) => {
    return handleIpcError(async () => {
      // Check if user is admin (only admins can update channels)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can update channels')
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

      // Push to cloud for sync with editors
      try {
        await cloudSyncService.pushChannel(channel)
      } catch (error) {
        console.error('[Channels] Failed to push update to cloud:', error)
      }

      return channel
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHANNELS.DELETE, async (_, id: string) => {
    return handleIpcError(async () => {
      // Check if user is admin (only admins can delete channels)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can delete channels')
      }

      const channel = channelsQueries.getChannelById(id)

      if (channel) {
        const category = categoriesQueries.getCategoryById(channel.categoryId)

        if (category) {
          // Delete directory on disk
          await fileManager.deleteChannelDirectory(category.slug, channel.slug)
        }
      }

      // Delete from cloud first
      try {
        await cloudSyncService.deleteCloudChannel(id)
      } catch (error) {
        console.error('[Channels] Failed to delete from cloud:', error)
      }

      channelsQueries.deleteChannel(id)
      return { deleted: true }
    })
  })
}
