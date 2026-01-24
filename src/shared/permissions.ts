import type { UserRole } from './types'

// Permission definitions: which roles can do what
// - Admin: Full access to org-wide content and settings
// - Manager: Independent user with own API keys and isolated content
// - Editor: Limited access, uses admin's org-wide API keys
export const PERMISSIONS = {
  // Category permissions (managers manage their own categories)
  'categories:create': ['admin', 'manager'],
  'categories:update': ['admin', 'manager'],
  'categories:delete': ['admin', 'manager'],
  'categories:view': ['admin', 'editor', 'manager'],

  // Channel permissions (managers manage their own channels)
  'channels:create': ['admin', 'manager'],
  'channels:update': ['admin', 'editor', 'manager'],
  'channels:delete': ['admin', 'manager'],
  'channels:view': ['admin', 'editor', 'manager'],

  // Project permissions (managers manage their own projects)
  'projects:create': ['admin', 'editor', 'manager'],
  'projects:update': ['admin', 'editor', 'manager'],
  'projects:delete': ['admin', 'editor', 'manager'],
  'projects:view': ['admin', 'editor', 'manager'],
  'projects:generate': ['admin', 'editor', 'manager'],

  // Queue permissions
  'queue:view': ['admin', 'editor', 'manager'],
  'queue:manage': ['admin', 'manager'],

  // Settings permissions (managers can manage their own settings)
  'settings:view': ['admin', 'manager'],
  'settings:update': ['admin', 'manager'],

  // API key permissions
  'apiKeys:manageOrg': ['admin'], // Org-wide keys for editors
  'apiKeys:manageSelf': ['manager'], // Personal keys

  // User management (admin only)
  'users:view': ['admin'],
  'users:manage': ['admin'],
  'users:invite': ['admin'],

  // Admin dashboard
  'admin:dashboard': ['admin'],
} as const

export type Permission = keyof typeof PERMISSIONS

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly string[]
  return allowedRoles.includes(role)
}

/**
 * Check if user can manage API keys (either org-wide or personal)
 */
export function canManageApiKeys(role: UserRole): boolean {
  return hasPermission(role, 'apiKeys:manageOrg') || hasPermission(role, 'apiKeys:manageSelf')
}
