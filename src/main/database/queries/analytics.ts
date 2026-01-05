import { getDatabase } from '../index'

export interface DashboardStats {
  totalCategories: number
  totalChannels: number
  totalProjects: number
  completedToday: number
  inQueue: number
  recentActivity: Array<{
    id: string
    type: string
    title: string
    status: string
    timestamp: string
    channelName: string | null
    categoryName: string | null
  }>
}

export interface CategoryStats {
  name: string
  count: number
  color: string
}

export interface TimelineData {
  date: string
  created: number
  completed: number
}

export function getDashboardStats(): DashboardStats {
  const db = getDatabase()

  // Get totals
  const categoriesCount = db.prepare(`SELECT COUNT(*) as count FROM categories`).get() as { count: number }
  const channelsCount = db.prepare(`SELECT COUNT(*) as count FROM channels`).get() as { count: number }
  const projectsCount = db.prepare(`SELECT COUNT(*) as count FROM projects`).get() as { count: number }

  // Get completed today
  const completedToday = db.prepare(`
    SELECT COUNT(*) as count FROM projects
    WHERE status = 'completed'
    AND date(completed_at) = date('now')
  `).get() as { count: number }

  // Get queue count
  const inQueue = db.prepare(`
    SELECT COUNT(*) as count FROM queue_tasks
    WHERE status IN ('pending', 'processing')
  `).get() as { count: number }

  // Get recent activity (last 10 projects)
  const recentProjects = db.prepare(`
    SELECT
      p.id,
      'project' as type,
      p.title,
      p.status,
      p.created_at as timestamp,
      ch.name as channelName,
      cat.name as categoryName
    FROM projects p
    LEFT JOIN channels ch ON ch.id = p.channel_id
    LEFT JOIN categories cat ON cat.id = ch.category_id
    ORDER BY p.created_at DESC
    LIMIT 10
  `).all() as Array<{ id: string; type: string; title: string; status: string; timestamp: string; channelName: string | null; categoryName: string | null }>

  return {
    totalCategories: categoriesCount.count,
    totalChannels: channelsCount.count,
    totalProjects: projectsCount.count,
    completedToday: completedToday.count,
    inQueue: inQueue.count,
    recentActivity: recentProjects,
  }
}

export function getCategoryStats(): CategoryStats[] {
  const db = getDatabase()

  const rows = db.prepare(`
    SELECT
      c.name,
      c.color,
      COUNT(DISTINCT p.id) as count
    FROM categories c
    LEFT JOIN channels ch ON ch.category_id = c.id
    LEFT JOIN projects p ON p.channel_id = ch.id
    GROUP BY c.id
    ORDER BY count DESC
  `).all() as Array<{ name: string; color: string; count: number }>

  return rows.map(row => ({
    name: row.name,
    count: row.count || 0,
    color: row.color,
  }))
}

export function getTimeline(days: number): TimelineData[] {
  const db = getDatabase()

  const rows = db.prepare(`
    WITH RECURSIVE dates(date) AS (
      SELECT date('now', '-' || ? || ' days')
      UNION ALL
      SELECT date(date, '+1 day')
      FROM dates
      WHERE date < date('now')
    )
    SELECT
      dates.date,
      COALESCE(created.count, 0) as created,
      COALESCE(completed.count, 0) as completed
    FROM dates
    LEFT JOIN (
      SELECT date(created_at) as date, COUNT(*) as count
      FROM projects
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
    ) created ON dates.date = created.date
    LEFT JOIN (
      SELECT date(completed_at) as date, COUNT(*) as count
      FROM projects
      WHERE completed_at >= date('now', '-' || ? || ' days')
      AND status = 'completed'
      GROUP BY date(completed_at)
    ) completed ON dates.date = completed.date
    ORDER BY dates.date ASC
  `).all(days, days, days) as Array<{ date: string; created: number; completed: number }>

  return rows
}

export function recordAnalytics(
  categoryId: string | null,
  channelId: string | null,
  metrics: {
    projectsCreated?: number
    projectsCompleted?: number
    projectsFailed?: number
    imagesGenerated?: number
    audioMinutesGenerated?: number
    subtitlesGenerated?: number
  }
): void {
  const db = getDatabase()
  const today = new Date().toISOString().split('T')[0]

  db.prepare(`
    INSERT INTO analytics_daily (
      date, category_id, channel_id,
      projects_created, projects_completed, projects_failed,
      images_generated, audio_minutes_generated, subtitles_generated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, category_id, channel_id) DO UPDATE SET
      projects_created = projects_created + excluded.projects_created,
      projects_completed = projects_completed + excluded.projects_completed,
      projects_failed = projects_failed + excluded.projects_failed,
      images_generated = images_generated + excluded.images_generated,
      audio_minutes_generated = audio_minutes_generated + excluded.audio_minutes_generated,
      subtitles_generated = subtitles_generated + excluded.subtitles_generated
  `).run(
    today,
    categoryId,
    channelId,
    metrics.projectsCreated || 0,
    metrics.projectsCompleted || 0,
    metrics.projectsFailed || 0,
    metrics.imagesGenerated || 0,
    metrics.audioMinutesGenerated || 0,
    metrics.subtitlesGenerated || 0
  )
}
