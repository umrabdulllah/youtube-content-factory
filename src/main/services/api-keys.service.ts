/**
 * API Keys Service
 *
 * Manages API keys with role-based access:
 * - Admin: Store/update/delete org-wide keys in Supabase (shared with editors)
 * - Manager: Store/update/delete personal keys (isolated, no fallback to org keys)
 * - Editor: Read-only access to masked org-wide keys
 */

import { safeStorage } from 'electron'
import { getDatabase } from '../database'
import { getSupabase, isSupabaseConfigured } from './supabase'
import type { ApiKeyType, ApiKeysConfig, MaskedApiKeys, UserRole } from '../../shared/types'

const API_KEY_TYPES: ApiKeyType[] = ['anthropicApi', 'openaiApi', 'replicateApi', 'voiceApi']

// Cache duration: 7 days in milliseconds
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000

// In-memory cache for org-wide keys (admin/editor)
let memoryCache: ApiKeysConfig | null = null

// In-memory cache for user-specific keys (managers)
const userMemoryCache: Map<string, ApiKeysConfig> = new Map()

/**
 * Set an API key (Admin only)
 * Stores the key in Supabase api_keys table
 */
export async function setApiKey(keyType: ApiKeyType, value: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()

  // Verify admin role
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Only admins can set API keys')
  }

  // Encrypt the key before storing
  // We use a simple encoding here - Supabase Vault could be used for more security
  // For now, we base64 encode with a simple XOR for basic obfuscation
  const encryptedValue = encryptForStorage(value)

  // Upsert to Supabase
  const { error } = await supabase
    .from('api_keys')
    .upsert({
      key_type: keyType,
      encrypted_value: encryptedValue,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })

  if (error) throw error

  // Clear memory cache to force refresh
  memoryCache = null

  console.log(`[ApiKeysService] Set API key: ${keyType}`)
}

/**
 * Delete an API key (Admin only)
 */
export async function deleteApiKey(keyType: ApiKeyType): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()

  // Verify admin role
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Only admins can delete API keys')
  }

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('key_type', keyType)

  if (error) throw error

  // Clear caches
  memoryCache = null
  clearLocalCache(keyType)

  console.log(`[ApiKeysService] Deleted API key: ${keyType}`)
}

/**
 * Fetch API keys from Supabase and cache locally
 * This is called on app start / login
 */
export async function fetchAndCacheKeys(): Promise<ApiKeysConfig> {
  // Return memory cache if available
  if (memoryCache) {
    return memoryCache
  }

  // Try to fetch from Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('[ApiKeysService] Not authenticated, using local cache')
        return getLocalCachedKeys()
      }

      const { data, error } = await supabase
        .from('api_keys')
        .select('key_type, encrypted_value')

      if (error) {
        console.error('[ApiKeysService] Failed to fetch keys:', error)
        return getLocalCachedKeys()
      }

      const keys: ApiKeysConfig = {}

      for (const row of data || []) {
        const decrypted = decryptFromStorage(row.encrypted_value)
        keys[row.key_type as ApiKeyType] = decrypted
      }

      // Cache locally for offline use
      await cacheKeysLocally(keys)
      memoryCache = keys

      console.log('[ApiKeysService] Fetched and cached API keys from cloud')
      return keys
    } catch (error) {
      console.error('[ApiKeysService] Error fetching keys:', error)
      return getLocalCachedKeys()
    }
  }

  return getLocalCachedKeys()
}

/**
 * Get a specific API key for use in generation services
 */
export async function getApiKey(keyType: ApiKeyType): Promise<string | null> {
  const keys = await fetchAndCacheKeys()
  return keys[keyType] || null
}

/**
 * Get all API keys for admin (full values)
 */
export async function getAllKeysForAdmin(): Promise<ApiKeysConfig> {
  return fetchAndCacheKeys()
}

/**
 * Get masked keys for display in UI (safe for editors)
 */
export async function getMaskedKeys(): Promise<MaskedApiKeys> {
  const keys = await fetchAndCacheKeys()

  return {
    anthropicApi: keys.anthropicApi ? maskKey(keys.anthropicApi) : null,
    openaiApi: keys.openaiApi ? maskKey(keys.openaiApi) : null,
    replicateApi: keys.replicateApi ? maskKey(keys.replicateApi) : null,
    voiceApi: keys.voiceApi ? maskKey(keys.voiceApi) : null,
  }
}

