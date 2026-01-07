/**
 * Category/Channel Cloud Sync Service
 *
 * Handles synchronization of categories and channels between admin and editors:
 * - Admin: Push local changes to Supabase cloud
 * - Editor: Pull from cloud and replace local data
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database'
import { getSupabase, isSupabaseConfigured } from './supabase'
import { fileManager } from './file-manager'
import type {
  Category,
  Channel,
  CloudSyncVersions,
  CloudSyncStatus,
  PushAllResult,
} from '../../shared/types'

// ============================================================
// Version Checking
// ============================================================

/**
 * Get current sync versions from cloud
 */
export async function getCloudVersions(): Promise<CloudSyncVersions | null> {
  if (!isSupabaseConfigured()) return null

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sync_versions')
      .select('resource_type, version')

    if (error) throw error

    const versions: CloudSyncVersions = {
      categories: 0,
      channels: 0,
      apiKeys: 0,
    }

    for (const row of data || []) {
      if (row.resource_type === 'categories') versions.categories = row.version
      if (row.resource_type === 'channels') versions.channels = row.version
      if (row.resource_type === 'api_keys') versions.apiKeys = row.version
    }

    return versions
  } catch (error) {
    console.error('[CloudSync] Failed to get cloud versions:', error)
    return null
  }
}

/**
 * Get local sync versions
 */
export function getLocalVersions(): CloudSyncVersions {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT resource_type, cloud_version FROM cloud_sync_meta
    `).all() as Array<{ resource_type: string; cloud_version: number }>

    const versions: CloudSyncVersions = {
      categories: 0,
      channels: 0,
      apiKeys: 0,
    }

    for (const row of rows) {
      if (row.resource_type === 'categories') versions.categories = row.cloud_version
      if (row.resource_type === 'channels') versions.channels = row.cloud_version
      if (row.resource_type === 'api_keys') versions.apiKeys = row.cloud_version
    }

    return versions
  } catch (error) {
    console.error('[CloudSync] Failed to get local versions:', error)
    return { categories: 0, channels: 0, apiKeys: 0 }
  }
}

/**
 * Check if sync is needed
 */
export async function checkForUpdates(): Promise<{
  needsSync: boolean
  cloudVersions: CloudSyncVersions | null
  localVersions: CloudSyncVersions
}> {
  const cloudVersions = await getCloudVersions()
  const localVersions = getLocalVersions()

  const needsSync = cloudVersions !== null && (
    cloudVersions.categories > localVersions.categories ||
    cloudVersions.channels > localVersions.channels
  )

  return { needsSync, cloudVersions, localVersions }
}

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<CloudSyncStatus> {
  const db = getDatabase()
  const cloudVersions = await getCloudVersions()
  const localVersions = getLocalVersions()

  // Get last synced time
  const lastSyncRow = db.prepare(`
    SELECT last_synced_at FROM cloud_sync_meta
    WHERE resource_type = 'categories'
  `).get() as { last_synced_at: string | null } | undefined

  return {
    isOnline: cloudVersions !== null,
    lastSyncedAt: lastSyncRow?.last_synced_at || null,
    pendingChanges: 0, // Could track pending pushes here
    versions: cloudVersions || localVersions,
  }
}

// ============================================================
// Pull Operations (For Editors)
// ============================================================

/**
 * Pull all categories from cloud and replace local
 */
export async function pullCategories(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()
  const db = getDatabase()

  // Fetch cloud categories
  const { data: cloudCategories, error } = await supabase
    .from('cloud_categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error

  console.log(`[CloudSync] Pulling ${cloudCategories?.length || 0} categories from cloud`)

  db.transaction(() => {
    // Mark all existing as not cloud-synced
    db.prepare('UPDATE categories SET is_cloud_synced = 0').run()

    for (const cloudCat of cloudCategories || []) {
      // Check if exists locally by cloud_id
      const existing = db.prepare(
        'SELECT id, slug FROM categories WHERE cloud_id = ?'
      ).get(cloudCat.id) as { id: string; slug: string } | undefined

      if (existing) {
        // Update existing
        db.prepare(`
          UPDATE categories SET
            name = ?, slug = ?, description = ?, color = ?,
            icon = ?, sort_order = ?, updated_at = ?, is_cloud_synced = 1
          WHERE cloud_id = ?
        `).run(
          cloudCat.name,
          cloudCat.slug,
          cloudCat.description,
          cloudCat.color,
          cloudCat.icon,
          cloudCat.sort_order,
          cloudCat.updated_at,
          cloudCat.id
        )
      } else {
        // Insert new (generate local UUID, keep cloud_id reference)
        const localId = uuidv4()
        db.prepare(`
          INSERT INTO categories (id, cloud_id, name, slug, description, color, icon, sort_order, created_at, updated_at, is_cloud_synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          localId,
          cloudCat.id,
          cloudCat.name,
          cloudCat.slug,
          cloudCat.description,
          cloudCat.color,
          cloudCat.icon,
          cloudCat.sort_order,
          cloudCat.created_at,
          cloudCat.updated_at
        )

        // Create directory for new category
        try {
          fileManager.createCategoryDirectory({
            id: localId,
            name: cloudCat.name,
            slug: cloudCat.slug,
            description: cloudCat.description,
            color: cloudCat.color,
            icon: cloudCat.icon,
            sortOrder: cloudCat.sort_order,
            createdAt: cloudCat.created_at,
            updatedAt: cloudCat.updated_at,
          })
        } catch (err) {
          console.error(`[CloudSync] Failed to create directory for category ${cloudCat.name}:`, err)
        }
      }
    }

    // Delete local categories that are no longer in cloud
    const toDelete = db.prepare(
      'SELECT id, slug FROM categories WHERE is_cloud_synced = 0'
    ).all() as Array<{ id: string; slug: string }>

    for (const cat of toDelete) {
      try {
        fileManager.deleteCategoryDirectory(cat.slug)
      } catch (err) {
        console.error(`[CloudSync] Failed to delete directory for category ${cat.slug}:`, err)
      }
    }

    db.prepare('DELETE FROM categories WHERE is_cloud_synced = 0').run()

    // Update sync version
    db.prepare(`
      UPDATE cloud_sync_meta
      SET cloud_version = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories),
          last_synced_at = datetime('now')
      WHERE resource_type = 'categories'
    `).run()
  })()

  console.log('[CloudSync] Categories synced successfully')
}

