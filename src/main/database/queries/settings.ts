import { app } from 'electron'
import path from 'node:path'
import { getDatabase } from '../index'
import type { AppSettings } from '../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../shared/types/settings.types'

export function getSettings(): AppSettings {
  const db = getDatabase()

  // Get all settings from database
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
    key: string
    value: string
  }>

  // Build settings object from rows
  const settings: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value)
    } catch {
      settings[row.key] = row.value
    }
  }

  // Merge with defaults, using saved values where available
  const result: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
  } as AppSettings

  // Set default base path if not configured
  if (!result.basePath) {
    result.basePath = path.join(app.getPath('documents'), 'YouTube Content Factory')
  }

  return result
}

export function setSettings(settings: Partial<AppSettings>): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)

  db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      // Skip undefined values to avoid NOT NULL constraint violation
      if (value === undefined) continue
      stmt.run(key, JSON.stringify(value), now)
    }
  })()
}

export function getSettingValue<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const db = getDatabase()

  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as {
    value: string
  } | undefined

  if (row) {
    try {
      return JSON.parse(row.value) as AppSettings[K]
    } catch {
      return row.value as AppSettings[K]
    }
  }

  // Return default value
  return DEFAULT_SETTINGS[key]
}

export function setSettingValue<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now)
}
