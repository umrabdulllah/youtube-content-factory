-- ============================================
-- Migration: Add Manager Role
-- ============================================
-- Adds a new "Manager" role that operates independently:
-- - Managers set their own API keys (no fallback to admin keys)
-- - Managers have isolated content (only see their own categories/channels/projects)
-- - No team management - Managers work independently

-- ============================================
-- 1. Update Role Constraints
-- ============================================

-- Update user_profiles role constraint to include 'manager'
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'editor', 'manager'));

-- Update invite_tokens role constraint to include 'manager'
ALTER TABLE public.invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_role_check;
ALTER TABLE public.invite_tokens ADD CONSTRAINT invite_tokens_role_check
  CHECK (role IN ('admin', 'editor', 'manager'));

-- ============================================
-- 2. Create User API Keys Table
-- ============================================
-- Stores personal API keys for managers (separate from org-wide keys)

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL, -- 'anthropicApi', 'openaiApi', 'replicateApi', 'voiceApi'
  encrypted_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key_type)
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own keys
CREATE POLICY "Users can manage own API keys" ON public.user_api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON public.user_api_keys(user_id);

-- ============================================
-- 3. Helper Function for Manager Check
-- ============================================

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'manager'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Add Owner Columns to Cloud Content Tables
-- ============================================
-- owner_id = NULL means org-owned (visible to admin/editors)
-- owner_id = UUID means manager-owned (visible only to that manager)

-- Add owner_id to cloud_categories if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cloud_categories') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'cloud_categories' AND column_name = 'owner_id') THEN
      ALTER TABLE public.cloud_categories ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_cloud_categories_owner ON public.cloud_categories(owner_id);
    END IF;
  END IF;
END $$;

-- Add owner_id to cloud_channels if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cloud_channels') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'cloud_channels' AND column_name = 'owner_id') THEN
      ALTER TABLE public.cloud_channels ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_cloud_channels_owner ON public.cloud_channels(owner_id);
    END IF;
  END IF;
END $$;

-- Add owner_id to cloud_projects if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cloud_projects') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'cloud_projects' AND column_name = 'owner_id') THEN
      ALTER TABLE public.cloud_projects ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_cloud_projects_owner ON public.cloud_projects(owner_id);
    END IF;
  END IF;
END $$;

-- ============================================
-- 5. Update RLS Policies for Content Isolation
-- ============================================
-- Managers can only see/modify their own content
-- Admins/Editors see org-owned content (owner_id IS NULL)

-- Note: These policies assume cloud_categories/channels/projects exist
-- If they don't exist yet, these will be no-ops

-- Categories policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cloud_categories') THEN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "View categories based on role" ON public.cloud_categories;
    DROP POLICY IF EXISTS "Admins manage org categories" ON public.cloud_categories;
    DROP POLICY IF EXISTS "Managers manage own categories" ON public.cloud_categories;

    -- Create new policies
    CREATE POLICY "View categories based on role" ON public.cloud_categories
      FOR SELECT USING (
        CASE
          WHEN public.is_admin() THEN owner_id IS NULL
          WHEN public.is_manager() THEN owner_id = auth.uid()
          ELSE owner_id IS NULL  -- Editors see org content
        END
      );

    CREATE POLICY "Admins manage org categories" ON public.cloud_categories
      FOR ALL USING (public.is_admin() AND owner_id IS NULL);

    CREATE POLICY "Managers manage own categories" ON public.cloud_categories
      FOR ALL USING (public.is_manager() AND owner_id = auth.uid());
  END IF;
END $$;

-- Channels policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cloud_channels') THEN
    DROP POLICY IF EXISTS "View channels based on role" ON public.cloud_channels;
    DROP POLICY IF EXISTS "Admins manage org channels" ON public.cloud_channels;
    DROP POLICY IF EXISTS "Managers manage own channels" ON public.cloud_channels;

    CREATE POLICY "View channels based on role" ON public.cloud_channels
      FOR SELECT USING (
        CASE
          WHEN public.is_admin() THEN owner_id IS NULL
          WHEN public.is_manager() THEN owner_id = auth.uid()
          ELSE owner_id IS NULL
        END
      );

    CREATE POLICY "Admins manage org channels" ON public.cloud_channels
      FOR ALL USING (public.is_admin() AND owner_id IS NULL);

    CREATE POLICY "Managers manage own channels" ON public.cloud_channels
      FOR ALL USING (public.is_manager() AND owner_id = auth.uid());
  END IF;
END $$;

-- Projects policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cloud_projects') THEN
    DROP POLICY IF EXISTS "View projects based on role" ON public.cloud_projects;
    DROP POLICY IF EXISTS "Admins manage org projects" ON public.cloud_projects;
    DROP POLICY IF EXISTS "Managers manage own projects" ON public.cloud_projects;
    DROP POLICY IF EXISTS "Editors manage org projects" ON public.cloud_projects;

    CREATE POLICY "View projects based on role" ON public.cloud_projects
      FOR SELECT USING (
        CASE
          WHEN public.is_admin() THEN owner_id IS NULL
          WHEN public.is_manager() THEN owner_id = auth.uid()
          ELSE owner_id IS NULL
        END
      );

    CREATE POLICY "Admins manage org projects" ON public.cloud_projects
      FOR ALL USING (public.is_admin() AND owner_id IS NULL);

    CREATE POLICY "Managers manage own projects" ON public.cloud_projects
      FOR ALL USING (public.is_manager() AND owner_id = auth.uid());

    CREATE POLICY "Editors manage org projects" ON public.cloud_projects
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'editor')
        AND owner_id IS NULL
      );
  END IF;
END $$;
