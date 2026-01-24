import { BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { getDatabase } from '../database'
import * as queueQueries from '../database/queries/queue'
import * as projectsQueries from '../database/queries/projects'
import * as channelsQueries from '../database/queries/channels'
import * as categoriesQueries from '../database/queries/categories'
import * as settingsQueries from '../database/queries/settings'
import { fileManager } from './file-manager'
import {
  createImageService,
  createAudioService,
  createSubtitleService,
  type ProgressCallback,
  type ImageGenerationOutput,
  type AudioGenerationOutput,
  type SubtitleGenerationOutput,
} from './generation'
import { generatePrompts } from './generation/prompt-generation.service'
import { getApiKey, getApiKeyForUser } from './api-keys.service'
import type { QueueTask, TaskStatus, TaskType } from '@shared/types'

/**
 * Helper to get API key based on project ownership
 * - If project has owner_id, use that user's keys (manager)
 * - If project has no owner_id, use org-wide keys
 */
async function getApiKeyForProject(
  keyType: 'anthropicApi' | 'openaiApi' | 'replicateApi' | 'voiceApi',
  projectId: string
): Promise<string | null> {
  const project = projectsQueries.getProjectById(projectId)
  if (!project) {
    return getApiKey(keyType) // Fallback to org keys
  }

  // Check if project has an owner (manager's project)
  const db = getDatabase()
  const row = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as { owner_id: string | null } | undefined

  if (row?.owner_id) {
    // Manager's project - use their personal keys
    return getApiKeyForUser(keyType, row.owner_id, 'manager')
  } else {
    // Org project - use org-wide keys
    return getApiKey(keyType)
  }
}

// ============================================
// IPC HELPERS
// ============================================

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function emitProgress(
  taskId: string,
  progress: number,
  progressDetails?: Record<string, unknown>
): void {
  console.log('[QueueManager emitProgress]', {
    taskId: taskId.slice(0, 8),
    overallProgress: progress,
    details: progressDetails,
  })

  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.QUEUE.ON_PROGRESS, {
      taskId,
      progress,
      progressDetails,
    })
  }
}

function emitStatusChange(
  taskId: string,
  status: TaskStatus,
  error?: string
): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.QUEUE.ON_STATUS_CHANGE, {
      taskId,
      status,
      error,
    })
  }
}

// ============================================
// ACTIVE TASK TRACKING
// ============================================

interface ActiveTask {
  id: string
  projectId: string
  taskType: TaskType
  controller: AbortController
}

// ============================================
// QUEUE MANAGER
// ============================================

class QueueManager {
  private isRunning: boolean = false
  private isPaused: boolean = false
  private pollInterval: NodeJS.Timeout | null = null
  private readonly pollIntervalMs: number = 1000

  // Multi-task tracking
  private activeTasks: Map<string, ActiveTask> = new Map()
  private activeProjects: Set<string> = new Set()
  private activeStageCount: Map<TaskType, number> = new Map()

  // Configuration (from settings)
  private maxProjects: number = 3
  private maxPerStage: number = 2

  // ========================================
  // LIFECYCLE
  // ========================================

  start(): void {
    if (this.isRunning) {
      console.log('[QueueManager] Already running')
      return
    }

    console.log('[QueueManager] Starting...')

    // Recover any orphaned tasks from previous session
    const resetCount = queueQueries.resetAllProcessingTasks()
    if (resetCount > 0) {
      console.log(`[QueueManager] Recovered ${resetCount} orphaned task(s) from previous session`)
    }

    // Load settings
    const settings = settingsQueries.getSettings()
    this.maxProjects = settings.maxConcurrentTasks || 3
    this.maxPerStage = 2 // Conservative default

    this.isRunning = true
    this.isPaused = false

    // Start polling
    this.pollInterval = setInterval(() => {
      this.processNextTasks()
    }, this.pollIntervalMs)

    // Process immediately
    this.processNextTasks()
  }

  stop(): void {
    console.log('[QueueManager] Stopping...')
    this.isRunning = false

    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    // Cancel all active tasks
    for (const task of this.activeTasks.values()) {
      task.controller.abort()
    }
    this.activeTasks.clear()
    this.activeProjects.clear()
    this.activeStageCount.clear()
  }

