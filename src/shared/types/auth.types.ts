// User role enum
export type UserRole = 'admin' | 'editor' | 'manager'

// User profile from Supabase
export interface UserProfile {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  invitedBy: string | null
  invitedAt: string | null
  createdAt: string
  updatedAt: string
}

// Auth state
export interface AuthState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean
}

// Login credentials
export interface LoginCredentials {
  email: string
  password: string
}

// Invite creation input
export interface CreateInviteInput {
  email: string
  role: UserRole
}

// Invite token
export interface InviteToken {
  id: string
  token: string
  email: string
  role: UserRole
  createdBy: string
  expiresAt: string
  usedAt: string | null
  usedBy: string | null
  createdAt: string
}

// Registration with invite
export interface RegisterWithInviteInput {
  email: string
  password: string
  displayName: string
  inviteToken: string
}

// Auth result types
export interface AuthResult {
  user: UserProfile
  session: {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
}

export interface LogoutResult {
  success: boolean
}

export interface SessionResult {
  user: UserProfile | null
  session: {
    accessToken: string
    refreshToken: string
    expiresAt: number
  } | null
}