/**
 * Pull all channels from cloud and replace local
 */
export async function pullChannels(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()
  const db = getDatabase()

  // Fetch cloud channels
  const { data: cloudChannels, error } = await supabase
    .from('cloud_channels')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error

  console.log(`[CloudSync] Pulling ${cloudChannels?.length || 0} channels from cloud`)

  db.transaction(() => {
    // Mark all existing as not cloud-synced
    db.prepare('UPDATE channels SET is_cloud_synced = 0').run()

    for (const cloudChan of cloudChannels || []) {
      // Find local category_id from cloud category_id
      const localCategory = db.prepare(
        'SELECT id, slug FROM categories WHERE cloud_id = ?'
      ).get(cloudChan.category_id) as { id: string; slug: string } | undefined

      if (!localCategory) {
        console.warn(`[CloudSync] Skipping channel ${cloudChan.name}: category not found`)
        continue
      }

      // Check if exists locally by cloud_id
      const existing = db.prepare(
        'SELECT id, slug, category_id FROM channels WHERE cloud_id = ?'
      ).get(cloudChan.id) as { id: string; slug: string; category_id: string } | undefined

      if (existing) {
        // Update existing
        db.prepare(`
          UPDATE channels SET
            category_id = ?, name = ?, slug = ?, description = ?,
            default_settings = ?, sort_order = ?, updated_at = ?, is_cloud_synced = 1
          WHERE cloud_id = ?
        `).run(
          localCategory.id,
          cloudChan.name,
          cloudChan.slug,
          cloudChan.description,
          JSON.stringify(cloudChan.default_settings || {}),
          cloudChan.sort_order,
          cloudChan.updated_at,
          cloudChan.id
        )
      } else {
        // Insert new
        const localId = uuidv4()
        db.prepare(`
          INSERT INTO channels (id, cloud_id, category_id, name, slug, description, default_settings, project_count, sort_order, created_at, updated_at, is_cloud_synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)
        `).run(
          localId,
          cloudChan.id,
          localCategory.id,
          cloudChan.name,
          cloudChan.slug,
          cloudChan.description,
          JSON.stringify(cloudChan.default_settings || {}),
          cloudChan.sort_order,
          cloudChan.created_at,
          cloudChan.updated_at
        )

        // Create directory for new channel
        try {
          fileManager.createChannelDirectory(
            localCategory.slug,
            {
              id: localId,
              categoryId: localCategory.id,
              name: cloudChan.name,
              slug: cloudChan.slug,
              description: cloudChan.description,
              defaultSettings: cloudChan.default_settings || {},
              projectCount: 0,
              sortOrder: cloudChan.sort_order,
              createdAt: cloudChan.created_at,
              updatedAt: cloudChan.updated_at,
            } as Channel
          )
        } catch (err) {
          console.error(`[CloudSync] Failed to create directory for channel ${cloudChan.name}:`, err)
        }
      }
    }

    // Delete local channels that are no longer in cloud
    const toDelete = db.prepare(`
      SELECT c.id, c.slug, cat.slug as category_slug
      FROM channels c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.is_cloud_synced = 0
    `).all() as Array<{ id: string; slug: string; category_slug: string }>

    for (const chan of toDelete) {
      try {
        fileManager.deleteChannelDirectory(chan.category_slug, chan.slug)
      } catch (err) {
        console.error(`[CloudSync] Failed to delete directory for channel ${chan.slug}:`, err)
      }
    }

    db.prepare('DELETE FROM channels WHERE is_cloud_synced = 0').run()

    // Update sync version
    db.prepare(`
      UPDATE cloud_sync_meta
      SET cloud_version = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM channels),
          last_synced_at = datetime('now')
      WHERE resource_type = 'channels'
    `).run()
  })()

  console.log('[CloudSync] Channels synced successfully')
}

