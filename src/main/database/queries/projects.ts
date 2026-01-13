import { v4 as uuid } from 'uuid'
import slugify from 'slugify'
import { getDatabase } from '../index'
import type {
  Project,
  ProjectWithChannel,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
} from '../../../shared/types'

function mapRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    title: row.title as string,
    slug: row.slug as string,
    script: row.script as string | undefined,
    scriptWordCount: row.script_word_count as number,
    status: row.status as ProjectStatus,
    generationProgress: JSON.parse((row.generation_progress as string) || '{}'),
    imageCount: row.image_count as number,
    audioDurationSeconds: row.audio_duration_seconds as number | undefined,
    subtitleCount: row.subtitle_count as number,
    errorMessage: row.error_message as string | undefined,
    errorDetails: row.error_details ? JSON.parse(row.error_details as string) : undefined,
    settingsOverride: JSON.parse((row.settings_override as string) || '{}'),
    generateImages: row.generate_images === 1,
    generateAudio: row.generate_audio === 1,
    generateSubtitles: row.generate_subtitles === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    queuedAt: row.queued_at as string | undefined,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
  }
}

function mapRowWithChannel(row: Record<string, unknown>): ProjectWithChannel {
  return {
    ...mapRow(row),
    channelName: row.channel_name as string,
    categoryId: row.category_id as string,
    categoryName: row.category_name as string,
    categoryColor: row.category_color as string,
  }
}

export function getAllProjects(): ProjectWithChannel[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT
      p.*,
      ch.name as channel_name,
      c.id as category_id,
      c.name as category_name,
      c.color as category_color
    FROM projects p
    JOIN channels ch ON ch.id = p.channel_id
    JOIN categories c ON c.id = ch.category_id
    ORDER BY p.created_at DESC
  `).all() as Record<string, unknown>[]

  return rows.map(mapRowWithChannel)
}

export function getProjectById(id: string): Project | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT * FROM projects WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined

  return row ? mapRow(row) : null
}

export function getProjectsByChannel(channelId: string): Project[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM projects WHERE channel_id = ? ORDER BY created_at DESC
  `).all(channelId) as Record<string, unknown>[]

  return rows.map(mapRow)
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

/**
 * Generates a unique slug for a project within a channel.
 * Appends -2, -3, etc. if the base slug already exists.
 */
function generateUniqueSlug(
  channelId: string,
  title: string,
  excludeProjectId?: string
): string {
  const db = getDatabase()
  const baseSlug = slugify(title, { lower: true, strict: true })

  // Query existing slugs matching this pattern in the channel
  const query = excludeProjectId
    ? `SELECT slug FROM projects WHERE channel_id = ? AND id != ? AND (slug = ? OR slug LIKE ?)`
    : `SELECT slug FROM projects WHERE channel_id = ? AND (slug = ? OR slug LIKE ?)`

  const params = excludeProjectId
    ? [channelId, excludeProjectId, baseSlug, `${baseSlug}-%`]
    : [channelId, baseSlug, `${baseSlug}-%`]

  const existingSlugs = db.prepare(query).all(...params) as { slug: string }[]

  if (existingSlugs.length === 0) {
    return baseSlug
  }

  const slugSet = new Set(existingSlugs.map(row => row.slug))

  if (!slugSet.has(baseSlug)) {
    return baseSlug
  }

  // Find next available suffix
  let suffix = 2
  while (slugSet.has(`${baseSlug}-${suffix}`)) {
    suffix++
  }

  return `${baseSlug}-${suffix}`
}

