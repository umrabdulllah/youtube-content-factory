export type TaskType = 'prompts' | 'audio' | 'images' | 'subtitles'
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

// Progress details for each stage type
export interface PromptsProgressDetails {
  status: 'generating' | 'complete'
  total: number
  generated: number
  batches: number
  currentBatch: number
  activeWorkers?: number
  maxWorkers?: number
}

export interface AudioProgressDetails {
  status: 'generating' | 'complete'
  progress: number
  activeWorkers?: number
}

export interface ImagesProgressDetails {
  status: 'generating' | 'complete'
  total: number
  completed: number
  failed: number
  currentFile?: string
  activeWorkers?: number
  maxWorkers?: number
}

export interface SubtitlesProgressDetails {
  status: 'generating' | 'complete'
  lineCount?: number
  activeWorkers?: number
}

export interface StageProgressDetails {
  prompts?: PromptsProgressDetails
  audio?: AudioProgressDetails
  images?: ImagesProgressDetails
  subtitles?: SubtitlesProgressDetails
}

export interface QueueTask {
  id: string
  projectId: string
  taskType: TaskType
  status: TaskStatus
  priority: number
  progress: number
  progressDetails?: StageProgressDetails
  attempts: number
  maxAttempts: number
  dependsOnTaskId?: string
  stageGroup?: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  errorStack?: string
}

export interface QueueTaskWithProject extends QueueTask {
  projectTitle: string
  channelName: string
  categoryName: string
}

export interface ConcurrencyStats {
  activeWorkers: number
  activeProjects: number
  stageWorkers: Record<TaskType, number>
  maxProjects: number
  maxPerStage: number
}

export interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  total: number
  // Concurrency info
  activeWorkers: number
  activeProjects: number
  stageWorkers: Record<TaskType, number>
  maxProjects: number
  maxPerStage: number
}
