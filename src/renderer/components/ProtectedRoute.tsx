import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** Require admin role */
  requireAdmin?: boolean
  /** Require admin OR manager role */
  requireAdminOrManager?: boolean
  /** Require ability to manage API keys (admin or manager) */
  requireApiKeyAccess?: boolean
}

/**
 * Protects routes that require authentication.
 * Supports multiple role requirements:
 * - requireAdmin: Only admins can access
 * - requireAdminOrManager: Admins and managers can access
 * - requireApiKeyAccess: Users who can manage API keys (admin or manager)
 */
export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireAdminOrManager = false,
  requireApiKeyAccess = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, isAdmin, isManager, canManageApiKeys } = useAuth()

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Redirect to home if admin required but user is not admin
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  // Redirect to home if admin or manager required but user is neither
  if (requireAdminOrManager && !isAdmin && !isManager) {
    return <Navigate to="/" replace />
  }

  // Redirect to home if API key access required but user cannot manage keys
  if (requireApiKeyAccess && !canManageApiKeys) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
