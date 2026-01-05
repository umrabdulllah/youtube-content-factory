import { v4 as uuid } from 'uuid'
import { getDatabase } from '../index'
import type {
  QueueTask,
  QueueTaskWithProject,
  QueueStats,
  ConcurrencyStats,
  TaskType,
  TaskStatus,
} from '../../../shared/types'

function mapRow(row: Record<string, unknown>): QueueTask {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    taskType: row.task_type as TaskType,
    status: row.status as TaskStatus,
    priority: row.priority as number,
    progress: row.progress as number,
    progressDetails: row.progress_details ? JSON.parse(row.progress_details as string) : undefined,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    dependsOnTaskId: row.depends_on_task_id as string | undefined,
    stageGroup: row.stage_group as number | undefined,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    error: row.error as string | undefined,
    errorStack: row.error_stack as string | undefined,
  }
}

function mapRowWithProject(row: Record<string, unknown>): QueueTaskWithProject {
  return {
    ...mapRow(row),
    projectTitle: row.project_title as string,
    channelName: row.channel_name as string,
    categoryName: row.category_name as string,
  }
}

export function getAllQueueTasks(): QueueTaskWithProject[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT
      q.*,
      p.title as project_title,
      ch.name as channel_name,
      c.name as category_name
    FROM queue_tasks q
    JOIN projects p ON p.id = q.project_id
    JOIN channels ch ON ch.id = p.channel_id
    JOIN categories c ON c.id = ch.category_id
    WHERE q.status IN ('pending', 'processing')
    ORDER BY q.priority DESC, q.created_at ASC
  `).all() as Record<string, unknown>[]

  return rows.map(mapRowWithProject)
}

export function getQueueTaskById(id: string): QueueTask | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT * FROM queue_tasks WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined

  return row ? mapRow(row) : null
}

export function getQueueTasksByProject(projectId: string): QueueTask[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM queue_tasks WHERE project_id = ? ORDER BY created_at ASC
  `).all(projectId) as Record<string, unknown>[]

  return rows.map(mapRow)
}

export function getNextPendingTask(): QueueTask | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT * FROM queue_tasks
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get() as Record<string, unknown> | undefined

  return row ? mapRow(row) : null
}

/**
 * Atomically claim the next pending task by updating its status to 'processing'
 * in a single operation. This prevents race conditions where multiple processes
 * could claim the same task.
 *
 * @returns The claimed task, or null if no pending tasks are available
 */
