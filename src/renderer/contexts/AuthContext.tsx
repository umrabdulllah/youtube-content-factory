import * as React from 'react'
import type { AuthState } from '@shared/types'

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  isAdmin: boolean
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // Check for existing session on mount
  React.useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    try {
      const { user } = await window.api.auth.getSession()
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      })
    } catch (error) {
      console.error('[Auth] Session check failed:', error)
      setState({ user: null, isAuthenticated: false, isLoading: false })
    }
  }

  const login = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }))
    try {
      const { user } = await window.api.auth.login({ email, password })
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      throw error
    }
  }

  const logout = async () => {
    setState((prev) => ({ ...prev, isLoading: true }))
    try {
      await window.api.auth.logout()
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    } catch (error) {
      console.error('[Auth] Logout failed:', error)
      // Even if logout fails, clear local state
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  }

  const refreshSession = async () => {
    try {
      const { user } = await window.api.auth.refreshSession()
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      })
    } catch (error) {
      console.error('[Auth] Session refresh failed:', error)
      setState({ user: null, isAuthenticated: false, isLoading: false })
    }
  }

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshSession,
    isAdmin: state.user?.role === 'admin',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
