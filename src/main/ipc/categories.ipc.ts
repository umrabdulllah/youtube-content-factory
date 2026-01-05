import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as categoriesQueries from '../database/queries/categories'
import { fileManager } from '../services/file-manager'
import { handleIpcError } from '../utils/ipc-error-handler'
import type { CreateCategoryInput, UpdateCategoryInput } from '../../shared/types'

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
      // Validate required fields
      if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new Error('Category name is required')
      }

      const category = categoriesQueries.createCategory(input)

      // Create category directory on disk
      await fileManager.createCategoryDirectory(category)

      return category
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.UPDATE, async (_, input: UpdateCategoryInput) => {
    return handleIpcError(async () => {
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

      return category
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.DELETE, async (_, id: string) => {
    return handleIpcError(async () => {
      const category = categoriesQueries.getCategoryById(id)
      if (category) {
        // Delete directory on disk
        await fileManager.deleteCategoryDirectory(category.slug)
      }

      categoriesQueries.deleteCategory(id)
      return { deleted: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES.REORDER, async (_, ids: string[]) => {
    return handleIpcError(async () => {
      // Validate ids is an array of strings
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new Error('Invalid category IDs')
      }

      categoriesQueries.reorderCategories(ids)
      return { reordered: true }
    })
  })
}
