import { v4 as uuid } from 'uuid'
import { getDatabase } from '../index'
import type { SyncQueueItem } from '../../../shared/types'

// Map database row to SyncQueueItem
function mapQueueRow(row: Record<string, unknown>): SyncQueueItem {
  return {
    id: row.id as string,
    eventType: row.event_type as 'project_stats' | 'activity_log' | 'daily_stats',
    payload: row.payload as string,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    createdAt: row.created_at as string,
    lastAttemptAt: row.last_attempt_at as string | null,
    error: row.error as string | null,
  }
}

// =====================
// Sync Queue Operations
// =====================

export function addToSyncQueue(
  eventType: 'project_stats' | 'activity_log' | 'daily_stats',
  payload: Record<string, unknown>
): SyncQueueItem {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO sync_offline_queue (id, event_type, payload, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, eventType, JSON.stringify(payload), now)

  return {
    id,
    eventType,
    payload: JSON.stringify(payload),
    attempts: 0,
    maxAttempts: 5,
    createdAt: now,
    lastAttemptAt: null,
    error: null,
  }
}

export function getPendingSyncItems(limit = 50): SyncQueueItem[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM sync_offline_queue
    WHERE attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[]

  return rows.map(mapQueueRow)
}

export function getPendingSyncCount(): number {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM sync_offline_queue
    WHERE attempts < max_attempts
  `).get() as { count: number }

  return row.count
}

export function markSyncItemAttempted(id: string, error?: string): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE sync_offline_queue
    SET attempts = attempts + 1, last_attempt_at = ?, error = ?
    WHERE id = ?
  `).run(now, error || null, id)
}

export function removeSyncItem(id: string): void {
  const db = getDatabase()
  db.prepare(`DELETE FROM sync_offline_queue WHERE id = ?`).run(id)
}

export function clearSuccessfullySyncedItems(): number {
  const db = getDatabase()
  const result = db.prepare(`
    DELETE FROM sync_offline_queue
    WHERE attempts > 0 AND error IS NULL
  `).run()

  return result.changes
}

export function clearAllSyncItems(): number {
  const db = getDatabase()
  const result = db.prepare(`DELETE FROM sync_offline_queue`).run()
  return result.changes
}

// =====================
// Sync State Operations
// =====================

export function getSyncStateValue(key: string): string | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT value FROM sync_state WHERE key = ?
  `).get(key) as { value: string } | undefined

  return row?.value ?? null
}

export function setSyncStateValue(key: string, value: string): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now)
}

export function getLastSyncTime(): string | null {
  return getSyncStateValue('last_sync_at')
}

export function setLastSyncTime(timestamp: string): void {
  setSyncStateValue('last_sync_at', timestamp)
}

export function getEditorId(): string | null {
  return getSyncStateValue('editor_id')
}

export function setEditorId(editorId: string): void {
  setSyncStateValue('editor_id', editorId)
}

// ========================
// Project Sync Tracking
// ========================

export interface ProjectSyncTracking {
  localProjectId: string
  remoteId: string | null
  lastSyncedAt: string | null
  lastStatus: string | null
  needsSync: boolean
}

function mapTrackingRow(row: Record<string, unknown>): ProjectSyncTracking {
  return {
    localProjectId: row.local_project_id as string,
    remoteId: row.remote_id as string | null,
    lastSyncedAt: row.last_synced_at as string | null,
    lastStatus: row.last_status as string | null,
    needsSync: (row.needs_sync as number) === 1,
  }
}

export function getProjectSyncTracking(localProjectId: string): ProjectSyncTracking | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT * FROM project_sync_tracking WHERE local_project_id = ?
  `).get(localProjectId) as Record<string, unknown> | undefined

  return row ? mapTrackingRow(row) : null
}

export function upsertProjectSyncTracking(
  localProjectId: string,
  updates: {
    remoteId?: string
    lastSyncedAt?: string
    lastStatus?: string
    needsSync?: boolean
  }
): void {
  const db = getDatabase()

  // First try to get existing record
  const existing = getProjectSyncTracking(localProjectId)

  if (existing) {
    // Update existing
    const sets: string[] = []
    const values: (string | number)[] = []

    if (updates.remoteId !== undefined) {
      sets.push('remote_id = ?')
      values.push(updates.remoteId)
    }
    if (updates.lastSyncedAt !== undefined) {
      sets.push('last_synced_at = ?')
      values.push(updates.lastSyncedAt)
    }
    if (updates.lastStatus !== undefined) {
      sets.push('last_status = ?')
      values.push(updates.lastStatus)
    }
    if (updates.needsSync !== undefined) {
      sets.push('needs_sync = ?')
      values.push(updates.needsSync ? 1 : 0)
    }

    if (sets.length > 0) {
      values.push(localProjectId)
      db.prepare(`
        UPDATE project_sync_tracking SET ${sets.join(', ')} WHERE local_project_id = ?
      `).run(...values)
    }
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO project_sync_tracking (local_project_id, remote_id, last_synced_at, last_status, needs_sync)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      localProjectId,
      updates.remoteId ?? null,
      updates.lastSyncedAt ?? null,
      updates.lastStatus ?? null,
      updates.needsSync === false ? 0 : 1
    )
  }
}

export function getProjectsNeedingSync(): ProjectSyncTracking[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM project_sync_tracking WHERE needs_sync = 1
  `).all() as Record<string, unknown>[]

  return rows.map(mapTrackingRow)
}

export function markProjectSynced(localProjectId: string, remoteId: string, status: string): void {
  const now = new Date().toISOString()
  upsertProjectSyncTracking(localProjectId, {
    remoteId,
    lastSyncedAt: now,
    lastStatus: status,
    needsSync: false,
  })
}

export function markProjectNeedsSync(localProjectId: string, status?: string): void {
  upsertProjectSyncTracking(localProjectId, {
    needsSync: true,
    lastStatus: status,
  })
}

// ========================
// Bulk Operations
// ========================

export function markAllProjectsNeedSync(): number {
  const db = getDatabase()
  const result = db.prepare(`
    UPDATE project_sync_tracking SET needs_sync = 1
  `).run()
  return result.changes
}

export function deleteProjectTracking(localProjectId: string): void {
  const db = getDatabase()
  db.prepare(`
    DELETE FROM project_sync_tracking WHERE local_project_id = ?
  `).run(localProjectId)
}
