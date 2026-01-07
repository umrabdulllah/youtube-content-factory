/**
 * API Keys Service
 *
 * Manages centralized API keys:
 * - Admin: Store/update/delete keys in Supabase
 * - All users: Fetch keys and cache locally with encryption
 * - Editors: Only see masked values
 */

import { safeStorage } from 'electron'
import { getDatabase } from '../database'
import { getSupabase, isSupabaseConfigured } from './supabase'
import type { ApiKeyType, ApiKeysConfig, MaskedApiKeys } from '../../shared/types'

const API_KEY_TYPES: ApiKeyType[] = ['anthropicApi', 'openaiApi', 'replicateApi', 'voiceApi']

// Cache duration: 7 days in milliseconds
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000

// In-memory cache for current session
let memoryCache: ApiKeysConfig | null = null

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
