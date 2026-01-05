import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getSupabase, isSupabaseConfigured } from '../services/supabase'
import { handleIpcError } from '../utils/ipc-error-handler'
import type { CreateInviteInput, UserRole, UserProfile, InviteToken } from '../../shared/types'

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

/**
 * Transform Supabase invite_tokens row to InviteToken type
 */
function transformInviteToken(row: Record<string, unknown>): InviteToken {
  return {
    id: row.id as string,
    token: row.token as string,
    email: row.email as string,
    role: row.role as 'admin' | 'editor',
    createdBy: row.created_by as string,
    expiresAt: row.expires_at as string,
    usedAt: row.used_at as string | null,
    usedBy: row.used_by as string | null,
    createdAt: row.created_at as string,
  }
}

/**
 * Helper to verify the current user is an admin
 */
async function requireAdmin(): Promise<string> {
  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    throw new Error('User profile not found')
  }

  if (profile.role !== 'admin') {
    throw new Error('Admin access required')
  }

  return user.id
}

export function registerUsersHandlers(): void {
  // Get all users (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.GET_ALL, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return []
      }

      await requireAdmin()
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return (data || []).map(transformUserProfile)
    })
  })

  // Get user by ID (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.GET_BY_ID, async (_, userId: string) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return null
      }

      await requireAdmin()
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Not found
        }
        throw new Error(error.message)
      }

      return data ? transformUserProfile(data) : null
    })
  })

  // Update user role (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.UPDATE_ROLE, async (_, userId: string, role: UserRole) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured')
      }

      const currentUserId = await requireAdmin()
      const supabase = getSupabase()

      // Prevent admin from demoting themselves
      if (userId === currentUserId && role !== 'admin') {
        throw new Error('You cannot change your own role')
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return transformUserProfile(data)
    })
  })

  // Delete user (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.DELETE, async (_, userId: string) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured')
      }

      const currentUserId = await requireAdmin()
      const supabase = getSupabase()

      // Prevent admin from deleting themselves
      if (userId === currentUserId) {
        throw new Error('You cannot delete your own account')
      }

      // Delete the user profile (the user in auth.users will still exist but won't have access)
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)

      if (error) {
        throw new Error(error.message)
      }

      return { success: true }
    })
  })

  // Create invite token (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.CREATE_INVITE, async (_, input: CreateInviteInput) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured')
      }

      const currentUserId = await requireAdmin()
      const supabase = getSupabase()

      // Check if email already has an active invite
      const { data: existingInvite } = await supabase
        .from('invite_tokens')
        .select('id')
        .eq('email', input.email)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (existingInvite) {
        throw new Error('An active invite already exists for this email')
      }

      // Check if email already has an account
      const { data: existingUser } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', input.email)
        .single()

      if (existingUser) {
        throw new Error('A user with this email already exists')
      }

      // Generate invite token
      const token = uuidv4()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 day expiry

      const { data, error } = await supabase
        .from('invite_tokens')
        .insert({
          token,
          email: input.email,
          role: input.role,
          created_by: currentUserId,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return transformInviteToken(data)
    })
  })

  // Get all invites (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.GET_INVITES, async () => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        return []
      }

      await requireAdmin()
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('invite_tokens')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return (data || []).map(transformInviteToken)
    })
  })

  // Revoke invite (admin only)
  ipcMain.handle(IPC_CHANNELS.USERS.REVOKE_INVITE, async (_, inviteId: string) => {
    return handleIpcError(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Authentication is not configured')
      }

      await requireAdmin()
      const supabase = getSupabase()

      // Delete the invite token
      const { error } = await supabase
        .from('invite_tokens')
        .delete()
        .eq('id', inviteId)
        .is('used_at', null) // Only delete if not used

      if (error) {
        throw new Error(error.message)
      }

      return { success: true }
    })
  })
}