/**
 * Pull all (categories + channels)
 */
export async function pullAll(): Promise<void> {
  await pullCategories()
  await pullChannels()
}

// ============================================================
// Push Operations (For Admin)
// ============================================================

/**
 * Push a category to cloud (Admin only)
 */
export async function pushCategory(category: Category): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()

  // Use local ID as cloud ID for admin (they're the source of truth)
  const cloudId = category.id

  const { error } = await supabase
    .from('cloud_categories')
    .upsert({
      id: cloudId,
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color,
      icon: category.icon,
      sort_order: category.sortOrder,
      updated_at: new Date().toISOString(),
    })

  if (error) throw error

  // Mark local as cloud-synced
  const db = getDatabase()
  db.prepare(`
    UPDATE categories SET cloud_id = ?, is_cloud_synced = 1 WHERE id = ?
  `).run(cloudId, category.id)

  console.log(`[CloudSync] Pushed category to cloud: ${category.name}`)
}

/**
 * Push a channel to cloud (Admin only)
 */
export async function pushChannel(channel: Channel): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()
  const db = getDatabase()

  // Get cloud category ID
  const localCategory = db.prepare(
    'SELECT cloud_id FROM categories WHERE id = ?'
  ).get(channel.categoryId) as { cloud_id: string | null } | undefined

  if (!localCategory?.cloud_id) {
    throw new Error('Category not synced to cloud yet')
  }

  const cloudId = channel.id

  const { error } = await supabase
    .from('cloud_channels')
    .upsert({
      id: cloudId,
      category_id: localCategory.cloud_id,
      name: channel.name,
      slug: channel.slug,
      description: channel.description,
      default_settings: channel.defaultSettings,
      sort_order: channel.sortOrder,
      updated_at: new Date().toISOString(),
    })

  if (error) throw error

  // Mark local as cloud-synced
  db.prepare(`
    UPDATE channels SET cloud_id = ?, is_cloud_synced = 1 WHERE id = ?
  `).run(cloudId, channel.id)

  console.log(`[CloudSync] Pushed channel to cloud: ${channel.name}`)
}

