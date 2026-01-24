import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as categoriesQueries from '../database/queries/categories'
import type { UserContext } from '../database/queries/categories'
import { fileManager } from '../services/file-manager'
import { handleIpcError } from '../utils/ipc-error-handler'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import * as cloudSyncService from '../services/category-channel-sync.service'
import type { CreateCategoryInput, UpdateCategoryInput, UserRole } from '../../shared/types'
import { hasPermission } from '../../shared/permissions'

/**
 * Get current user context (userId and role)
 */
async function getCurrentUserContext(): Promise<UserContext | undefined> {
  if (!isSupabaseConfigured()) return undefined // No auth configured

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
 * Check if current user can create/modify categories
 */
async function canManageCategories(): Promise<{ allowed: boolean; userContext?: UserContext }> {
  const userContext = await getCurrentUserContext()
  if (!userContext) {
    // No auth = allow (backwards compatibility)
    return { allowed: true }
  }

  const allowed = hasPermission(userContext.role, 'categories:create')
  return { allowed, userContext }
}

export function registerCategoriesHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CATEGORIES.GET_ALL, async () => {
    return handleIpcError(async () => {
      const userContext = await getCurrentUserContext()
      return categoriesQueries.getAllCategories(userContext)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.GET_BY_ID, async (_, id: string) => {
    return handleIpcError(async () => {
      return categoriesQueries.getCategoryById(id)
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.CREATE, async (_, input: CreateCategoryInput) => {
    return handleIpcError(async () => {
      // Check if user can create categories (admin or manager)
      const { allowed, userContext } = await canManageCategories()
      if (!allowed) {
        throw new Error('You do not have permission to create categories')
      }

      // Validate required fields
      if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new Error('Category name is required')
      }

      const category = categoriesQueries.createCategory(input, userContext)

      // Create category directory on disk
      await fileManager.createCategoryDirectory(category)

      // Push to cloud for sync (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.pushCategory(category)
        } catch (error) {
          console.error('[Categories] Failed to push to cloud:', error)
          // Don't fail the operation if cloud sync fails
        }
      }

      return category
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.UPDATE, async (_, input: UpdateCategoryInput) => {
    return handleIpcError(async () => {
      // Check if user can update categories (admin or manager)
      const { allowed, userContext } = await canManageCategories()
      if (!allowed) {
        throw new Error('You do not have permission to update categories')
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

      // Push to cloud for sync (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.pushCategory(category)
        } catch (error) {
          console.error('[Categories] Failed to push update to cloud:', error)
        }
      }

      return category
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.DELETE, async (_, id: string) => {
    return handleIpcError(async () => {
      // Check if user can delete categories (admin or manager)
      const { allowed, userContext } = await canManageCategories()
      if (!allowed) {
        throw new Error('You do not have permission to delete categories')
      }

      const category = categoriesQueries.getCategoryById(id)
      if (category) {
        // Delete directory on disk
        await fileManager.deleteCategoryDirectory(category.slug)
      }

      // Delete from cloud (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.deleteCloudCategory(id)
        } catch (error) {
          console.error('[Categories] Failed to delete from cloud:', error)
        }
      }

      categoriesQueries.deleteCategory(id)
      return { deleted: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.REORDER, async (_, ids: string[]) => {
    return handleIpcError(async () => {
      // Check if user can reorder categories (admin or manager)
      const { allowed, userContext } = await canManageCategories()
      if (!allowed) {
        throw new Error('You do not have permission to reorder categories')
      }

      // Validate ids is an array of strings
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new Error('Invalid category IDs')
      }

      categoriesQueries.reorderCategories(ids)

      // Update order in cloud (only for org content, not manager content)
      if (!userContext || userContext.role !== 'manager') {
        try {
          await cloudSyncService.reorderCloudCategories(ids)
        } catch (error) {
          console.error('[Categories] Failed to reorder in cloud:', error)
        }
      }

      return { reordered: true }
    })
  })
}
