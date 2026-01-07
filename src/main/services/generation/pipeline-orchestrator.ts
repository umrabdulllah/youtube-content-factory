/**
 * Pipeline Orchestrator
 *
 * Coordinates parallel content generation:
 * - Prompts + Audio run in parallel
 * - Images start as prompt batches complete
 * - Subtitles start when audio completes
 * - Emits completion event when all done
 */

import { EventEmitter } from 'events'
import path from 'node:path'
import fs from 'node:fs/promises'
import { generatePrompts, type PromptBatch, type PromptProgress } from './prompt-generation.service'
import { createImageService, type ReplicateImageService } from './image.service'
import { createAudioService, type RussianTTSService } from './audio.service'
import { createSubtitleService, type WhisperXSubtitleService } from './subtitle.service'
import { getApiKey } from '../api-keys.service'
import type { AppSettings } from '../../../shared/types'
import type { ProgressCallback } from './types'

// ============================================
// TYPES
// ============================================

export interface PipelineInput {
  projectId: string
  projectPath: string
  script: string
  settings: AppSettings
}

export interface PipelineProgress {
  phase: 'initializing' | 'generating' | 'complete' | 'error'

  prompts: {
    status: 'pending' | 'generating' | 'complete' | 'error'
    total: number
    generated: number
    batches: number
    currentBatch: number
  }

  images: {
    status: 'pending' | 'waiting' | 'generating' | 'complete' | 'error'
    total: number
    completed: number
    failed: number
  }

  audio: {
    status: 'pending' | 'generating' | 'complete' | 'error'
    progress: number
    chunks: { total: number; completed: number }
    duration?: number
  }

  subtitles: {
    status: 'pending' | 'waiting' | 'generating' | 'complete' | 'error'
    lineCount?: number
  }

  error?: string
}

export interface PipelineResult {
  success: boolean
  prompts: string[]
  images: string[]
  audioPath: string | null
  subtitlePath: string | null
  error?: string
}

// ============================================
// PIPELINE ORCHESTRATOR
// ============================================

export class PipelineOrchestrator extends EventEmitter {
  private abortController: AbortController | null = null

  constructor() {
    super()
  }