  pause(): void {
    console.log('[QueueManager] Pausing...')
    this.isPaused = true
  }

  resume(): void {
    console.log('[QueueManager] Resuming...')
    this.isPaused = false

    // Process immediately if capacity available
    if (this.activeTasks.size === 0) {
      this.processNextTasks()
    }
  }

  getIsPaused(): boolean {
    return this.isPaused
  }

  // ========================================
  // TASK CANCELLATION
  // ========================================

  async cancelTask(taskId: string): Promise<void> {
    console.log(`[QueueManager] Cancelling task: ${taskId}`)

    // If active, abort it
    const activeTask = this.activeTasks.get(taskId)
    if (activeTask) {
      activeTask.controller.abort()
      this.cleanupTask(activeTask)
    }

    // Update database
    queueQueries.cancelTask(taskId)
    emitStatusChange(taskId, 'cancelled')
  }

  // ========================================
  // MULTI-TASK PROCESSING
  // ========================================

  private async processNextTasks(): Promise<void> {
    if (this.isPaused) {
      return
    }

    // Claim multiple eligible tasks
    const tasks = queueQueries.claimEligibleTasks(
      this.maxProjects,
      this.maxPerStage,
      this.activeProjects,
      this.activeStageCount
    )

    if (tasks.length === 0) {
      return
    }

    console.log(`[QueueManager] Claimed ${tasks.length} task(s) for parallel processing`)

    // Start each task concurrently (don't await)
    for (const task of tasks) {
      this.startTaskProcessing(task)
    }
  }

  private async startTaskProcessing(task: QueueTask): Promise<void> {
    const controller = new AbortController()

    // Track active task
    const activeTask: ActiveTask = {
      id: task.id,
      projectId: task.projectId,
      taskType: task.taskType,
      controller,
    }

    this.activeTasks.set(task.id, activeTask)
    this.activeProjects.add(task.projectId)
    this.activeStageCount.set(
      task.taskType,
      (this.activeStageCount.get(task.taskType) || 0) + 1
    )

    console.log(`[QueueManager] Starting task: ${task.id} (${task.taskType}) for project ${task.projectId.slice(0, 8)}`)
    emitStatusChange(task.id, 'processing')

    try {
      await this.executeTask(task, controller.signal)

      // Mark completed
      queueQueries.updateTaskStatus(task.id, 'completed')
      queueQueries.updateTaskProgress(task.id, 100)
      emitStatusChange(task.id, 'completed')

      console.log(`[QueueManager] Task completed: ${task.id} (${task.taskType})`)

      // Check project completion
      this.checkProjectCompletion(task.projectId)

    } catch (error) {
      await this.handleTaskError(task, error as Error, controller.signal.aborted)
    } finally {
      // Cleanup tracking
      this.cleanupTask(activeTask)

      // Try to claim more tasks now that capacity freed up
      this.processNextTasks()
    }
  }

  private cleanupTask(activeTask: ActiveTask): void {
    this.activeTasks.delete(activeTask.id)

    // Decrement stage count
    const currentCount = this.activeStageCount.get(activeTask.taskType) || 1
    this.activeStageCount.set(activeTask.taskType, Math.max(0, currentCount - 1))

    // Check if project has other active tasks
    const hasOtherTasks = Array.from(this.activeTasks.values())
      .some(t => t.projectId === activeTask.projectId)
    if (!hasOtherTasks) {
      this.activeProjects.delete(activeTask.projectId)
    }
  }

