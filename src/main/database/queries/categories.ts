import { v4 as uuid } from 'uuid'
import slugify from 'slugify'
import { getDatabase } from '../index'
import type {
  Category,
  CategoryWithStats,
  CreateCategoryInput,
  UpdateCategoryInput,
  UserRole,
} from '../../../shared/types'

/**
 * User context for content isolation
 * - Admin/Editor: See org content (owner_id IS NULL)
 * - Manager: See only their own content (owner_id = userId)
 */
export interface UserContext {
  userId: string
  role: UserRole
}

function mapRow(row: Record<string, unknown>): Category {
  return {
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
}

function mapRowWithStats(row: Record<string, unknown>): CategoryWithStats {
  return {
    ...mapRow(row),
    channelCount: row.channel_count as number,
    projectCount: row.project_count as number,
  }
}

/**
 * Build WHERE clause for owner_id filtering based on user role
 */
function buildOwnerFilter(userContext?: UserContext): { clause: string; params: unknown[] } {
  if (!userContext) {
    // No context = legacy behavior, show all (for backwards compatibility)
    return { clause: '', params: [] }
  }

  if (userContext.role === 'manager') {
    // Managers see only their own content
    return { clause: 'WHERE c.owner_id = ?', params: [userContext.userId] }
  } else {
    // Admin/Editor see org content (owner_id IS NULL)
    return { clause: 'WHERE c.owner_id IS NULL', params: [] }
  }
}

export function getAllCategories(userContext?: UserContext): CategoryWithStats[] {
  const db = getDatabase()
  const { clause, params } = buildOwnerFilter(userContext)

  const rows = db.prepare(`
    SELECT
      c.*,
      COUNT(DISTINCT ch.id) as channel_count,
      COUNT(DISTINCT p.id) as project_count
    FROM categories c
    LEFT JOIN channels ch ON ch.category_id = c.id
    LEFT JOIN projects p ON p.channel_id = ch.id
    ${clause}
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.created_at ASC
  `).all(...params) as Record<string, unknown>[]

  return rows.map(mapRowWithStats)
}

export function getCategoryById(id: string): Category | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT * FROM categories WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined

  return row ? mapRow(row) : null
}

/**
 * Generates a unique slug for a category (globally unique).
 * Appends -2, -3, etc. if the base slug already exists.
 */
function generateUniqueCategorySlug(
  name: string,
  excludeCategoryId?: string
): string {
  const db = getDatabase()
  const baseSlug = slugify(name, { lower: true, strict: true })

  const query = excludeCategoryId
    ? `SELECT slug FROM categories WHERE id != ? AND (slug = ? OR slug LIKE ?)`
    : `SELECT slug FROM categories WHERE slug = ? OR slug LIKE ?`

  const params = excludeCategoryId
    ? [excludeCategoryId, baseSlug, `${baseSlug}-%`]
    : [baseSlug, `${baseSlug}-%`]

  const existingSlugs = db.prepare(query).all(...params) as { slug: string }[]

  if (existingSlugs.length === 0) return baseSlug

  const slugSet = new Set(existingSlugs.map(row => row.slug))
  if (!slugSet.has(baseSlug)) return baseSlug

  let suffix = 2
  while (slugSet.has(`${baseSlug}-${suffix}`)) suffix++
  return `${baseSlug}-${suffix}`
}

export function createCategory(input: CreateCategoryInput, userContext?: UserContext): Category {
  const db = getDatabase()
  const id = uuid()
  const slug = generateUniqueCategorySlug(input.name)
  const now = new Date().toISOString()

  // Set owner_id based on role: managers own their content, others create org content
  const ownerId = userContext?.role === 'manager' ? userContext.userId : null

  // Get max sort order
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) as max_order FROM categories
  `).get() as { max_order: number }

  db.prepare(`
    INSERT INTO categories (id, name, slug, description, color, icon, sort_order, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    slug,
    input.description || null,
    input.color || '#6366f1',
    input.icon || 'folder',
    maxOrder.max_order + 1,
    ownerId,
    now,
    now
  )

  return getCategoryById(id)!
}

export function updateCategory(input: UpdateCategoryInput): Category {
  const db = getDatabase()
  const now = new Date().toISOString()

  const category = getCategoryById(input.id)
  if (!category) {
    throw new Error(`Category not found: ${input.id}`)
  }

  const updates: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (input.name !== undefined) {
    updates.push('name = ?')
    values.push(input.name)
    updates.push('slug = ?')
    values.push(generateUniqueCategorySlug(input.name, input.id))
  }
  if (input.description !== undefined) {
    updates.push('description = ?')
    values.push(input.description)
  }
  if (input.color !== undefined) {
    updates.push('color = ?')
    values.push(input.color)
  }
  if (input.icon !== undefined) {
    updates.push('icon = ?')
    values.push(input.icon)
  }
  if (input.sortOrder !== undefined) {
    updates.push('sort_order = ?')
    values.push(input.sortOrder)
  }

  values.push(input.id)

  db.prepare(`
    UPDATE categories SET ${updates.join(', ')} WHERE id = ?
  `).run(...values)

  return getCategoryById(input.id)!
}

export function deleteCategory(id: string): void {
  const db = getDatabase()
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id)
}

export function reorderCategories(ids: string[]): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?
  `)

  db.transaction(() => {
    ids.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  })()
}