/**
 * Check which keys are configured (for UI status display)
 */
export async function getKeyStatus(): Promise<Record<ApiKeyType, boolean>> {
  const keys = await fetchAndCacheKeys()

  return {
    anthropicApi: !!keys.anthropicApi,
    openaiApi: !!keys.openaiApi,
    replicateApi: !!keys.replicateApi,
    voiceApi: !!keys.voiceApi,
  }
}

/**
 * Clear all local caches (call on logout)
 */
export function clearAllCaches(): void {
  memoryCache = null

  try {
    const db = getDatabase()
    db.prepare('DELETE FROM cached_api_keys').run()
    console.log('[ApiKeysService] Cleared all cached API keys')
  } catch (error) {
    console.error('[ApiKeysService] Failed to clear cache:', error)
  }
}

/**
 * Force refresh from cloud (clears cache first)
 */
export async function refreshFromCloud(): Promise<ApiKeysConfig> {
  memoryCache = null
  return fetchAndCacheKeys()
}

// ============================================================
// User-Scoped API Keys (for Managers)
// ============================================================

/**
 * Set a user's personal API key (Manager only)
 * Stores the key in Supabase user_api_keys table
 */
export async function setUserApiKey(userId: string, keyType: ApiKeyType, value: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()

  // Encrypt the key before storing
  const encryptedValue = encryptForStorage(value)

  // Upsert to Supabase user_api_keys table
  const { error } = await supabase
    .from('user_api_keys')
    .upsert({
      user_id: userId,
      key_type: keyType,
      encrypted_value: encryptedValue,
      updated_at: new Date().toISOString(),
    })

  if (error) throw error

  // Clear user-specific memory cache
  userMemoryCache.delete(userId)

  console.log(`[ApiKeysService] Set user API key: ${keyType} for user ${userId}`)
}

/**
 * Delete a user's personal API key (Manager only)
 */
export async function deleteUserApiKey(userId: string, keyType: ApiKeyType): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured')
  }

  const supabase = getSupabase()

  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('key_type', keyType)

  if (error) throw error

  // Clear caches
  userMemoryCache.delete(userId)
  clearUserLocalCache(userId, keyType)

  console.log(`[ApiKeysService] Deleted user API key: ${keyType} for user ${userId}`)
}

/**
 * Fetch a user's personal API keys from Supabase
 */
export async function fetchUserKeys(userId: string): Promise<ApiKeysConfig> {
  // Return memory cache if available
  const cached = userMemoryCache.get(userId)
  if (cached) {
    return cached
  }

  // Try to fetch from Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('user_api_keys')
        .select('key_type, encrypted_value')
        .eq('user_id', userId)

      if (error) {
        console.error('[ApiKeysService] Failed to fetch user keys:', error)
        return getUserLocalCachedKeys(userId)
      }

      const keys: ApiKeysConfig = {}

      for (const row of data || []) {
        const decrypted = decryptFromStorage(row.encrypted_value)
        keys[row.key_type as ApiKeyType] = decrypted
      }

      // Cache locally for offline use
      await cacheUserKeysLocally(userId, keys)
      userMemoryCache.set(userId, keys)

      console.log(`[ApiKeysService] Fetched and cached user API keys for ${userId}`)
      return keys
    } catch (error) {
      console.error('[ApiKeysService] Error fetching user keys:', error)
      return getUserLocalCachedKeys(userId)
    }
  }

  return getUserLocalCachedKeys(userId)
}

/**
 * Get a specific API key for a user based on their role
 * - Admin/Editor: Use org-wide keys
 * - Manager: Use personal keys only (NO fallback to org keys)
 */
export async function getApiKeyForUser(
  keyType: ApiKeyType,
  userId: string,
  role: UserRole
): Promise<string | null> {
  if (role === 'manager') {
    // Managers MUST use their own keys - no fallback to org keys
    const keys = await fetchUserKeys(userId)
    return keys[keyType] || null
  } else {
    // Admin/Editor use org-wide keys
    return getApiKey(keyType)
  }
}

/**
 * Get all keys for a user based on their role
 */
