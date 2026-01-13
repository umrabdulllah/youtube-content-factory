import type { ChannelSettings } from './channel.types'

export type ProjectStatus =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'archived'

export type GenerationPhase = 'idle' | 'initializing' | 'generating' | 'complete' | 'error'
export type GenerationStatus = 'pending' | 'waiting' | 'generating' | 'complete' | 'error'

export interface GenerationProgress {
  phase: GenerationPhase

  prompts?: {
    status: GenerationStatus
    total: number
    generated: number
    batches: number
    currentBatch: number
  }

  images?: {
    status: GenerationStatus
    total: number
    completed: number
    failed: number
  }

  audio?: {
    status: GenerationStatus
    progress: number
    chunks?: { total: number; completed: number }
    duration?: number
  }

  subtitles?: {
    status: GenerationStatus
    lineCount?: number
  }

  error?: string
}

export interface Project {
  id: string
  channelId: string
  title: string
  slug: string
  script?: string
  scriptWordCount: number
  status: ProjectStatus
  generationProgress: GenerationProgress
  imageCount: number
  audioDurationSeconds?: number
  subtitleCount: number
  errorMessage?: string
  errorDetails?: Record<string, unknown>
  settingsOverride: ChannelSettings
  generateImages: boolean
  generateAudio: boolean
  generateSubtitles: boolean
  createdAt: string
  updatedAt: string
  queuedAt?: string
  startedAt?: string
  completedAt?: string
}

export interface ProjectWithChannel extends Project {
  channelName: string
  categoryId: string
  categoryName: string
  categoryColor: string
}

export interface CreateProjectInput {
  channelId: string
  title: string
  script: string
  settingsOverride?: ChannelSettings
  generateImages?: boolean
  generateAudio?: boolean
  generateSubtitles?: boolean
}

export interface UpdateProjectInput {
  id: string
  title?: string
  script?: string
  status?: ProjectStatus
  settingsOverride?: ChannelSettings
}

export interface ProjectGenerationLog {
  timestamp: string
  event: string
  details?: Record<string, unknown>
}
