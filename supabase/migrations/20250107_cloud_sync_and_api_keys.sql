-- Migration: Cloud Sync for Categories/Channels + Centralized API Keys
-- Run this in your Supabase SQL Editor

-- ============================================================
-- 1. CLOUD CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cloud_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. CLOUD CHANNELS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cloud_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES cloud_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  default_settings JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cloud_channels_category ON cloud_channels(category_id);

-- ============================================================
-- 3. API KEYS TABLE (Encrypted storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  key_type TEXT PRIMARY KEY, -- 'anthropicApi', 'openaiApi', 'replicateApi', 'voiceApi'
  encrypted_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- 4. SYNC VERSIONS TABLE (For detecting updates)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_versions (
  resource_type TEXT PRIMARY KEY, -- 'categories', 'channels', 'api_keys'
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize sync versions
INSERT INTO sync_versions (resource_type, version)
VALUES ('categories', 1), ('channels', 1), ('api_keys', 1)
ON CONFLICT (resource_type) DO NOTHING;

-- ============================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE cloud_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_versions ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CLOUD CATEGORIES POLICIES
CREATE POLICY "Admins can manage categories" ON cloud_categories
  FOR ALL USING (is_admin());

CREATE POLICY "Authenticated users can view categories" ON cloud_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- CLOUD CHANNELS POLICIES
CREATE POLICY "Admins can manage channels" ON cloud_channels
  FOR ALL USING (is_admin());

CREATE POLICY "Authenticated users can view channels" ON cloud_channels
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- API KEYS POLICIES
CREATE POLICY "Admins can manage API keys" ON api_keys
  FOR ALL USING (is_admin());

CREATE POLICY "Authenticated users can view API keys" ON api_keys
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- SYNC VERSIONS POLICIES
CREATE POLICY "Anyone authenticated can read sync versions" ON sync_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update sync versions" ON sync_versions
  FOR UPDATE USING (is_admin());

-- ============================================================
-- 6. TRIGGERS FOR AUTO-INCREMENT SYNC VERSIONS
-- ============================================================

-- Trigger function to increment version
CREATE OR REPLACE FUNCTION increment_sync_version()
RETURNS TRIGGER AS $$
DECLARE
  resource TEXT;
BEGIN
  -- Determine resource type from table name
  resource := TG_ARGV[0];

  UPDATE sync_versions
  SET version = version + 1, updated_at = NOW()
  WHERE resource_type = resource;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for categories
DROP TRIGGER IF EXISTS trigger_categories_sync_version ON cloud_categories;
CREATE TRIGGER trigger_categories_sync_version
AFTER INSERT OR UPDATE OR DELETE ON cloud_categories
FOR EACH ROW EXECUTE FUNCTION increment_sync_version('categories');

-- Trigger for channels
DROP TRIGGER IF EXISTS trigger_channels_sync_version ON cloud_channels;
CREATE TRIGGER trigger_channels_sync_version
AFTER INSERT OR UPDATE OR DELETE ON cloud_channels
FOR EACH ROW EXECUTE FUNCTION increment_sync_version('channels');

-- Trigger for API keys
DROP TRIGGER IF EXISTS trigger_api_keys_sync_version ON api_keys;
CREATE TRIGGER trigger_api_keys_sync_version
AFTER INSERT OR UPDATE OR DELETE ON api_keys
FOR EACH ROW EXECUTE FUNCTION increment_sync_version('api_keys');

-- ============================================================
-- 7. UPDATED_AT TRIGGER (Auto-update timestamp)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to cloud_categories
DROP TRIGGER IF EXISTS trigger_cloud_categories_updated_at ON cloud_categories;
CREATE TRIGGER trigger_cloud_categories_updated_at
BEFORE UPDATE ON cloud_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Apply to cloud_channels
DROP TRIGGER IF EXISTS trigger_cloud_channels_updated_at ON cloud_channels;
CREATE TRIGGER trigger_cloud_channels_updated_at
BEFORE UPDATE ON cloud_channels
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Apply to api_keys
DROP TRIGGER IF EXISTS trigger_api_keys_updated_at ON api_keys;
CREATE TRIGGER trigger_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DONE! Tables, RLS policies, and triggers are set up.
-- ============================================================