export async function getAllKeysForUser(
  userId: string,
  role: UserRole
): Promise<ApiKeysConfig> {
  if (role === 'manager') {
    return fetchUserKeys(userId)
  } else {
    return fetchAndCacheKeys()
  }
}

/**
 * Get masked keys for a user based on their role
 */
export async function getMaskedKeysForUser(
  userId: string,
  role: UserRole
): Promise<MaskedApiKeys> {
  const keys = await getAllKeysForUser(userId, role)

  return {
    anthropicApi: keys.anthropicApi ? maskKey(keys.anthropicApi) : null,
    openaiApi: keys.openaiApi ? maskKey(keys.openaiApi) : null,
    replicateApi: keys.replicateApi ? maskKey(keys.replicateApi) : null,
    voiceApi: keys.voiceApi ? maskKey(keys.voiceApi) : null,
  }
}

/**
 * Check which keys are configured for a user
 */
export async function getKeyStatusForUser(
  userId: string,
  role: UserRole
): Promise<Record<ApiKeyType, boolean>> {
  const keys = await getAllKeysForUser(userId, role)

  return {
    anthropicApi: !!keys.anthropicApi,
    openaiApi: !!keys.openaiApi,
    replicateApi: !!keys.replicateApi,
    voiceApi: !!keys.voiceApi,
  }
}

/**
 * Clear all caches for a specific user (call on user logout)
 */
export function clearUserCaches(userId: string): void {
  userMemoryCache.delete(userId)

  try {
    const db = getDatabase()
    db.prepare('DELETE FROM user_cached_api_keys WHERE user_id = ?').run(userId)
    console.log(`[ApiKeysService] Cleared cached API keys for user ${userId}`)
  } catch (error) {
    console.error('[ApiKeysService] Failed to clear user cache:', error)
  }
}

/**
 * Force refresh user keys from cloud
 */
export async function refreshUserKeysFromCloud(userId: string): Promise<ApiKeysConfig> {
  userMemoryCache.delete(userId)
  return fetchUserKeys(userId)
}

// ============================================================
// Private helpers
// ============================================================

/**
 * Mask a key for display (show first 4 and last 4 chars)
 */
function maskKey(key: string): string {
  if (key.length <= 8) {
    return '•'.repeat(8)
  }
  const prefix = key.substring(0, 4)
  const suffix = key.substring(key.length - 4)
  const middle = '•'.repeat(Math.min(key.length - 8, 20))
  return prefix + middle + suffix
}

/**
 * Simple encryption for storage
 * Uses XOR with a fixed key + base64
 * Note: This is basic obfuscation, not cryptographic security
 * For production, consider using Supabase Vault or proper encryption
 */