export function claimNextPendingTask(): QueueTask | null {
  const db = getDatabase()
  const now = new Date().toISOString()

  // Use a transaction to atomically find and claim the next task
  const result = db.transaction(() => {
    // Find the next pending task
    const row = db.prepare(`
      SELECT id FROM queue_tasks
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get() as { id: string } | undefined

    if (!row) {
      return null
    }

    // Atomically update only if still pending (handles any remaining race conditions)
    const updateResult = db.prepare(`
      UPDATE queue_tasks
      SET status = 'processing', started_at = ?, attempts = attempts + 1
      WHERE id = ? AND status = 'pending'
    `).run(now, row.id)

    // If no rows were updated, another process claimed it
    if (updateResult.changes === 0) {
      return null
    }

    // Return the claimed task
    return db.prepare(`SELECT * FROM queue_tasks WHERE id = ?`).get(row.id) as Record<string, unknown>
  })()

  return result ? mapRow(result) : null
}

export function getProcessingTasksCount(): number {
  const db = getDatabase()
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM queue_tasks WHERE status = 'processing'
  `).get() as { count: number }

  return result.count
}

export function getQueueStats(concurrencyStats?: ConcurrencyStats): QueueStats {
  const db = getDatabase()
  const result = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      COUNT(*) as total
    FROM queue_tasks
    WHERE created_at > datetime('now', '-24 hours')
  `).get() as Record<string, number>

  // Default concurrency values when not provided
  const defaultConcurrency: ConcurrencyStats = {
    activeWorkers: 0,
    activeProjects: 0,
    stageWorkers: { prompts: 0, audio: 0, images: 0, subtitles: 0 },
    maxProjects: 3,
    maxPerStage: 2,
  }

  const concurrency = concurrencyStats || defaultConcurrency

  return {
    pending: result.pending || 0,
    processing: result.processing || 0,
    completed: result.completed || 0,
    failed: result.failed || 0,
    total: result.total || 0,
    activeWorkers: concurrency.activeWorkers,
    activeProjects: concurrency.activeProjects,
    stageWorkers: concurrency.stageWorkers,
    maxProjects: concurrency.maxProjects,
    maxPerStage: concurrency.maxPerStage,
  }
}

export function createQueueTask(
  projectId: string,
  taskType: TaskType,
  priority: number = 0,
  dependsOnTaskId: string | null = null,
  stageGroup: number = 0
): QueueTask {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO queue_tasks (id, project_id, task_type, status, priority, progress, attempts, max_attempts, depends_on_task_id, stage_group, created_at)
    VALUES (?, ?, ?, 'pending', ?, 0, 0, 3, ?, ?, ?)
  `).run(id, projectId, taskType, priority, dependsOnTaskId, stageGroup, now)

  return getQueueTaskById(id)!
}

export interface GenerationTaskOptions {
  generateImages: boolean
  generateAudio: boolean
}

/**
 * Create all queue tasks for a project with proper dependencies.
 * Uses stage-based parallel processing:
 * - Phase 0: prompts + audio (run in parallel, no dependencies)
 * - Phase 1: images (depends on prompts) + subtitles (depends on audio)
 *
 * Tasks are conditionally created based on generation options:
 * - generateImages: creates prompts and images tasks
 * - generateAudio: creates audio and subtitles tasks
 */
export function createProjectQueueTasks(
  projectId: string,
  options: GenerationTaskOptions = { generateImages: true, generateAudio: true }
): QueueTask[] {
  const db = getDatabase()
  const tasks: QueueTask[] = []

  db.transaction(() => {
    // Phase 0: Create independent tasks based on options
    let promptsTask: QueueTask | null = null
    let audioTask: QueueTask | null = null

    if (options.generateImages) {
      promptsTask = createQueueTask(projectId, 'prompts', 10, null, 0)
      tasks.push(promptsTask)
    }

    if (options.generateAudio) {
      audioTask = createQueueTask(projectId, 'audio', 10, null, 0)
      tasks.push(audioTask)
    }

    // Phase 1: Create dependent tasks
    if (options.generateImages && promptsTask) {
      const imagesTask = createQueueTask(projectId, 'images', 5, promptsTask.id, 1)
      tasks.push(imagesTask)
    }

    if (options.generateAudio && audioTask) {
      const subtitlesTask = createQueueTask(projectId, 'subtitles', 5, audioTask.id, 1)
      tasks.push(subtitlesTask)
    }
  })()

  return tasks
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  error?: string,
  errorStack?: string
): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const updates: string[] = ['status = ?']
  const values: unknown[] = [status]

  if (status === 'processing') {
    updates.push('started_at = ?')
    values.push(now)
    updates.push('attempts = attempts + 1')
  } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updates.push('completed_at = ?')
    values.push(now)
  }

  if (error !== undefined) {
    updates.push('error = ?')
    values.push(error)
  }
  if (errorStack !== undefined) {
    updates.push('error_stack = ?')
    values.push(errorStack)
  }

  values.push(id)

  db.prepare(`
    UPDATE queue_tasks SET ${updates.join(', ')} WHERE id = ?
  `).run(...values)
}

export function updateTaskProgress(
  id: string,
  progress: number,
  progressDetails?: Record<string, unknown>
): void {
  const db = getDatabase()

  db.prepare(`
    UPDATE queue_tasks SET progress = ?, progress_details = ? WHERE id = ?
  `).run(progress, progressDetails ? JSON.stringify(progressDetails) : null, id)
}

export function cancelTask(id: string): void {
  updateTaskStatus(id, 'cancelled')
}

export function retryTask(id: string): void {
  const db = getDatabase()

  db.prepare(`
    UPDATE queue_tasks SET
      status = 'pending',
      progress = 0,
      progress_details = NULL,
      error = NULL,
      error_stack = NULL,
      started_at = NULL,
      completed_at = NULL
    WHERE id = ?
  `).run(id)
}

export function updateTaskPriority(id: string, priority: number): void {
  const db = getDatabase()
  db.prepare(`UPDATE queue_tasks SET priority = ? WHERE id = ?`).run(priority, id)
}

/**
 * Reset tasks that are stuck in 'processing' status.
 * This handles tasks that were interrupted by a crash or unexpected shutdown.
 * Tasks older than the specified threshold (default 5 minutes) are reset to 'pending'.
 *
 * @param staleThresholdMinutes - How long a task must be processing before considered stale
 * @returns Number of tasks reset
 */
export function resetStaleTasks(staleThresholdMinutes: number = 5): number {
  const db = getDatabase()

  const result = db.prepare(`
    UPDATE queue_tasks
    SET
      status = 'pending',
      started_at = NULL,
      progress = 0,
      progress_details = NULL
    WHERE status = 'processing'
      AND started_at < datetime('now', '-' || ? || ' minutes')
  `).run(staleThresholdMinutes)

  return result.changes
}

/**
 * Reset ALL tasks currently in 'processing' status to 'pending'.
 * Use this on application startup to recover from crashes.
 *
 * @returns Number of tasks reset
 */
