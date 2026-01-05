import type Database from 'better-sqlite3'

export function createSchema(db: Database.Database): void {
  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'folder',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Channels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      default_settings JSON DEFAULT '{}',
      project_count INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, slug)
    )
  `)

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      script TEXT,
      script_word_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      generation_progress JSON DEFAULT '{}',
      image_count INTEGER DEFAULT 0,
      audio_duration_seconds INTEGER,
      subtitle_count INTEGER DEFAULT 0,
      error_message TEXT,
      error_details JSON,
      settings_override JSON DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      queued_at DATETIME,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      UNIQUE(channel_id, slug)
    )
  `)

  // Queue tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      progress_details JSON,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      depends_on_task_id TEXT,
      stage_group INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      error TEXT,
      error_stack TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_task_id) REFERENCES queue_tasks(id) ON DELETE SET NULL
    )
  `)

  // Analytics daily table
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      category_id TEXT,
      channel_id TEXT,
      projects_created INTEGER DEFAULT 0,
      projects_completed INTEGER DEFAULT 0,
      projects_failed INTEGER DEFAULT 0,
      images_generated INTEGER DEFAULT 0,
      audio_minutes_generated REAL DEFAULT 0,
      subtitles_generated INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      UNIQUE(date, category_id, channel_id),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL
    )
  `)

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Migrate existing queue_tasks table to add new columns if missing
  const tableInfo = db.prepare('PRAGMA table_info(queue_tasks)').all() as Array<{ name: string }>
  const existingColumns = new Set(tableInfo.map((col) => col.name))

  if (!existingColumns.has('depends_on_task_id')) {
    db.exec('ALTER TABLE queue_tasks ADD COLUMN depends_on_task_id TEXT REFERENCES queue_tasks(id) ON DELETE SET NULL')
  }
  if (!existingColumns.has('stage_group')) {
    db.exec('ALTER TABLE queue_tasks ADD COLUMN stage_group INTEGER DEFAULT 0')
  }

  // Migrate existing projects table to add generation options columns if missing
  const projectsTableInfo = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
  const existingProjectColumns = new Set(projectsTableInfo.map((col) => col.name))

  if (!existingProjectColumns.has('generate_images')) {
    db.exec('ALTER TABLE projects ADD COLUMN generate_images INTEGER DEFAULT 1')
  }
  if (!existingProjectColumns.has('generate_audio')) {
    db.exec('ALTER TABLE projects ADD COLUMN generate_audio INTEGER DEFAULT 1')
  }

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id);
    CREATE INDEX IF NOT EXISTS idx_projects_channel ON projects(channel_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_queue_project ON queue_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_queue_dependency ON queue_tasks(depends_on_task_id);
    CREATE INDEX IF NOT EXISTS idx_queue_stage_group ON queue_tasks(stage_group);
    CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_daily(date);
  `)

  console.log('Database schema created successfully')
}