function encryptForStorage(value: string): string {
  const key = 'YCF_API_KEY_ENCRYPT_2024'
  let result = ''
  for (let i = 0; i < value.length; i++) {
    result += String.fromCharCode(value.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return Buffer.from(result).toString('base64')
}

function decryptFromStorage(encrypted: string): string {
  const key = 'YCF_API_KEY_ENCRYPT_2024'
  const decoded = Buffer.from(encrypted, 'base64').toString()
  let result = ''
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return result
}

/**
 * Cache keys locally using Electron safeStorage
 */
async function cacheKeysLocally(keys: ApiKeysConfig): Promise<void> {
  try {
    const db = getDatabase()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + CACHE_DURATION_MS).toISOString()

    for (const keyType of API_KEY_TYPES) {
      const value = keys[keyType]
      if (!value) continue

      // Encrypt with Electron safeStorage if available
      let encrypted: string
      if (safeStorage.isEncryptionAvailable()) {
        encrypted = safeStorage.encryptString(value).toString('base64')
      } else {
        // Fallback: base64 only (less secure)
        encrypted = Buffer.from(value).toString('base64')
      }

      db.prepare(`
        INSERT INTO cached_api_keys (key_type, encrypted_value, cached_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key_type) DO UPDATE SET
          encrypted_value = excluded.encrypted_value,
          cached_at = excluded.cached_at,
          expires_at = excluded.expires_at
      `).run(keyType, encrypted, now, expiresAt)
    }

    console.log('[ApiKeysService] Cached API keys locally')
  } catch (error) {
    console.error('[ApiKeysService] Failed to cache keys locally:', error)
  }
}

/**
 * Get locally cached keys (for offline use)
 */
function getLocalCachedKeys(): ApiKeysConfig {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT key_type, encrypted_value FROM cached_api_keys
      WHERE expires_at > datetime('now')
    `).all() as Array<{ key_type: string; encrypted_value: string }>

    const keys: ApiKeysConfig = {}

    for (const row of rows) {
      let decrypted: string
      if (safeStorage.isEncryptionAvailable()) {
        decrypted = safeStorage.decryptString(Buffer.from(row.encrypted_value, 'base64'))
      } else {
        decrypted = Buffer.from(row.encrypted_value, 'base64').toString()
      }
      keys[row.key_type as ApiKeyType] = decrypted
    }

    if (Object.keys(keys).length > 0) {
      console.log('[ApiKeysService] Using locally cached API keys')
      memoryCache = keys
    }

    return keys
  } catch (error) {
    console.error('[ApiKeysService] Failed to get local cached keys:', error)
    return {}
  }
}

/**
 * Clear a specific key from local cache
 */
function clearLocalCache(keyType: ApiKeyType): void {
  try {
    const db = getDatabase()
    db.prepare('DELETE FROM cached_api_keys WHERE key_type = ?').run(keyType)
  } catch (error) {
    console.error('[ApiKeysService] Failed to clear local cache:', error)
  }
}

// ============================================================
// User-specific local cache helpers
// ============================================================

/**
 * Cache user-specific keys locally using Electron safeStorage
 */
async function cacheUserKeysLocally(userId: string, keys: ApiKeysConfig): Promise<void> {
  try {
    const db = getDatabase()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + CACHE_DURATION_MS).toISOString()

    for (const keyType of API_KEY_TYPES) {
      const value = keys[keyType]
      if (!value) continue

      // Encrypt with Electron safeStorage if available
      let encrypted: string
      if (safeStorage.isEncryptionAvailable()) {
        encrypted = safeStorage.encryptString(value).toString('base64')
      } else {
        // Fallback: base64 only (less secure)
        encrypted = Buffer.from(value).toString('base64')
      }

      db.prepare(`
        INSERT INTO user_cached_api_keys (user_id, key_type, encrypted_value, cached_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, key_type) DO UPDATE SET
          encrypted_value = excluded.encrypted_value,
          cached_at = excluded.cached_at,
          expires_at = excluded.expires_at
      `).run(userId, keyType, encrypted, now, expiresAt)
    }

    console.log(`[ApiKeysService] Cached user API keys locally for ${userId}`)
  } catch (error) {
    console.error('[ApiKeysService] Failed to cache user keys locally:', error)
  }
}

/**
 * Get locally cached user keys (for offline use)
 */
function getUserLocalCachedKeys(userId: string): ApiKeysConfig {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT key_type, encrypted_value FROM user_cached_api_keys
      WHERE user_id = ? AND expires_at > datetime('now')
    `).all(userId) as Array<{ key_type: string; encrypted_value: string }>

    const keys: ApiKeysConfig = {}

    for (const row of rows) {
      let decrypted: string
      if (safeStorage.isEncryptionAvailable()) {
        decrypted = safeStorage.decryptString(Buffer.from(row.encrypted_value, 'base64'))
      } else {
        decrypted = Buffer.from(row.encrypted_value, 'base64').toString()
      }
      keys[row.key_type as ApiKeyType] = decrypted
    }

    if (Object.keys(keys).length > 0) {
      console.log(`[ApiKeysService] Using locally cached API keys for user ${userId}`)
      userMemoryCache.set(userId, keys)
    }

    return keys
  } catch (error) {
    console.error('[ApiKeysService] Failed to get local cached user keys:', error)
    return {}
  }
}

/**
 * Clear a specific key from user's local cache
 */
function clearUserLocalCache(userId: string, keyType: ApiKeyType): void {
  try {
    const db = getDatabase()
    db.prepare('DELETE FROM user_cached_api_keys WHERE user_id = ? AND key_type = ?').run(userId, keyType)
  } catch (error) {
    console.error('[ApiKeysService] Failed to clear user local cache:', error)
  }
}
