import { createClient, SupabaseClient, Session } from '@supabase/supabase-js'
import { safeStorage } from 'electron'
import Store from 'electron-store'

// Hardcoded Supabase credentials - update these with your actual values
// These are baked into the build so editors don't need to configure anything
const SUPABASE_URL = 'https://grzerododqtjjcamtfxa.supabase.co' // e.g., https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyemVyb2RvZHF0ampjYW10ZnhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MjM4NjQsImV4cCI6MjA4MzE5OTg2NH0.6ajmzx9WU6DKDEiQxguaKnlcM1PuDSa-w1GGk2JV5NI' // Your anon/public key

// Electron store for persisting auth data
const authStore = new Store({
  name: 'auth-storage',
  defaults: {
    session: null as string | null,
  },
})

let supabaseClient: SupabaseClient | null = null

/**
 * Initialize the Supabase client
 * Should be called early in app startup
 */
export function initializeSupabase(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  // Validate credentials are set
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase] Credentials not configured. Authentication features will be disabled.')
  }

  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: {
        getItem: (key: string) => {
          try {
            const encrypted = authStore.get(key) as string | null
            if (!encrypted) return null
            // If safeStorage is available, decrypt
            if (safeStorage.isEncryptionAvailable()) {
              return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
            }
            return encrypted
          } catch (error) {
            console.error('[Supabase] Failed to get storage item:', error)
            return null
          }
        },
        setItem: (key: string, value: string) => {
          try {
            // If safeStorage is available, encrypt
            if (safeStorage.isEncryptionAvailable()) {
              const encrypted = safeStorage.encryptString(value)
              authStore.set(key, encrypted.toString('base64'))
            } else {
              authStore.set(key, value)
            }
          } catch (error) {
            console.error('[Supabase] Failed to set storage item:', error)
          }
        },
        removeItem: (key: string) => {
          try {
            authStore.delete(key as keyof typeof authStore.store)
          } catch (error) {
            console.error('[Supabase] Failed to remove storage item:', error)
          }
        },
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Not needed for Electron
    },
  })

  console.log('[Supabase] Client initialized')
  return supabaseClient
}

/**
 * Get the Supabase client instance
 * Throws if not initialized
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initializeSupabase() first.')
  }
  return supabaseClient
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_URL.includes('.supabase.co') &&
    SUPABASE_ANON_KEY.length > 50
  )
}

/**
 * Securely store a session using Electron's safeStorage
 */
export async function storeSessionSecurely(session: Session): Promise<void> {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(session))
      authStore.set('secure_session', encrypted.toString('base64'))
    } else {
      // Fallback to unencrypted storage
      authStore.set('secure_session', JSON.stringify(session))
    }
  } catch (error) {
    console.error('[Supabase] Failed to store session securely:', error)
    throw error
  }
}

/**
 * Retrieve a securely stored session
 */
export async function getStoredSession(): Promise<Session | null> {
  try {
    const stored = authStore.get('secure_session') as string | undefined
    if (!stored) return null

    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'))
      return JSON.parse(decrypted)
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('[Supabase] Failed to retrieve stored session:', error)
    return null
  }
}

/**
 * Clear all stored authentication data
 */
export function clearStoredSession(): void {
  try {
    authStore.delete('secure_session' as keyof typeof authStore.store)
    authStore.delete('session' as keyof typeof authStore.store)
    // Clear any Supabase auth keys
    const keys = ['sb-' + SUPABASE_URL.split('//')[1]?.split('.')[0] + '-auth-token']
    keys.forEach((key) => {
      try {
        authStore.delete(key as keyof typeof authStore.store)
      } catch {
        // Ignore errors for keys that don't exist
      }
    })
    console.log('[Supabase] Cleared stored session')
  } catch (error) {
    console.error('[Supabase] Failed to clear stored session:', error)
  }
}

/**
 * Clean up Supabase client on app shutdown
 */
export async function cleanupSupabase(): Promise<void> {
  if (supabaseClient) {
    // Sign out to clean up any listeners
    await supabaseClient.auth.signOut()
    supabaseClient = null
    console.log('[Supabase] Client cleaned up')
  }
}
