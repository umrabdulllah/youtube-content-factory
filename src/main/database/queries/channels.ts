import { v4 as uuid } from 'uuid'
import slugify from 'slugify'
import { getDatabase } from '../index'
import type {
  Channel,
  ChannelWithCategory,
  CreateChannelInput,
  UpdateChannelInput,
} from '../../../shared/types'

function mapRow(row: Record<string, unknown>): Channel {
  return {
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
}

function mapRowWithCategory(row: Record<string, unknown>): ChannelWithCategory {
  return {
    ...mapRow(row),
    categoryName: row.category_name as string,
    categoryColor: row.category_color as string,
  }
}

export function getAllChannels(): ChannelWithCategory[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT
      ch.*,
      c.name as category_name,
      c.color as category_color
    FROM channels ch
    JOIN categories c ON c.id = ch.category_id
    ORDER BY c.sort_order ASC, ch.sort_order ASC
  `).all() as Record<string, unknown>[]

  return rows.map(mapRowWithCategory)
}

export function getChannelById(id: string): Channel | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT * FROM channels WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined

  return row ? mapRow(row) : null
}

export function getChannelsByCategory(categoryId: string): Channel[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM channels WHERE category_id = ? ORDER BY sort_order ASC
  `).all(categoryId) as Record<string, unknown>[]

  return rows.map(mapRow)
}

/**
 * Generates a unique slug for a channel within a category.
 * Appends -2, -3, etc. if the base slug already exists.
 */
function generateUniqueChannelSlug(
  categoryId: string,
  name: string,
  excludeChannelId?: string
): string {
  const db = getDatabase()
  const baseSlug = slugify(name, { lower: true, strict: true })

  const query = excludeChannelId
    ? `SELECT slug FROM channels WHERE category_id = ? AND id != ? AND (slug = ? OR slug LIKE ?)`
    : `SELECT slug FROM channels WHERE category_id = ? AND (slug = ? OR slug LIKE ?)`

  const params = excludeChannelId
    ? [categoryId, excludeChannelId, baseSlug, `${baseSlug}-%`]
    : [categoryId, baseSlug, `${baseSlug}-%`]

  const existingSlugs = db.prepare(query).all(...params) as { slug: string }[]

  if (existingSlugs.length === 0) return baseSlug

  const slugSet = new Set(existingSlugs.map(row => row.slug))
  if (!slugSet.has(baseSlug)) return baseSlug

  let suffix = 2
  while (slugSet.has(`${baseSlug}-${suffix}`)) suffix++
  return `${baseSlug}-${suffix}`
}

export function createChannel(input: CreateChannelInput): Channel {
  const db = getDatabase()
  const id = uuid()
  const slug = generateUniqueChannelSlug(input.categoryId, input.name)
  const now = new Date().toISOString()

  // Get max sort_order within this category
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) as max_order FROM channels WHERE category_id = ?
  `).get(input.categoryId) as { max_order: number }

  db.prepare(`
    INSERT INTO channels (id, category_id, name, slug, description, default_settings, project_count, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    input.categoryId,
    input.name,
    slug,
    input.description || null,
    JSON.stringify(input.defaultSettings || {}),
    maxOrder.max_order + 1,
    now,
    now
  )

  return getChannelById(id)!
}

export function updateChannel(input: UpdateChannelInput): Channel {
  const db = getDatabase()
  const now = new Date().toISOString()

  const channel = getChannelById(input.id)
  if (!channel) {
    throw new Error(`Channel not found: ${input.id}`)
  }

  const updates: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (input.name !== undefined) {
    updates.push('name = ?')
    values.push(input.name)
    updates.push('slug = ?')
    values.push(generateUniqueChannelSlug(channel.categoryId, input.name, input.id))
  }
  if (input.description !== undefined) {
    updates.push('description = ?')
    values.push(input.description)
  }
  if (input.defaultSettings !== undefined) {
    updates.push('default_settings = ?')
    values.push(JSON.stringify(input.defaultSettings))
  }

  values.push(input.id)

  db.prepare(`
    UPDATE channels SET ${updates.join(', ')} WHERE id = ?
  `).run(...values)

  return getChannelById(input.id)!
}

export function deleteChannel(id: string): void {
  const db = getDatabase()
  db.prepare(`DELETE FROM channels WHERE id = ?`).run(id)
}
