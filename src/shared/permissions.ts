import type { UserRole } from './types'

// Permission definitions: which roles can do what
export const PERMISSIONS = {
  // Category permissions
  'categories:create': ['admin'],
  'categories:update': ['admin'],
  'categories:delete': ['admin'],
  'categories:view': ['admin', 'editor'],

  // Channel permissions
  'channels:create': ['admin'],
  'channels:update': ['admin', 'editor'],
  'channels:delete': ['admin'],
  'channels:view': ['admin', 'editor'],

  // Project permissions
  'projects:create': ['admin', 'editor'],
  'projects:update': ['admin', 'editor'],
  'projects:delete': ['admin', 'editor'], // Editors can delete their own
  'projects:view': ['admin', 'editor'],
  'projects:generate': ['admin', 'editor'],

  // Queue permissions
  'queue:view': ['admin', 'editor'],
  'queue:manage': ['admin'],

  // Settings permissions
  'settings:view': ['admin'],
  'settings:update': ['admin'],

  // User management
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
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission))
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission))
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return (Object.entries(PERMISSIONS) as [Permission, readonly string[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([permission]) => permission)
}