  /**
   * Run the complete generation pipeline
   */
  async run(input: PipelineInput, onProgress: (progress: PipelineProgress) => void): Promise<PipelineResult> {
    const { projectPath, script, settings } = input

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // Initialize progress
    const progress: PipelineProgress = {
      phase: 'initializing',
      prompts: { status: 'pending', total: 0, generated: 0, batches: 0, currentBatch: 0 },
      images: { status: 'pending', total: 0, completed: 0, failed: 0 },
      audio: { status: 'pending', progress: 0, chunks: { total: 0, completed: 0 } },
      subtitles: { status: 'pending' },
    }

    // Result state
    let prompts: string[] = []
    let images: string[] = []
    let audioPath: string | null = null
    let subtitlePath: string | null = null

    // Get API keys (with cloud fallback for editors)
    const promptApiKey = await getApiKey('anthropicApi') || await getApiKey('openaiApi')
    const replicateApiKey = await getApiKey('replicateApi')
    const voiceApiKey = await getApiKey('voiceApi')

    try {
      progress.phase = 'generating'
      console.log('[Pipeline Progress] Phase: generating - initial state')
      onProgress({ ...progress })

      // ========================================
      // PHASE 1: Start Prompts + Audio in parallel
      // ========================================

      console.log('[Pipeline] Starting parallel prompt + audio generation')

      // Prompt generation promise
      const promptsPromise = promptApiKey
        ? this.runPromptGeneration(
            script,
            promptApiKey,
            settings.promptModel,
            signal,
            (promptProgress) => {
              progress.prompts = {
                status: promptProgress.phase === 'complete' ? 'complete' : 'generating',
                total: promptProgress.totalPrompts,
                generated: promptProgress.promptsGenerated,
                batches: promptProgress.totalBatches,
                currentBatch: promptProgress.currentBatch,
              }
              console.log('[Pipeline Progress] Prompts:', {
                status: progress.prompts.status,
                generated: progress.prompts.generated,
                total: progress.prompts.total,
              })
              onProgress({ ...progress })
            },
            async (batch) => {
              // As prompts complete, add them to the list
              prompts.push(...batch.prompts)

              // Start image generation for this batch if we have Replicate key
              if (replicateApiKey) {
                progress.images.status = 'generating'
                progress.images.total = prompts.length
                onProgress({ ...progress })
              }
            }
          )
        : Promise.resolve([])

      // Audio generation promise
      const audioPromise = voiceApiKey
        ? this.runAudioGeneration(
            projectPath,
            script,
            voiceApiKey,
            settings.voiceTemplateId,
            signal,
            (audioProgress) => {
              const chunks = audioProgress.details?.chunks as { total: number; completed: number } | undefined
              const duration = audioProgress.details?.durationSeconds as number | undefined
              progress.audio = {
                status: audioProgress.percentage === 100 ? 'complete' : 'generating',
                progress: audioProgress.percentage,
                chunks: chunks || { total: 0, completed: 0 },
                duration,
              }
              console.log('[Pipeline Progress] Audio:', {
                status: progress.audio.status,
                progress: progress.audio.progress,
                duration: progress.audio.duration,
              })
              onProgress({ ...progress })
            }
          )
        : Promise.resolve(null)

      // Wait for both to complete
      const [promptsResult, audioResult] = await Promise.all([promptsPromise, audioPromise])

      prompts = promptsResult
      audioPath = audioResult

      // Update progress
      progress.prompts.status = 'complete'
      progress.prompts.generated = prompts.length
      progress.prompts.total = prompts.length

      if (audioPath) {
        progress.audio.status = 'complete'
        progress.audio.progress = 100
        console.log('[Pipeline Progress] Audio: Phase 1 complete, setting status=complete, progress=100')
      }

      console.log('[Pipeline Progress] Phase 1 complete:', {
        prompts: progress.prompts,
        audio: progress.audio,
      })
      onProgress({ ...progress })

      console.log(`[Pipeline] Prompts: ${prompts.length}, Audio: ${audioPath ? 'done' : 'skipped'}`)

      // ========================================
      // PHASE 2: Generate images AND subtitles in parallel
      // - Images need prompts (from Phase 1)
      // - Subtitles need audio (from Phase 1)
      // ========================================

      const phase2Promises: Promise<void>[] = []

      // Image generation promise
      if (prompts.length > 0 && replicateApiKey) {
        console.log('[Pipeline] Starting image generation')

        progress.images.status = 'generating'
        progress.images.total = prompts.length
        onProgress({ ...progress })

        const imagePromise = this.runImageGeneration(
          projectPath,
          prompts,
          replicateApiKey,
          settings.maxConcurrentImages,
          signal,
          (imageProgress) => {
            const total = (imageProgress.details?.total as number) || prompts.length
            const completed = (imageProgress.details?.completed as number) || 0
            const failed = (imageProgress.details?.failed as number) || 0
            progress.images = {
              status: 'generating',
              total,
              completed,
              failed,
            }
            console.log('[Pipeline Progress] Images:', {
              status: progress.images.status,
              completed: progress.images.completed,
              total: progress.images.total,
              failed: progress.images.failed,
            })
            onProgress({ ...progress })
          }
        ).then((imageResult) => {
          images = imageResult.images
          progress.images.status = 'complete'
          progress.images.completed = images.length
          progress.images.failed = imageResult.failed
          console.log('[Pipeline Progress] Images COMPLETE:', {
            status: progress.images.status,
            completed: progress.images.completed,
            total: progress.images.total,
          })
          onProgress({ ...progress })
          console.log(`[Pipeline] Images: ${images.length} generated, ${imageResult.failed} failed`)
        })

        phase2Promises.push(imagePromise)
      }

      // Subtitle generation promise - starts immediately after audio is ready
      if (audioPath && replicateApiKey) {
        console.log('[Pipeline] Starting subtitle generation (parallel with images)')

        progress.subtitles.status = 'generating'
        onProgress({ ...progress })

        const subtitlePromise = this.runSubtitleGeneration(
          projectPath,
          audioPath,
          replicateApiKey,
          settings.defaultLanguage,
          signal,
          (subtitleProgress) => {
            const lineCount = subtitleProgress.details?.lineCount as number | undefined
            progress.subtitles = {
              status: subtitleProgress.percentage === 100 ? 'complete' : 'generating',
              lineCount,
            }
            console.log('[Pipeline Progress] Subtitles:', {
              status: progress.subtitles.status,
              lineCount: progress.subtitles.lineCount,
              rawPercentage: subtitleProgress.percentage,
            })
            onProgress({ ...progress })
          }
        ).then((path) => {
          subtitlePath = path
          progress.subtitles.status = 'complete'
          console.log('[Pipeline Progress] Subtitles COMPLETE:', {
            status: progress.subtitles.status,
            lineCount: progress.subtitles.lineCount,
          })
          onProgress({ ...progress })
          console.log(`[Pipeline] Subtitles: ${subtitlePath ? 'done' : 'failed'}`)
        })

        phase2Promises.push(subtitlePromise)
      }

      // Wait for both images and subtitles to complete
      await Promise.all(phase2Promises)

      console.log('[Pipeline Progress] Phase 2 complete - all parallel tasks done')
      console.log('[Pipeline Progress] Final state before complete:', {
        images: progress.images,
        audio: progress.audio,
        subtitles: progress.subtitles,
      })

      // ========================================
      // PHASE 3: Complete
      // ========================================

      progress.phase = 'complete'
      console.log('[Pipeline Progress] Setting phase=complete, emitting final progress')
      onProgress({ ...progress })

      // Emit completion event for notification sound
      this.emit('complete', { projectId: input.projectId })

      // Save prompts to file for reference
      if (prompts.length > 0) {
        const promptsPath = path.join(projectPath, 'prompts.json')
        await fs.writeFile(promptsPath, JSON.stringify(prompts, null, 2))
      }

      return {
        success: true,
        prompts,
        images,
        audioPath,
        subtitlePath,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Pipeline] Error:', errorMessage)

      progress.phase = 'error'
      progress.error = errorMessage
      onProgress({ ...progress })

      return {
        success: false,
        prompts,
        images,
        audioPath,
        subtitlePath,
        error: errorMessage,
      }
    }
  }