export function resetAllProcessingTasks(): number {
  const db = getDatabase()

  const result = db.prepare(`
    UPDATE queue_tasks
    SET
      status = 'pending',
      started_at = NULL,
      progress = 0,
      progress_details = NULL
    WHERE status = 'processing'
  `).run()

  return result.changes
}

/**
 * Get all tasks that depend on a given task.
 * Used for failure cascading - when a task fails, cancel its dependents.
 */
export function getTasksDependingOn(taskId: string): QueueTask[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM queue_tasks
    WHERE depends_on_task_id = ?
      AND status IN ('pending', 'processing')
  `).all(taskId) as Record<string, unknown>[]

  return rows.map(mapRow)
}

/**
 * Get the count of active projects (projects with at least one processing task)
 */
export function getActiveProjectCount(): number {
  const db = getDatabase()
  const result = db.prepare(`
    SELECT COUNT(DISTINCT project_id) as count
    FROM queue_tasks
    WHERE status = 'processing'
  `).get() as { count: number }

  return result.count
}

/**
 * Get the count of active tasks per stage type
 */
export function getActiveStageCount(): Map<TaskType, number> {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT task_type, COUNT(*) as count
    FROM queue_tasks
    WHERE status = 'processing'
    GROUP BY task_type
  `).all() as { task_type: string; count: number }[]

  const counts = new Map<TaskType, number>()
  for (const row of rows) {
    counts.set(row.task_type as TaskType, row.count)
  }
  return counts
}

/**
 * Claim multiple eligible tasks for parallel processing.
 * Respects:
 * - Dependencies (within project)
 * - Max active projects limit
 * - Max concurrent tasks per stage type
 *
 * @param maxProjects - Maximum number of projects to process simultaneously
 * @param maxPerStage - Maximum concurrent tasks per stage type
 * @param activeProjects - Set of currently active project IDs
 * @param activeStageCount - Map of currently active tasks per stage type
 */
export function claimEligibleTasks(
  maxProjects: number,
  maxPerStage: number,
  activeProjects: Set<string>,
  activeStageCount: Map<TaskType, number>
): QueueTask[] {
  const db = getDatabase()
  const now = new Date().toISOString()

  return db.transaction(() => {
    const claimedTasks: QueueTask[] = []

    // Track what we're claiming in this transaction
    const claimingProjects = new Set<string>()
    const claimingStageCount = new Map<TaskType, number>()

    // Get all pending tasks with dependency status
    // Order by priority DESC (higher priority first), then stage_group ASC (Phase 0 before Phase 1), then created_at ASC
    const pendingTasks = db.prepare(`
      SELECT q.*,
             (SELECT status FROM queue_tasks WHERE id = q.depends_on_task_id) as dependency_status
      FROM queue_tasks q
      WHERE q.status = 'pending'
      ORDER BY q.priority DESC, q.stage_group ASC, q.created_at ASC
    `).all() as (Record<string, unknown> & { dependency_status: string | null })[]

    for (const row of pendingTasks) {
      const task = mapRow(row)

      // Check dependency - skip if dependency exists and not completed
      if (row.depends_on_task_id && row.dependency_status !== 'completed') {
        continue
      }

      // Check project limit
      const isNewProject = !activeProjects.has(task.projectId) && !claimingProjects.has(task.projectId)
      const totalActiveProjects = activeProjects.size + claimingProjects.size
      if (isNewProject && totalActiveProjects >= maxProjects) {
        continue
      }

      // Check stage concurrency limit
      const currentActiveCount = activeStageCount.get(task.taskType) || 0
      const currentClaimingCount = claimingStageCount.get(task.taskType) || 0
      if (currentActiveCount + currentClaimingCount >= maxPerStage) {
        continue
      }

      // Try to claim the task
      const updateResult = db.prepare(`
        UPDATE queue_tasks
        SET status = 'processing', started_at = ?, attempts = attempts + 1
        WHERE id = ? AND status = 'pending'
      `).run(now, task.id)

      if (updateResult.changes > 0) {
        // Successfully claimed
        claimedTasks.push({
          ...task,
          status: 'processing',
          startedAt: now,
          attempts: task.attempts + 1,
        })

        claimingProjects.add(task.projectId)
        claimingStageCount.set(task.taskType, currentClaimingCount + 1)
      }
    }

    return claimedTasks
  })()
}

/**
 * Cancel all tasks for a project (used when a stage fails)
 */
export function cancelProjectTasks(projectId: string, reason: string): number {
  const db = getDatabase()
  const now = new Date().toISOString()

  const result = db.prepare(`
    UPDATE queue_tasks
    SET status = 'cancelled', completed_at = ?, error = ?
    WHERE project_id = ? AND status IN ('pending', 'processing')
  `).run(now, reason, projectId)

  return result.changes
}
