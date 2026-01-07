/**
 * Types for centralized API key management
 */

export type ApiKeyType = 'anthropicApi' | 'openaiApi' | 'replicateApi' | 'voiceApi'

export interface ApiKeysConfig {
  anthropicApi?: string
  openaiApi?: string
  replicateApi?: string
  voiceApi?: string
}

export interface MaskedApiKeys {
  anthropicApi: string | null
  openaiApi: string | null
  replicateApi: string | null
  voiceApi: string | null
}

export interface ApiKeyInfo {
  keyType: ApiKeyType
  isConfigured: boolean
  maskedValue: string | null
  updatedAt?: string
}

export interface SetApiKeyInput {
  keyType: ApiKeyType
  value: string
}

export interface CloudSyncVersions {
  categories: number
  channels: number
  apiKeys: number
}

export interface CloudSyncStatus {
  isOnline: boolean
  lastSyncedAt: string | null
  pendingChanges: number
  versions: CloudSyncVersions
}

export interface CloudCategory {
  id: string
  name: string
  slug: string
  description?: string
  color: string
  icon: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CloudChannel {
  id: string
  categoryId: string
  name: string
  slug: string
  description?: string
  defaultSettings: Record<string, unknown>
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PushAllResult {
  success: boolean
  categoriesPushed: number
  categoriesFailed: number
  channelsPushed: number
  channelsFailed: number
  errors: string[]
}
