import type { ChannelSettings } from '@shared/types/channel.types'

// Progress update interface for all generation services
export interface ProgressUpdate {
  percentage: number // 0-100
  message: string
  details?: Record<string, unknown>
}

// Progress callback type
export type ProgressCallback = (progress: ProgressUpdate) => void

// Base interface for all generation services
export interface GenerationService<TInput, TOutput> {
  readonly name: string

  // Validate service configuration (API keys, etc.)
  validateConfig(): Promise<{ valid: boolean; error?: string }>

  // Generate assets with progress reporting
  generate(
    input: TInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<TOutput>

  // Optional: Estimate cost before running
  estimateCost?(input: TInput): Promise<{ amount: number; currency: string }>
}

// ============================================
// IMAGE GENERATION TYPES
// ============================================

export interface ImageGenerationInput {
  projectId: string
  projectPath: string // Absolute path to project directory
  script?: string // Optional if prompts are provided directly
  prompts?: string[] // Pre-generated prompts (from prompt generation service)
  settings: {
    style?: string
    model?: string
    customPromptPrefix?: string
    customPromptSuffix?: string
    maxConcurrentImages?: number // Parallel image generation limit (1-8)
  }
}

export interface ImageGenerationOutput {
  images: string[] // File paths to generated images
  count: number
  prompts: string[] // Prompts used (for debugging/logging)
  failedIndices?: number[] // Indices of prompts that failed (for retry logic)
}

export interface ImageGenerationService
  extends GenerationService<ImageGenerationInput, ImageGenerationOutput> {
  readonly name: 'images'
}

// ============================================
// AUDIO GENERATION TYPES
// ============================================

export interface AudioGenerationInput {
  projectId: string
  projectPath: string
  script: string
  settings: {
    voiceId?: string
    voiceSpeed?: number
    language?: string
  }
}

export interface AudioGenerationOutput {
  audioPath: string // Path to generated audio file
  durationSeconds: number
  format: string // 'mp3', 'wav', etc.
}

export interface AudioGenerationService
  extends GenerationService<AudioGenerationInput, AudioGenerationOutput> {
  readonly name: 'audio'
}

// ============================================
// SUBTITLE GENERATION TYPES
// ============================================

export interface SubtitleGenerationInput {
  projectId: string
  projectPath: string
  audioPath: string // Path to audio file for transcription
  script?: string // Optional: Original script for reference
  settings: {
    language?: string
  }
}

export interface SubtitleGenerationOutput {
  subtitlePath: string // Path to SRT file
  lineCount: number
  format: string // 'srt'
}

export interface SubtitleGenerationService
  extends GenerationService<SubtitleGenerationInput, SubtitleGenerationOutput> {
  readonly name: 'subtitles'
}

// ============================================
// QUEUE TASK CONTEXT
// ============================================

// Context passed to services during queue execution
export interface TaskContext {
  taskId: string
  projectId: string
  projectPath: string
  script: string
  settings: ChannelSettings
  onProgress: ProgressCallback
  signal: AbortSignal
}

// Result from queue task execution
export interface TaskResult {
  success: boolean
  output?: ImageGenerationOutput | AudioGenerationOutput | SubtitleGenerationOutput
  error?: string
  errorStack?: string
}

// ============================================
// SERVICE FACTORY
// ============================================

export type ServiceMode = 'mock' | 'real'

export interface GenerationServiceFactory {
  createImageService(mode: ServiceMode): ImageGenerationService
  createAudioService(mode: ServiceMode): AudioGenerationService
  createSubtitleService(mode: ServiceMode): SubtitleGenerationService
}
