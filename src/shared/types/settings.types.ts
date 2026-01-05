export interface AppSettings {
  // Storage
  basePath: string

  // API Keys
  apiKeys: {
    // Prompt Generation (one of these)
    anthropicApi?: string      // sk-ant-* keys for Claude
    openaiApi?: string         // sk-* keys for GPT

    // Image Generation
    replicateApi?: string      // r8_* keys for Replicate

    // Audio Generation (Russian TTS)
    voiceApi?: string          // voiceapi.csv666.ru key

    // Legacy (keep for backwards compat)
    imageApi?: string
    ttsApi?: string
    subtitleApi?: string
  }

  // Voice Settings
  voiceTemplateId?: string     // Voice template UUID for TTS

  // Prompt Generation
  promptModel: PromptModel

  // Generation Defaults
  defaultVoice: string
  defaultImageStyle: string
  defaultLanguage: string

  // Queue Settings
  maxConcurrentTasks: number
  maxConcurrentImages: number  // Parallel image generation limit (1-8)

  // UI Preferences
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
}

export type PromptModel = 'claude-sonnet-4-5' | 'gpt-4o-mini' | 'gpt-4o' | 'gpt-5.2' | 'gpt-5-mini'

export interface VoiceTemplate {
  id: string
  uuid?: string
  name: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  basePath: '',
  apiKeys: {},
  voiceTemplateId: undefined,
  promptModel: 'claude-sonnet-4-5',
  defaultVoice: 'en-US-Neural2-J',
  defaultImageStyle: 'cinematic',
  defaultLanguage: 'en',
  maxConcurrentTasks: 2,
  maxConcurrentImages: 4,
  theme: 'dark',
  sidebarCollapsed: false,
}