  /**
   * Cancel the running pipeline
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private async runPromptGeneration(
    script: string,
    apiKey: string,
    model: AppSettings['promptModel'],
    signal: AbortSignal,
    onProgress: (progress: PromptProgress) => void,
    onBatchComplete: (batch: PromptBatch) => Promise<void>
  ): Promise<string[]> {
    const result = await generatePrompts({
      script,
      apiKey,
      model,
      onProgress,
      onBatchComplete: async (batch) => {
        if (signal.aborted) return
        await onBatchComplete(batch)
      },
    })

    return result.prompts
  }

  private async runImageGeneration(
    projectPath: string,
    prompts: string[],
    apiKey: string,
    maxConcurrent: number,
    signal: AbortSignal,
    onProgress: ProgressCallback
  ): Promise<{ images: string[]; failed: number }> {
    const imageService = createImageService(apiKey) as ReplicateImageService

    const result = await imageService.generate(
      {
        projectId: '',
        projectPath,
        prompts,
        settings: { maxConcurrentImages: maxConcurrent },
      },
      onProgress,
      signal
    )

    return {
      images: result.images,
      failed: result.failedIndices?.length || 0,
    }
  }

  private async runAudioGeneration(
    projectPath: string,
    script: string,
    apiKey: string,
    templateId: string | undefined,
    signal: AbortSignal,
    onProgress: ProgressCallback
  ): Promise<string | null> {
    const audioService = createAudioService(apiKey, templateId) as RussianTTSService

    const result = await audioService.generate(
      {
        projectId: '',
        projectPath,
        script,
        settings: {},
      },
      onProgress,
      signal
    )

    return result.audioPath
  }

  private async runSubtitleGeneration(
    projectPath: string,
    audioPath: string,
    apiKey: string,
    language: string,
    signal: AbortSignal,
    onProgress: ProgressCallback
  ): Promise<string | null> {
    const subtitleService = createSubtitleService(apiKey) as WhisperXSubtitleService

    const result = await subtitleService.generate(
      {
        projectId: '',
        projectPath,
        audioPath,
        settings: { language },
      },
      onProgress,
      signal
    )

    return result.subtitlePath
  }
}

// Singleton instance
let orchestratorInstance: PipelineOrchestrator | null = null

export function getPipelineOrchestrator(): PipelineOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new PipelineOrchestrator()
  }
  return orchestratorInstance
}

export function createPipelineOrchestrator(): PipelineOrchestrator {
  return new PipelineOrchestrator()
}
