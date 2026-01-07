import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as categoriesQueries from '../database/queries/categories'
import { fileManager } from '../services/file-manager'
import { handleIpcError } from '../utils/ipc-error-handler'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import * as cloudSyncService from '../services/category-channel-sync.service'
import type { CreateCategoryInput, UpdateCategoryInput } from '../../shared/types'

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

export function registerCategoriesHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CATEGORIES.GET_ALL, async () => {
    return handleIpcError(async () => {
      return categoriesQueries.getAllCategories()
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.GET_BY_ID, async (_, id: string) => {
    return handleIpcError(async () => {
      return categoriesQueries.getCategoryById(id)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.CREATE, async (_, input: CreateCategoryInput) => {
    return handleIpcError(async () => {
      // Check if user is admin (only admins can create categories)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can create categories')
      }

      // Validate required fields
      if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new Error('Category name is required')
      }

      const category = categoriesQueries.createCategory(input)

      // Create category directory on disk
      await fileManager.createCategoryDirectory(category)

      // Push to cloud for sync with editors
      try {
        await cloudSyncService.pushCategory(category)
      } catch (error) {
        console.error('[Categories] Failed to push to cloud:', error)
        // Don't fail the operation if cloud sync fails
      }

      return category
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.UPDATE, async (_, input: UpdateCategoryInput) => {
    return handleIpcError(async () => {
      // Check if user is admin (only admins can update categories)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can update categories')
      }

      // Validate required fields
      if (!input.id || typeof input.id !== 'string') {
        throw new Error('Category ID is required')
      }
      if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim().length === 0)) {
        throw new Error('Category name cannot be empty')
      }

      const oldCategory = categoriesQueries.getCategoryById(input.id)
      const category = categoriesQueries.updateCategory(input)

      // If name changed, rename directory
      if (oldCategory && input.name && oldCategory.name !== input.name) {
        await fileManager.renameCategoryDirectory(oldCategory.slug, category.slug)
      }

      // Update category.json
      await fileManager.updateCategoryMetadata(category)

      // Push to cloud for sync with editors
      try {
        await cloudSyncService.pushCategory(category)
      } catch (error) {
        console.error('[Categories] Failed to push update to cloud:', error)
      }

      return category
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.DELETE, async (_, id: string) => {
    return handleIpcError(async () => {
      // Check if user is admin (only admins can delete categories)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can delete categories')
      }

      const category = categoriesQueries.getCategoryById(id)
      if (category) {
        // Delete directory on disk
        await fileManager.deleteCategoryDirectory(category.slug)
      }

      // Delete from cloud first
      try {
        await cloudSyncService.deleteCloudCategory(id)
      } catch (error) {
        console.error('[Categories] Failed to delete from cloud:', error)
      }

      categoriesQueries.deleteCategory(id)
      return { deleted: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.REORDER, async (_, ids: string[]) => {
    return handleIpcError(async () => {
      // Check if user is admin (only admins can reorder categories)
      const isAdmin = await isCurrentUserAdmin()
      if (!isAdmin) {
        throw new Error('Only admins can reorder categories')
      }

      // Validate ids is an array of strings
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new Error('Invalid category IDs')
      }

      categoriesQueries.reorderCategories(ids)

      // Update order in cloud
      try {
        await cloudSyncService.reorderCloudCategories(ids)
      } catch (error) {
        console.error('[Categories] Failed to reorder in cloud:', error)
      }

      return { reordered: true }
    })
  })
}
