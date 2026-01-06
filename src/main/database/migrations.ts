import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'add_channel_sort_order',
    up: (db) => {
      // Check if sort_order column already exists
      const tableInfo = db.prepare('PRAGMA table_info(channels)').all() as Array<{ name: string }>
      const existingColumns = new Set(tableInfo.map((col) => col.name))

      if (existingColumns.has('sort_order')) {
        console.log('sort_order column already exists, skipping migration')
        return
      }

      // Add sort_order column to channels table
      db.exec(`ALTER TABLE channels ADD COLUMN sort_order INTEGER DEFAULT 0`)

      // Populate sort_order based on created_at order within each category
      // Get all distinct categories that have channels
      const categories = db
        .prepare(`SELECT DISTINCT category_id FROM channels`)
        .all() as { category_id: string }[]

      const updateStmt = db.prepare(`UPDATE channels SET sort_order = ? WHERE id = ?`)

      for (const { category_id } of categories) {
        // Get channels in this category ordered by created_at
        const channels = db
          .prepare(`SELECT id FROM channels WHERE category_id = ? ORDER BY created_at ASC`)
          .all(category_id) as { id: string }[]

        // Assign sequential sort_order starting at 0
        channels.forEach((channel, index) => {
          updateStmt.run(index, channel.id)
        })
      }
    },
  },
  {
    version: 2,
    name: 'add_queue_parallel_processing',
    up: (db) => {
      // Add columns for parallel queue processing with dependencies (if they don't exist)
      const tableInfo = db.prepare('PRAGMA table_info(queue_tasks)').all() as Array<{ name: string }>
      const existingColumns = new Set(tableInfo.map((col) => col.name))

      if (!existingColumns.has('depends_on_task_id')) {
        db.exec(`ALTER TABLE queue_tasks ADD COLUMN depends_on_task_id TEXT`)
      }
      if (!existingColumns.has('stage_group')) {
        db.exec(`ALTER TABLE queue_tasks ADD COLUMN stage_group INTEGER DEFAULT 0`)
      }

      // Create indexes for efficient dependency lookups
      db.exec(`CREATE INDEX IF NOT EXISTS idx_queue_dependency ON queue_tasks(depends_on_task_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_queue_stage_group ON queue_tasks(stage_group)`)

      // Cancel any in-progress 'generate' tasks - they need to be re-queued
      // to use the new stage-based system
      db.exec(`
        UPDATE queue_tasks
        SET status = 'cancelled',
            error = 'Migration: Please re-queue this project for parallel processing'
        WHERE task_type = 'generate'
          AND status IN ('pending', 'processing')
      `)
    },
  },
]

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Get current version
  const currentVersionResult = db.prepare(`
    SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations
  `).get() as { version: number }

  const currentVersion = currentVersionResult.version

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration ${migration.version}: ${migration.name}`)

      try {
        db.transaction(() => {
          migration.up(db)

          db.prepare(`
            INSERT INTO schema_migrations (version, name) VALUES (?, ?)
          `).run(migration.version, migration.name)
        })()

        console.log(`Migration ${migration.version} completed successfully`)
      } catch (error) {
        console.error(`Migration ${migration.version} failed:`, error)
        throw error
      }
    }
  }
}
