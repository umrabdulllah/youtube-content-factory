import { getDatabase } from '../index'

export interface SearchResult {
  type: 'category' | 'channel' | 'project'
  id: string
  title: string
  subtitle: string
  color?: string
}

export interface SearchResults {
  categories: SearchResult[]
  channels: SearchResult[]
  projects: SearchResult[]
  total: number
}

export function search(query: string, limit: number = 10): SearchResults {
  const db = getDatabase()
  const searchPattern = `%${query}%`

  // Search categories
  const categories = db.prepare(`
    SELECT
      id,
      name as title,
      description as subtitle,
      color
    FROM categories
    WHERE name LIKE ? OR description LIKE ?
    ORDER BY
      CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
      name ASC
    LIMIT ?
  `).all(searchPattern, searchPattern, `${query}%`, limit) as Array<{
    id: string
    title: string
    subtitle: string | null
    color: string
  }>

  // Search channels
  const channels = db.prepare(`
    SELECT
      ch.id,
      ch.name as title,
      c.name || ' / ' || COALESCE(ch.description, '') as subtitle,
      c.color
    FROM channels ch
    JOIN categories c ON c.id = ch.category_id
    WHERE ch.name LIKE ? OR ch.description LIKE ?
    ORDER BY
      CASE WHEN ch.name LIKE ? THEN 0 ELSE 1 END,
      ch.name ASC
    LIMIT ?
  `).all(searchPattern, searchPattern, `${query}%`, limit) as Array<{
    id: string
    title: string
    subtitle: string
    color: string
  }>

  // Search projects
  const projects = db.prepare(`
    SELECT
      p.id,
      p.title,
      ch.name || ' / ' || p.status as subtitle,
      c.color
    FROM projects p
    JOIN channels ch ON ch.id = p.channel_id
    JOIN categories c ON c.id = ch.category_id
    WHERE p.title LIKE ? OR p.script LIKE ?
    ORDER BY
      CASE WHEN p.title LIKE ? THEN 0 ELSE 1 END,
      p.updated_at DESC
    LIMIT ?
  `).all(searchPattern, searchPattern, `${query}%`, limit) as Array<{
    id: string
    title: string
    subtitle: string
    color: string
  }>

  return {
    categories: categories.map(c => ({
      type: 'category' as const,
      id: c.id,
      title: c.title,
      subtitle: c.subtitle || 'Category',
      color: c.color,
    })),
    channels: channels.map(ch => ({
      type: 'channel' as const,
      id: ch.id,
      title: ch.title,
      subtitle: ch.subtitle,
      color: ch.color,
    })),
    projects: projects.map(p => ({
      type: 'project' as const,
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      color: p.color,
    })),
    total: categories.length + channels.length + projects.length,
  }
}