export function createProject(input: CreateProjectInput): Project {
  const db = getDatabase()
  const id = uuid()
  const slug = generateUniqueSlug(input.channelId, input.title)
  const now = new Date().toISOString()
  const wordCount = input.script ? countWords(input.script) : 0

  // Use transaction to ensure atomicity of project creation and channel count update
  const createProjectTransaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO projects (
        id, channel_id, title, slug, script, script_word_count,
        status, generation_progress, settings_override,
        generate_images, generate_audio, generate_subtitles, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'draft', '{}', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.channelId,
      input.title,
      slug,
      input.script || null,
      wordCount,
      JSON.stringify(input.settingsOverride || {}),
      input.generateImages !== false ? 1 : 0,
      input.generateAudio !== false ? 1 : 0,
      input.generateSubtitles !== false ? 1 : 0,
      now,
      now
    )

    // Update channel project count within the same transaction
    db.prepare(`
      UPDATE channels SET project_count = project_count + 1, updated_at = ? WHERE id = ?
    `).run(now, input.channelId)
  })

  createProjectTransaction()

  return getProjectById(id)!
}

export function updateProject(input: UpdateProjectInput): Project {
  const db = getDatabase()
  const now = new Date().toISOString()

  const project = getProjectById(input.id)
  if (!project) {
    throw new Error(`Project not found: ${input.id}`)
  }

  const updates: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (input.title !== undefined) {
    updates.push('title = ?')
    values.push(input.title)
    updates.push('slug = ?')
    values.push(generateUniqueSlug(project.channelId, input.title, input.id))
  }
  if (input.script !== undefined) {
    updates.push('script = ?')
    values.push(input.script)
    updates.push('script_word_count = ?')
    values.push(countWords(input.script))
  }
  if (input.status !== undefined) {
    updates.push('status = ?')
    values.push(input.status)

    // Update timestamps based on status
    if (input.status === 'queued') {
      updates.push('queued_at = ?')
      values.push(now)
    } else if (input.status === 'generating') {
      updates.push('started_at = ?')
      values.push(now)
    } else if (input.status === 'completed' || input.status === 'failed') {
      updates.push('completed_at = ?')
      values.push(now)
    }
  }
  if (input.settingsOverride !== undefined) {
    updates.push('settings_override = ?')
    values.push(JSON.stringify(input.settingsOverride))
  }

  values.push(input.id)

  db.prepare(`
    UPDATE projects SET ${updates.join(', ')} WHERE id = ?
  `).run(...values)

  return getProjectById(input.id)!
}

export function updateProjectProgress(
  id: string,
  progress: Record<string, unknown>,
  imageCount?: number,
  audioDuration?: number,
  subtitleCount?: number
): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const updates: string[] = ['updated_at = ?', 'generation_progress = ?']
  const values: unknown[] = [now, JSON.stringify(progress)]

  if (imageCount !== undefined) {
    updates.push('image_count = ?')
    values.push(imageCount)
  }
  if (audioDuration !== undefined) {
    updates.push('audio_duration_seconds = ?')
    values.push(audioDuration)
  }
  if (subtitleCount !== undefined) {
    updates.push('subtitle_count = ?')
    values.push(subtitleCount)
  }

  values.push(id)

  db.prepare(`
    UPDATE projects SET ${updates.join(', ')} WHERE id = ?
  `).run(...values)
}

export function setProjectError(id: string, message: string, details?: Record<string, unknown>): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE projects SET
      status = 'failed',
      error_message = ?,
      error_details = ?,
      completed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    message,
    details ? JSON.stringify(details) : null,
    new Date().toISOString(),
    new Date().toISOString(),
    id
  )
}

export function deleteProject(id: string): boolean {
  const db = getDatabase()

  // Get project to find channel ID
  const project = getProjectById(id)
  if (!project) {
    // Project doesn't exist, nothing to delete
    return false
  }

  const now = new Date().toISOString()

  // Use transaction to ensure atomicity of project deletion and channel count update
  const deleteProjectTransaction = db.transaction(() => {
    // Decrement channel project count within the same transaction
    db.prepare(`
      UPDATE channels SET project_count = CASE WHEN project_count > 0 THEN project_count - 1 ELSE 0 END, updated_at = ? WHERE id = ?
    `).run(now, project.channelId)

    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id)
  })

  deleteProjectTransaction()
  return true
}
