-- ============================================
-- YouTube Content Factory - Supabase Schema
-- ============================================
-- Run this SQL in your Supabase SQL Editor to set up authentication tables

-- ============================================
-- 1. User Profiles Table
-- ============================================
-- Extends Supabase auth.users with app-specific fields

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Invite Tokens Table
-- ============================================
-- For invite-only user registration

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. Row Level Security (RLS)
-- ============================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.user_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all profiles" ON public.user_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete profiles" ON public.user_profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Invite tokens policies (admin only)
CREATE POLICY "Admins can manage invites" ON public.invite_tokens
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 4. Trigger for New User Signup
-- ============================================
-- Automatically creates user_profile when new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
BEGIN
  -- Check if user has an invite
  SELECT * INTO invite_record
  FROM public.invite_tokens
  WHERE email = NEW.email AND used_at IS NULL
  LIMIT 1;

  -- Create user profile
  INSERT INTO public.user_profiles (id, email, display_name, role, invited_by, invited_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NULL),
    COALESCE(invite_record.role, 'editor'),
    invite_record.created_by,
    CASE WHEN invite_record.id IS NOT NULL THEN NOW() ELSE NULL END
  );

  -- Mark invite as used
  IF invite_record.id IS NOT NULL THEN
    UPDATE public.invite_tokens
    SET used_at = NOW(), used_by = NEW.id
    WHERE id = invite_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 5. Create First Admin User (Manual Step)
-- ============================================
-- After creating your first user via Supabase Auth dashboard,
-- run this to make them an admin (replace the email):
--
-- UPDATE public.user_profiles
-- SET role = 'admin'
-- WHERE email = 'your-email@example.com';

-- ============================================
-- 6. Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON public.invite_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON public.invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires ON public.invite_tokens(expires_at);
