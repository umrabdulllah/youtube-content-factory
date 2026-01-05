-- =============================================
-- Phase 2: Lightweight Stats Sync Tables
-- Run this migration in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. Project Stats Table
-- Stores lightweight project metadata synced from editors
-- =============================================
CREATE TABLE IF NOT EXISTS project_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_project_id TEXT NOT NULL,
    editor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    channel_name TEXT,
    category_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
    local_created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint to prevent duplicates per editor
    UNIQUE(local_project_id, editor_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_project_stats_editor ON project_stats(editor_id);
CREATE INDEX IF NOT EXISTS idx_project_stats_status ON project_stats(status);
CREATE INDEX IF NOT EXISTS idx_project_stats_synced ON project_stats(synced_at DESC);

-- =============================================
-- 2. Activity Log Table
-- Real-time activity events from all editors
-- =============================================
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    editor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'project_created',
        'project_started',
        'project_completed',
        'project_failed',
        'status_changed',
        'app_opened',
        'app_closed',
        'heartbeat'
    )),
    project_title TEXT,
    project_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_activity_log_editor ON activity_log(editor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(event_type);

-- =============================================
-- 3. Daily Stats Table
-- Aggregated daily statistics per editor
-- =============================================
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    editor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    projects_created INTEGER DEFAULT 0,
    projects_completed INTEGER DEFAULT 0,
    projects_failed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One entry per editor per day
    UNIQUE(editor_id, date)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_stats_editor ON daily_stats(editor_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- =============================================
-- 4. Row Level Security (RLS) Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE project_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Project Stats Policies
-- Editors can only see and modify their own project stats
CREATE POLICY "Editors can view own project_stats"
    ON project_stats FOR SELECT
    USING (auth.uid() = editor_id);

CREATE POLICY "Editors can insert own project_stats"
    ON project_stats FOR INSERT
    WITH CHECK (auth.uid() = editor_id);

CREATE POLICY "Editors can update own project_stats"
    ON project_stats FOR UPDATE
    USING (auth.uid() = editor_id);

-- Admins can view all project stats
CREATE POLICY "Admins can view all project_stats"
    ON project_stats FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Activity Log Policies
-- Editors can insert their own activity
CREATE POLICY "Editors can insert own activity_log"
    ON activity_log FOR INSERT
    WITH CHECK (auth.uid() = editor_id);

-- Editors can view their own activity
CREATE POLICY "Editors can view own activity_log"
    ON activity_log FOR SELECT
    USING (auth.uid() = editor_id);

-- Admins can view all activity
CREATE POLICY "Admins can view all activity_log"
    ON activity_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Daily Stats Policies
-- Editors can see and modify their own daily stats
CREATE POLICY "Editors can view own daily_stats"
    ON daily_stats FOR SELECT
    USING (auth.uid() = editor_id);

CREATE POLICY "Editors can insert own daily_stats"
    ON daily_stats FOR INSERT
    WITH CHECK (auth.uid() = editor_id);

CREATE POLICY "Editors can update own daily_stats"
    ON daily_stats FOR UPDATE
    USING (auth.uid() = editor_id);

-- Admins can view all daily stats
CREATE POLICY "Admins can view all daily_stats"
    ON daily_stats FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =============================================
-- 5. Utility Functions
-- =============================================

-- Function to get editor online status (active in last 5 minutes)
CREATE OR REPLACE FUNCTION is_editor_online(p_editor_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM activity_log
        WHERE editor_id = p_editor_id
        AND created_at > NOW() - INTERVAL '5 minutes'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update daily stats (called by trigger or manually)
CREATE OR REPLACE FUNCTION update_daily_stats()
RETURNS TRIGGER AS $$
DECLARE
    stat_date DATE;
BEGIN
    stat_date := COALESCE(NEW.local_created_at::DATE, CURRENT_DATE);

    INSERT INTO daily_stats (editor_id, date, projects_created, projects_completed, projects_failed)
    VALUES (
        NEW.editor_id,
        stat_date,
        CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status != 'failed') THEN 1 ELSE 0 END
    )
    ON CONFLICT (editor_id, date) DO UPDATE SET
        projects_created = daily_stats.projects_created + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END,
        projects_completed = daily_stats.projects_completed +
            CASE WHEN NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN 1 ELSE 0 END,
        projects_failed = daily_stats.projects_failed +
            CASE WHEN NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status != 'failed') THEN 1 ELSE 0 END,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update daily stats when project_stats changes
CREATE TRIGGER trigger_update_daily_stats
    AFTER INSERT OR UPDATE ON project_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_stats();

-- =============================================
-- 6. Cleanup old data (optional - run periodically)
-- =============================================

-- Function to clean up old heartbeat events (keep only last 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_heartbeats()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_log
    WHERE event_type = 'heartbeat'
    AND created_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old activity logs (keep only last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_log
    WHERE event_type != 'heartbeat'
    AND created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. Grant permissions
-- =============================================

-- Grant usage on tables to authenticated users
GRANT SELECT, INSERT, UPDATE ON project_stats TO authenticated;
GRANT SELECT, INSERT ON activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON daily_stats TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION is_editor_online(UUID) TO authenticated;

-- =============================================
-- Migration Complete
-- =============================================

COMMENT ON TABLE project_stats IS 'Lightweight project metadata synced from editors';
COMMENT ON TABLE activity_log IS 'Real-time activity events from all editors';
COMMENT ON TABLE daily_stats IS 'Aggregated daily statistics per editor';