  private async handleTaskError(
    task: QueueTask,
    error: Error,
    wasCancelled: boolean
  ): Promise<void> {
    const errorMessage = error.message || 'Unknown error'
    const errorStack = error.stack

    console.error(`[QueueManager] Task failed: ${task.id} (${task.taskType})`, errorMessage)

    if (wasCancelled) {
      queueQueries.updateTaskStatus(task.id, 'cancelled')
      emitStatusChange(task.id, 'cancelled')
      return
    }

    // Detect credit error - emit admin notification and fail immediately (no retry)
    if (errorMessage.startsWith('CREDIT_ERROR:')) {
      const cleanError = errorMessage.replace('CREDIT_ERROR: ', '')
      console.error('[QueueManager] CRITICAL: Replicate credit issue detected')

      // Emit notification to all windows (admin panel)
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.SYSTEM.ON_CREDIT_ALERT, {
            type: 'replicate_credit',
            message: 'Replicate API has insufficient credit (<$5). Image generation stopped.',
            timestamp: new Date().toISOString(),
          })
        }
      })

      // Mark task as failed with clear message (no retry)
      queueQueries.updateTaskStatus(task.id, 'failed', cleanError, errorStack)
      emitStatusChange(task.id, 'failed', cleanError)

      // Cancel remaining pending image tasks for this project
      const allTasks = queueQueries.getQueueTasksByProject(task.projectId)
      for (const t of allTasks) {
        if (t.id !== task.id && t.taskType === 'images' && t.status === 'pending') {
          queueQueries.updateTaskStatus(t.id, 'cancelled', 'Cancelled due to insufficient Replicate credit')
          emitStatusChange(t.id, 'cancelled', 'Cancelled due to insufficient Replicate credit')
        }
      }

      // Update project status
      projectsQueries.setProjectError(task.projectId, cleanError, {
        taskType: task.taskType,
        stack: errorStack,
      })

      return // Don't retry
    }

    // Check for retry
    const updatedTask = queueQueries.getQueueTaskById(task.id)
    if (updatedTask && updatedTask.attempts < updatedTask.maxAttempts) {
      queueQueries.retryTask(task.id)
      emitStatusChange(task.id, 'pending', `Retry ${updatedTask.attempts}/${updatedTask.maxAttempts}: ${errorMessage}`)
      return
    }

    // Max retries exceeded - fail the task
    queueQueries.updateTaskStatus(task.id, 'failed', errorMessage, errorStack)
    emitStatusChange(task.id, 'failed', errorMessage)

    // Cancel dependent tasks
    const dependentTasks = queueQueries.getTasksDependingOn(task.id)
    for (const dependent of dependentTasks) {
      queueQueries.updateTaskStatus(dependent.id, 'cancelled', `Dependency failed: ${task.taskType}`)
      emitStatusChange(dependent.id, 'cancelled', `Dependency failed: ${task.taskType}`)
    }

    // Update project status
    projectsQueries.setProjectError(task.projectId, errorMessage, {
      taskType: task.taskType,
      stack: errorStack,
    })
  }

  // ========================================
  // TASK EXECUTION
  // ========================================

  private async executeTask(task: QueueTask, signal: AbortSignal): Promise<void> {
    const project = projectsQueries.getProjectById(task.projectId)
    if (!project) {
      throw new Error(`Project not found: ${task.projectId}`)
    }

    // Update project status if needed
    if (project.status !== 'generating') {
      projectsQueries.updateProject({ id: project.id, status: 'generating' })
    }

    // Get channel and category for path
    const channel = channelsQueries.getChannelById(project.channelId)
    if (!channel) {
      throw new Error(`Channel not found: ${project.channelId}`)
    }

    const category = categoriesQueries.getCategoryById(channel.categoryId)
    if (!category) {
      throw new Error(`Category not found: ${channel.categoryId}`)
    }

    const projectPath = await fileManager.getProjectPath(
      category.slug,
      channel.slug,
      project.slug
    )

    const settings = {
      ...channel.defaultSettings,
      ...project.settingsOverride,
    }

    // Create progress callback
    const onProgress: ProgressCallback = (progress) => {
      queueQueries.updateTaskProgress(task.id, progress.percentage, progress.details)
      emitProgress(task.id, progress.percentage, progress.details)
    }

    // Execute based on task type
    switch (task.taskType) {
      case 'prompts':
        await this.executePromptsTask(project, projectPath, onProgress, signal)
        break
      case 'audio':
        await this.executeAudioTask(project, projectPath, settings, onProgress, signal)
        break
      case 'images':
        await this.executeImagesTask(project, projectPath, settings, onProgress, signal)
        break
      case 'subtitles':
        await this.executeSubtitlesTask(project, projectPath, settings, onProgress, signal)
        break
      default:
        throw new Error(`Unknown task type: ${task.taskType}`)
    }
  }

  // ========================================
  // STAGE EXECUTORS
  // ========================================

  private async executePromptsTask(
    project: { id: string; script?: string },
    projectPath: string,
    onProgress: ProgressCallback,
    _signal: AbortSignal
  ): Promise<void> {
    if (!project.script) {
      throw new Error('No script provided for prompt generation')
    }

    const appSettings = settingsQueries.getSettings()
    const apiKey = await getApiKeyForProject('anthropicApi', project.id)
      || await getApiKeyForProject('openaiApi', project.id)

    if (!apiKey) {
      throw new Error('No API key configured for prompt generation (Anthropic or OpenAI). Please configure your API keys in Settings.')
    }

    const result = await generatePrompts({
      script: project.script,
      apiKey,
      model: appSettings.promptModel,
      onProgress: (promptProgress) => {
        const percentage = promptProgress.totalPrompts > 0
          ? Math.round((promptProgress.promptsGenerated / promptProgress.totalPrompts) * 100)
          : 0

        onProgress({
          percentage,
          message: `Generating prompts (${promptProgress.promptsGenerated}/${promptProgress.totalPrompts})`,
          details: {
            prompts: {
              status: promptProgress.phase === 'complete' ? 'complete' : 'generating',
              total: promptProgress.totalPrompts,
              generated: promptProgress.promptsGenerated,
              batches: promptProgress.totalBatches,
              currentBatch: promptProgress.currentBatch,
              activeWorkers: promptProgress.activeWorkers,
              maxWorkers: promptProgress.maxWorkers,
            },
          },
        })
      },
    })

    // Save prompts to project directory
    const promptsPath = path.join(projectPath, 'prompts.json')
    await fs.writeFile(promptsPath, JSON.stringify(result.prompts, null, 2))

    console.log(`[QueueManager] Prompts: ${result.prompts.length} generated, saved to ${promptsPath}`)
  }

  private async executeAudioTask(
    project: { id: string; script?: string },
    projectPath: string,
    settings: Record<string, unknown>,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<AudioGenerationOutput> {
    if (!project.script) {
      throw new Error('No script provided for audio generation')
    }

    const appSettings = settingsQueries.getSettings()
    const voiceApiKey = await getApiKeyForProject('voiceApi', project.id)
    const templateId = appSettings.voiceTemplateId

    const audioService = createAudioService(voiceApiKey ?? undefined, templateId)
    const result = await audioService.generate(
      {
        projectId: project.id,
        projectPath,
        script: project.script,
        settings: {
          voiceId: settings.voiceId as string | undefined,
          voiceSpeed: settings.voiceSpeed as number | undefined,
          language: settings.language as string | undefined,
        },
      },
      (progress) => {
        onProgress({
          percentage: progress.percentage,
          message: progress.message || `Generating audio (${progress.percentage}%)`,
          details: {
            audio: {
              status: progress.percentage === 100 ? 'complete' : 'generating',
              progress: progress.percentage,
              activeWorkers: 1,
              ...progress.details,
            },
          },
        })
      },
      signal
    )

    // Update project with audio duration
    projectsQueries.updateProjectProgress(
      project.id,
      { phase: 'generating', audio: { status: 'complete', progress: 100, duration: result.durationSeconds } },
      undefined,
      result.durationSeconds
    )

    return result
  }

  private async executeImagesTask(
    project: { id: string; script?: string },
    projectPath: string,
    settings: Record<string, unknown>,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<ImageGenerationOutput> {
    // Load prompts from file (generated by prompts task)
    const promptsPath = path.join(projectPath, 'prompts.json')
    let prompts: string[] = []

    try {
      const promptsData = await fs.readFile(promptsPath, 'utf-8')
      prompts = JSON.parse(promptsData)
    } catch {
      throw new Error('Prompts file not found. Run prompts task first.')
    }

    if (prompts.length === 0) {
      throw new Error('No prompts available for image generation')
    }

    const appSettings = settingsQueries.getSettings()
    const replicateApiKey = await getApiKeyForProject('replicateApi', project.id)

    const imageService = createImageService(replicateApiKey ?? undefined)
    const result = await imageService.generate(
      {
        projectId: project.id,
        projectPath,
        prompts,
        settings: {
          style: settings.imageStyle as string | undefined,
          model: settings.imageModel as string | undefined,
          customPromptPrefix: (settings.customPrompts as { imagePrefix?: string })?.imagePrefix,
          customPromptSuffix: (settings.customPrompts as { imageSuffix?: string })?.imageSuffix,
          maxConcurrentImages: appSettings.maxConcurrentImages,
        },
      },
      (progress) => {
        onProgress({
          percentage: progress.percentage,
          message: progress.message || `Generating images (${progress.percentage}%)`,
          details: {
            images: {
              status: progress.percentage === 100 ? 'complete' : 'generating',
              ...progress.details,
            },
          },
        })
      },
      signal
    )

    // Update project with image count
    projectsQueries.updateProjectProgress(
      project.id,
      { phase: 'generating', images: { status: 'complete', total: result.count, completed: result.count, failed: 0 } },
      result.count
    )

    return result
  }

  private async executeSubtitlesTask(
    project: { id: string; script?: string },
    projectPath: string,
    settings: Record<string, unknown>,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<SubtitleGenerationOutput> {
    // Get audio path (generated by audio task)
    const audioPath = path.join(projectPath, 'voiceovers', 'voiceover.mp3')

    // Verify audio exists
    try {
      await fs.access(audioPath)
    } catch {
      throw new Error('Audio file not found. Run audio task first.')
    }

    const openaiApiKey = await getApiKeyForProject('openaiApi', project.id)

    const subtitleService = createSubtitleService(openaiApiKey ?? undefined)
    const result = await subtitleService.generate(
      {
        projectId: project.id,
        projectPath,
        audioPath,
        script: project.script,
        settings: {
          language: settings.language as string | undefined,
        },
      },
      (progress) => {
        onProgress({
          percentage: progress.percentage,
          message: progress.message || `Generating subtitles (${progress.percentage}%)`,
          details: {
            subtitles: {
              status: progress.percentage === 100 ? 'complete' : 'generating',
              activeWorkers: 1,
              ...progress.details,
            },
          },
        })
      },
      signal
    )

    // Update project with subtitle count
    projectsQueries.updateProjectProgress(
      project.id,
      { phase: 'generating', subtitles: { status: 'complete', lineCount: result.lineCount } },
      undefined,
      undefined,
      result.lineCount
    )

    return result
  }

  // ========================================
  // CONCURRENCY STATS
  // ========================================

  getConcurrencyStats(): {
    activeWorkers: number
    activeProjects: number
    stageWorkers: Record<string, number>
    maxProjects: number
    maxPerStage: number
  } {
    return {
      activeWorkers: this.activeTasks.size,
      activeProjects: this.activeProjects.size,
      stageWorkers: Object.fromEntries(this.activeStageCount),
      maxProjects: this.maxProjects,
      maxPerStage: this.maxPerStage,
    }
  }

  // ========================================
  // PROJECT COMPLETION
  // ========================================

  private checkProjectCompletion(projectId: string): void {
    const tasks = queueQueries.getQueueTasksByProject(projectId)
    const allCompleted = tasks.every(t => t.status === 'completed')
    const anyFailed = tasks.some(t => t.status === 'failed')

    if (anyFailed) {
      console.log(`[QueueManager] Project has failed tasks: ${projectId}`)
      return
    }

    if (allCompleted) {
      console.log(`[QueueManager] All tasks completed for project: ${projectId}`)
      projectsQueries.updateProject({ id: projectId, status: 'completed' })

      // Emit completion event for notification sound
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pipeline:complete', { projectId })
      }
    }
  }
}

// Export singleton instance
export const queueManager = new QueueManager()