/**
 * Push all categories and channels to cloud (Admin only)
 * Pushes categories first (since channels depend on category cloud_id),
 * then channels. Non-blocking on individual failures.
 */
export async function pushAll(): Promise<PushAllResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const db = getDatabase()
  const result: PushAllResult = {
    success: true,
    categoriesPushed: 0,
    categoriesFailed: 0,
    channelsPushed: 0,
    channelsFailed: 0,
    errors: [],
  }

  // Get all categories from local DB
  const categoryRows = db.prepare(`
    SELECT * FROM categories ORDER BY sort_order ASC
  `).all() as Array<Record<string, unknown>>

  // Push categories first (channels depend on category cloud_id)
  for (const row of categoryRows) {
    const category: Category = {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      description: row.description as string | undefined,
      color: row.color as string,
      icon: row.icon as string,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }

    try {
      await pushCategory(category)
      result.categoriesPushed++
    } catch (error) {
      result.categoriesFailed++
      result.errors.push(`Category "${category.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error(`[CloudSync] Failed to push category ${category.name}:`, error)
    }
  }

  // Get all channels from local DB
  const channelRows = db.prepare(`
    SELECT * FROM channels ORDER BY sort_order ASC
  `).all() as Array<Record<string, unknown>>

  // Push channels (after categories are synced)
  for (const row of channelRows) {
    const channel: Channel = {
      id: row.id as string,
      categoryId: row.category_id as string,
      name: row.name as string,
      slug: row.slug as string,
      description: row.description as string | undefined,
      defaultSettings: JSON.parse((row.default_settings as string) || '{}'),
      projectCount: row.project_count as number,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }

    try {
      await pushChannel(channel)
      result.channelsPushed++
    } catch (error) {
      result.channelsFailed++
      result.errors.push(`Channel "${channel.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error(`[CloudSync] Failed to push channel ${channel.name}:`, error)
    }
  }

  // Set overall success based on failures
  result.success = result.categoriesFailed === 0 && result.channelsFailed === 0

  console.log(`[CloudSync] Push all complete: ${result.categoriesPushed} categories, ${result.channelsPushed} channels`)
  return result
}

/**
 * Delete a category from cloud (Admin only)
 */
export async function deleteCloudCategory(categoryId: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = getSupabase()
  const db = getDatabase()

  // Get cloud_id
  const category = db.prepare(
    'SELECT cloud_id FROM categories WHERE id = ?'
  ).get(categoryId) as { cloud_id: string | null } | undefined

  if (!category?.cloud_id) return

  const { error } = await supabase
    .from('cloud_categories')
    .delete()
    .eq('id', category.cloud_id)

  if (error) {
    console.error('[CloudSync] Failed to delete cloud category:', error)
  } else {
    console.log(`[CloudSync] Deleted category from cloud: ${categoryId}`)
  }
}

/**
 * Delete a channel from cloud (Admin only)
 */
export async function deleteCloudChannel(channelId: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = getSupabase()
  const db = getDatabase()

  // Get cloud_id
  const channel = db.prepare(
    'SELECT cloud_id FROM channels WHERE id = ?'
  ).get(channelId) as { cloud_id: string | null } | undefined

  if (!channel?.cloud_id) return

  const { error } = await supabase
    .from('cloud_channels')
    .delete()
    .eq('id', channel.cloud_id)

  if (error) {
    console.error('[CloudSync] Failed to delete cloud channel:', error)
  } else {
    console.log(`[CloudSync] Deleted channel from cloud: ${channelId}`)
  }
}

/**
 * Reorder categories in cloud (Admin only)
 */
export async function reorderCloudCategories(categoryIds: string[]): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = getSupabase()
  const db = getDatabase()

  for (let i = 0; i < categoryIds.length; i++) {
    const category = db.prepare(
      'SELECT cloud_id FROM categories WHERE id = ?'
    ).get(categoryIds[i]) as { cloud_id: string | null } | undefined

    if (category?.cloud_id) {
      await supabase
        .from('cloud_categories')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', category.cloud_id)
    }
  }

  console.log('[CloudSync] Reordered categories in cloud')
}
