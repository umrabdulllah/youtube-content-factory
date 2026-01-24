import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  getSupabase,
  isSupabaseConfigured,
  storeSessionSecurely,
  clearStoredSession,
} from '../services/supabase'
import { handleIpcError } from '../utils/ipc-error-handler'
import type {
  LoginCredentials,
  RegisterWithInviteInput,
  UserProfile,
} from '../../shared/types'

/**
 * Transform Supabase user_profiles row to UserProfile type
 */
function transformUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string | null,
    role: row.role as 'admin' | 'editor',
    invitedBy: row.invited_by as string | null,
    invitedAt: row.invited_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerAuthHandlers(): void {
  // Login with email and password
  ipcMain.handle(IPC_CHANNELS.AUTH.LOGIN, async (_, credentials: LoginCredentials) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured. Please contact admin.')
      }

      const supabase = getSupabase()

      // Sign in with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) {
        throw new Error(error.message)
      }

      if (!data.session || !data.user) {
        throw new Error('Login failed - no session returned')
      }

      // Store session securely
      await storeSessionSecurely(data.session)

      // Fetch user profile from user_profiles table
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        // User authenticated but no profile - might be first admin setup
        console.warn('[Auth] User has no profile:', profileError?.message)
        throw new Error('User profile not found. Please contact admin.')
      }

      return {
        user: transformUserProfile(profile),
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at || 0,
        },
      }
    })
  })

  // Logout
  ipcMain.handle(IPC_CHANNELS.AUTH.LOGOUT, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return { success: true }
      }

      const supabase = getSupabase()
      await supabase.auth.signOut()
      clearStoredSession()

      return { success: true }
    })
  })

  // Get current session
  ipcMain.handle(IPC_CHANNELS.AUTH.GET_SESSION, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return { user: null, session: null }
      }

      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return { user: null, session: null }
      }

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError || !profile) {
        console.warn('[Auth] Session exists but no profile:', profileError?.message)
        return { user: null, session: null }
      }

      return {
        user: transformUserProfile(profile),
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at || 0,
        },
      }
    })
  })

  // Refresh session
  ipcMain.handle(IPC_CHANNELS.AUTH.REFRESH_SESSION, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return { user: null, session: null }
      }

      const supabase = getSupabase()
      const { data, error } = await supabase.auth.refreshSession()

      if (error || !data.session) {
        console.warn('[Auth] Failed to refresh session:', error?.message)
        clearStoredSession()
        return { user: null, session: null }
      }

      // Store refreshed session
      await storeSessionSecurely(data.session)

      // Fetch user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single()

      if (!profile) {
        return { user: null, session: null }
      }

      return {
        user: transformUserProfile(profile),
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at || 0,
        },
      }
    })
  })

  // Register with invite token
  ipcMain.handle(IPC_CHANNELS.AUTH.REGISTER_WITH_INVITE, async (_, input: RegisterWithInviteInput) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured. Please contact admin.')
      }

      const supabase = getSupabase()

      // First verify the invite token is valid
      const { data: invite, error: inviteError } = await supabase
        .from('invite_tokens')
        .select('*')
        .eq('token', input.inviteToken)
        .eq('email', input.email)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (inviteError || !invite) {
        throw new Error('Invalid or expired invite token')
      }

      // Try to create the user account
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            display_name: input.displayName,
          },
        },
      })

      // If user already exists, try to sign them in instead
      if (error && error.message === 'User already registered') {
        console.log('[Auth] User already exists in auth, attempting sign in...')

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        })

        if (signInError) {
          throw new Error('User already exists. Please use login instead, or reset your password if forgotten.')
        }

        if (!signInData.user || !signInData.session) {
          throw new Error('Sign in failed')
        }

        // Check if profile exists
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', signInData.user.id)
          .single()

        if (existingProfile) {
          // Profile already exists - just return it
          await storeSessionSecurely(signInData.session)
          return {
            user: transformUserProfile(existingProfile),
            session: {
              accessToken: signInData.session.access_token,
              refreshToken: signInData.session.refresh_token,
              expiresAt: signInData.session.expires_at || 0,
            },
          }
        }

        // User exists in auth but no profile - create one using the invite
        console.log('[Auth] Creating missing profile for existing auth user...')

        const { data: newProfile, error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: signInData.user.id,
            email: input.email,
            display_name: input.displayName || null,
            role: invite.role || 'editor',
            invited_by: invite.created_by,
            invited_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (profileError) {
          console.error('[Auth] Failed to create profile:', profileError)
          throw new Error('Failed to create user profile. Please contact admin.')
        }

        // Mark invite as used
        await supabase
          .from('invite_tokens')
          .update({ used_at: new Date().toISOString(), used_by: signInData.user.id })
          .eq('id', invite.id)

        await storeSessionSecurely(signInData.session)

        return {
          user: transformUserProfile(newProfile),
          session: {
            accessToken: signInData.session.access_token,
            refreshToken: signInData.session.refresh_token,
            expiresAt: signInData.session.expires_at || 0,
          },
        }
      }

      if (error) {
        throw new Error(error.message)
      }

      if (!data.user) {
        throw new Error('Registration failed - no user returned')
      }

      // The trigger should have created the profile and marked the invite as used
      // Wait a moment for the trigger to complete
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Fetch the created profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      return {
        user: profile ? transformUserProfile(profile) : null,
        session: data.session ? {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at || 0,
        } : null,
      }
    })
  })

  // Get current user profile
  ipcMain.handle(IPC_CHANNELS.AUTH.GET_CURRENT_USER, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return null
      }

      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return null
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      return profile ? transformUserProfile(profile) : null
    })
  })

  // Update profile
  ipcMain.handle(IPC_CHANNELS.AUTH.UPDATE_PROFILE, async (_, updates: { displayName?: string }) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured')
      }

      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (updates.displayName !== undefined) {
        updateData.display_name = updates.displayName
      }

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return transformUserProfile(profile)
    })
  })

  // Change password
  ipcMain.handle(IPC_CHANNELS.AUTH.CHANGE_PASSWORD, async (_, _currentPassword: string, newPassword: string) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured')
      }

      const supabase = getSupabase()

      // Supabase doesn't require current password for password change when authenticated
      // But we verify user is logged in
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw new Error(error.message)
      }

      return { success: true }
    })
  })
}
