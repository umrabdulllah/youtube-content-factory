import * as React from 'react'
import {
  ListTodo,
  Pause,
  Play,
  RotateCcw,
  X,
  Image,
  Music,
  Subtitles,
  FileText,
  ChevronRight,
  Clock,
  Cpu,
  Check,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { useToast } from '../components/ui/toaster'
import type {
  QueueTaskWithProject,
  QueueStats,
  StageProgressDetails,
  PromptsProgressDetails,
  ImagesProgressDetails,
  SubtitlesProgressDetails,
} from '@shared/types'

// Detailed stage progress info
interface StageProgressInfo {
  progress: number
  status: string
  activeWorkers?: number
  maxWorkers?: number
  prompts?: PromptsProgressDetails
  images?: ImagesProgressDetails
  subtitles?: SubtitlesProgressDetails
}

// Group tasks by project
interface ProjectGroup {
  projectId: string
  projectTitle: string
  channelName: string
  categoryName: string
  tasks: QueueTaskWithProject[]
  overallStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  startedAt?: string
}

export function Queue() {
  const { toast } = useToast()
  const [tasks, setTasks] = React.useState<QueueTaskWithProject[]>([])
  const [stats, setStats] = React.useState<QueueStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [paused, setPaused] = React.useState(false)
  const [actionInProgress, setActionInProgress] = React.useState<string | null>(null)
  const [, setTick] = React.useState(0)

  // Update timer every second for processing tasks
  React.useEffect(() => {
    const hasProcessingTasks = tasks.some(t => t.status === 'processing')
    if (!hasProcessingTasks) return

    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [tasks])

  // Format elapsed time as MM:SS or HH:MM:SS
  const formatElapsedTime = (startTime: string | undefined) => {
    if (!startTime) return '--:--'

    const start = new Date(startTime).getTime()
    const now = Date.now()
    const elapsed = Math.floor((now - start) / 1000)

    if (elapsed < 0) return '00:00'

    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    const seconds = elapsed % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Load initial data and set up event listeners
  React.useEffect(() => {
    loadQueue()
    loadPausedState()

    // Subscribe to real-time progress updates
    const unsubscribeProgress = window.api.queue.onProgress((data) => {
      console.log('[Queue UI] Progress received:', {
        taskId: data.taskId.slice(0, 8),
        overallProgress: data.progress,
        details: data.progressDetails,
      })

      setTasks((prev) =>
        prev.map((task) =>
          task.id === data.taskId
            ? { ...task, progress: data.progress, progressDetails: data.progressDetails }
            : task
        )
      )
    })

    // Subscribe to real-time status changes
    const unsubscribeStatus = window.api.queue.onStatusChange((data) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === data.taskId
            ? { ...task, status: data.status as QueueTaskWithProject['status'], error: data.error }
            : task
        )
      )

      // Refresh stats when status changes (but don't reload task list - let polling handle removal)
      loadStats()
    })

    // Keep polling as fallback
    const interval = setInterval(loadQueue, 5000)

    return () => {
      clearInterval(interval)
      unsubscribeProgress()
      unsubscribeStatus()
    }
  }, [])

  const loadPausedState = async () => {
    try {
      const isPaused = await window.api.queue.getPaused()
      setPaused(isPaused)
    } catch (error) {
      console.error('Failed to load paused state:', error)
    }
  }

  const loadStats = async () => {
    try {
      const statsData = await window.api.queue.getStats()
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const loadQueue = async () => {
    try {
      const [tasksData, statsData] = await Promise.all([
        window.api.queue.getAll(),
        window.api.queue.getStats(),
      ])

      setTasks((prevTasks) => {
        const liveProgressMap = new Map(
          prevTasks
            .filter(t => t.status === 'processing' && t.progressDetails)
            .map(t => [t.id, t.progressDetails])
        )

        return tasksData.map(dbTask => {
          const liveProgress = liveProgressMap.get(dbTask.id)
          if (liveProgress && dbTask.status === 'processing') {
            return { ...dbTask, progressDetails: liveProgress }
          }
          return dbTask
        })
      })

      setStats(statsData)
    } catch (error) {
      console.error('Failed to load queue:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePauseResume = async () => {
    try {
      if (paused) {
        const result = await window.api.queue.resume()
        setPaused(result.paused)
        toast({ title: 'Queue resumed', variant: 'success' })
      } else {
        const result = await window.api.queue.pause()
        setPaused(result.paused)
        toast({ title: 'Queue paused', variant: 'success' })
      }
    } catch (error) {
      console.error('Failed to pause/resume queue:', error)
      toast({ title: 'Error', description: 'Failed to toggle queue state', variant: 'destructive' })
    }
  }

  const handleCancelProject = async (projectId: string) => {
    if (actionInProgress) return
    setActionInProgress(projectId)
    try {
      // Cancel all tasks for this project
      const projectTasks = tasks.filter(t => t.projectId === projectId)
      for (const task of projectTasks) {
        if (task.status === 'pending' || task.status === 'processing') {
          await window.api.queue.cancelTask(task.id)
        }
      }
      toast({ title: 'Project cancelled', variant: 'success' })
      loadQueue()
    } catch (error) {
      console.error('Failed to cancel project:', error)
      toast({ title: 'Error', description: 'Failed to cancel project', variant: 'destructive' })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleRetryTask = async (taskId: string) => {
    if (actionInProgress) return
    setActionInProgress(taskId)
    try {
      await window.api.queue.retryTask(taskId)
      toast({ title: 'Task queued for retry', variant: 'success' })
      loadQueue()
    } catch (error) {
      console.error('Failed to retry task:', error)
      toast({ title: 'Error', description: 'Failed to retry task', variant: 'destructive' })
    } finally {
      setActionInProgress(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'bg-accent'
      case 'pending':
        return 'bg-warning'
      case 'completed':
        return 'bg-success'
      case 'failed':
        return 'bg-error'
      default:
        return 'bg-text-tertiary'
    }
  }

  // Group tasks by project
  const projectGroups = React.useMemo(() => {
    const groups = new Map<string, ProjectGroup>()

    for (const task of tasks) {
      const existing = groups.get(task.projectId)
      if (existing) {
        existing.tasks.push(task)
      } else {
        groups.set(task.projectId, {
          projectId: task.projectId,
          projectTitle: task.projectTitle,
          channelName: task.channelName,
          categoryName: task.categoryName,
          tasks: [task],
          overallStatus: 'pending',
          startedAt: task.startedAt,
        })
      }
    }

    // Calculate overall status and earliest start time for each group
    for (const group of groups.values()) {
      const hasProcessing = group.tasks.some(t => t.status === 'processing')
      const hasFailed = group.tasks.some(t => t.status === 'failed')
      const allCompleted = group.tasks.every(t => t.status === 'completed')
      const allCancelled = group.tasks.every(t => t.status === 'cancelled')

      if (hasFailed) {
        group.overallStatus = 'failed'
      } else if (allCancelled) {
        group.overallStatus = 'cancelled'
      } else if (allCompleted) {
        group.overallStatus = 'completed'
      } else if (hasProcessing) {
        group.overallStatus = 'processing'
      } else {
        group.overallStatus = 'pending'
      }

      // Find earliest start time
      const startTimes = group.tasks
        .filter(t => t.startedAt)
        .map(t => new Date(t.startedAt!).getTime())
      if (startTimes.length > 0) {
        group.startedAt = new Date(Math.min(...startTimes)).toISOString()
      }
    }

    return Array.from(groups.values())
  }, [tasks])

  // Get progress for each stage type from a task
  const getStageProgress = (
    projectTasks: QueueTaskWithProject[],
    stageType: 'prompts' | 'audio' | 'images' | 'subtitles'
  ): StageProgressInfo => {
    const task = projectTasks.find(t => t.taskType === stageType)
    if (!task) return { progress: 0, status: 'pending' }

    if (task.status === 'completed') return { progress: 100, status: 'complete' }
    if (task.status === 'failed') return { progress: 0, status: 'failed' }
    if (task.status === 'cancelled') return { progress: 0, status: 'cancelled' }
    if (task.status === 'pending') return { progress: 0, status: 'pending' }

    // Processing - get from progressDetails
    const details = task.progressDetails as StageProgressDetails | undefined
    const stageDetails = details?.[stageType]

    const result: StageProgressInfo = {
      progress: (stageDetails as { progress?: number })?.progress ?? task.progress ?? 0,
      status: (stageDetails as { status?: string })?.status ?? 'generating',
    }

    // Add stage-specific details and worker counts
    if (stageType === 'prompts' && details?.prompts) {
      result.prompts = details.prompts
      result.activeWorkers = details.prompts.activeWorkers
      result.maxWorkers = details.prompts.maxWorkers
      // Use generated/total for more accurate progress
      if (details.prompts.total > 0) {
        result.progress = Math.round((details.prompts.generated / details.prompts.total) * 100)
      }
    }
    if (stageType === 'audio' && details?.audio) {
      result.activeWorkers = details.audio.activeWorkers
    }
    if (stageType === 'images' && details?.images) {
      result.images = details.images
      result.activeWorkers = details.images.activeWorkers
      result.maxWorkers = details.images.maxWorkers
      // Use completed/total for more accurate progress
      if (details.images.total > 0) {
        result.progress = Math.round((details.images.completed / details.images.total) * 100)
      }
    }
    if (stageType === 'subtitles' && details?.subtitles) {
      result.subtitles = details.subtitles
      result.activeWorkers = details.subtitles.activeWorkers
    }

    return result
  }

  // Calculate overall project progress
  const getOverallProgress = (projectTasks: QueueTaskWithProject[]): number => {
    const prompts = getStageProgress(projectTasks, 'prompts')
    const audio = getStageProgress(projectTasks, 'audio')
    const images = getStageProgress(projectTasks, 'images')
    const subtitles = getStageProgress(projectTasks, 'subtitles')

    // Weight: prompts 20%, audio 30%, images 40%, subtitles 10%
    return Math.round(
      prompts.progress * 0.2 +
      audio.progress * 0.3 +
      images.progress * 0.4 +
      subtitles.progress * 0.1
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-sm">
            Monitor and manage your generation tasks
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handlePauseResume}
          className="gap-2"
        >
          {paused ? (
            <>
              <Play className="w-4 h-4" />
              Resume Queue
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              Pause Queue
            </>
          )}
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-warning">{stats.pending}</p>
                <p className="text-xs text-text-secondary">Pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-accent">{stats.processing}</p>
                <p className="text-xs text-text-secondary">Processing</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-success">{stats.completed}</p>
                <p className="text-xs text-text-secondary">Completed (24h)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-error">{stats.failed}</p>
                <p className="text-xs text-text-secondary">Failed (24h)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Cpu className="w-4 h-4 text-accent" />
                  <p className="text-2xl font-bold text-accent">
                    {stats.activeWorkers}/{stats.maxProjects * stats.maxPerStage}
                  </p>
                </div>
                <p className="text-xs text-text-secondary">Workers</p>
              </CardContent>
            </Card>
          </div>

          {/* Stage worker distribution - only show when workers are active */}
          {stats.activeWorkers > 0 && (
            <div className="flex items-center justify-center gap-6 py-2 px-4 bg-bg-elevated rounded-lg border border-border">
              <span className="text-xs text-text-tertiary">Active workers:</span>
              <div className="flex items-center gap-1 text-xs">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span className={stats.stageWorkers.prompts > 0 ? 'text-blue-400 font-medium' : 'text-text-tertiary'}>
                  {stats.stageWorkers.prompts || 0}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Music className="w-3.5 h-3.5 text-purple-400" />
                <span className={stats.stageWorkers.audio > 0 ? 'text-purple-400 font-medium' : 'text-text-tertiary'}>
                  {stats.stageWorkers.audio || 0}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Image className="w-3.5 h-3.5 text-accent" />
                <span className={stats.stageWorkers.images > 0 ? 'text-accent font-medium' : 'text-text-tertiary'}>
                  {stats.stageWorkers.images || 0}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Subtitles className="w-3.5 h-3.5 text-green-400" />
                <span className={stats.stageWorkers.subtitles > 0 ? 'text-green-400 font-medium' : 'text-text-tertiary'}>
                  {stats.stageWorkers.subtitles || 0}
                </span>
              </div>
              <span className="text-xs text-text-tertiary ml-2">
                ({stats.activeProjects} project{stats.activeProjects !== 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Queue List - Grouped by Project */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {projectGroups.length > 0 ? (
            <div className="space-y-3">
              {projectGroups.map((group) => {
                const prompts = getStageProgress(group.tasks, 'prompts')
                const audio = getStageProgress(group.tasks, 'audio')
                const images = getStageProgress(group.tasks, 'images')
                const subtitles = getStageProgress(group.tasks, 'subtitles')
                const overallProgress = getOverallProgress(group.tasks)
                const hasFailed = group.tasks.some(t => t.status === 'failed')

                return (
                  <div
                    key={group.projectId}
                    className="p-3 bg-bg-elevated rounded-lg border border-border"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(group.overallStatus)}`} />
                        <div className="flex items-center gap-2 text-sm text-text-tertiary">
                          <span>{group.categoryName}</span>
                          <ChevronRight className="w-3 h-3" />
                          <span>{group.channelName}</span>
                          <ChevronRight className="w-3 h-3" />
                          <span className="text-text-primary font-medium">{group.projectTitle}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {hasFailed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const failedTask = group.tasks.find(t => t.status === 'failed')
                              if (failedTask) handleRetryTask(failedTask.id)
                            }}
                            disabled={actionInProgress === group.projectId}
                            className="gap-1 text-xs"
                          >
                            <RotateCcw className={`w-3 h-3 ${actionInProgress === group.projectId ? 'animate-spin' : ''}`} />
                            {actionInProgress === group.projectId ? 'Retrying...' : 'Retry'}
                          </Button>
                        )}
                        {group.overallStatus !== 'completed' && group.overallStatus !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCancelProject(group.projectId)}
                            disabled={actionInProgress === group.projectId}
                            className="w-7 h-7 text-text-tertiary hover:text-error"
                          >
                            {actionInProgress === group.projectId ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 4 Stage Progress Bars */}
                    <div className="flex items-center gap-4">
                      {/* Prompts */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <Progress value={prompts.status === 'complete' ? 100 : prompts.progress} className="h-1.5 flex-1" />
                        <div className="text-xs text-text-secondary shrink-0 text-right min-w-[60px]">
                          {prompts.status === 'complete' ? (
                            <span className="flex items-center justify-end gap-1 text-success">
                              <Check className="w-3 h-3" />
                              done
                            </span>
                          ) : prompts.prompts ? (
                            <span className="flex items-center justify-end gap-1.5">
                              <span className="text-text-primary">{prompts.prompts.generated}/{prompts.prompts.total}</span>
                              <span className="text-text-tertiary text-[10px]">
                                B{prompts.prompts.currentBatch}/{prompts.prompts.batches}
                              </span>
                              {prompts.activeWorkers !== undefined && (
                                <span className="text-blue-400 text-[10px] font-medium">⚡{prompts.activeWorkers}</span>
                              )}
                            </span>
                          ) : prompts.status === 'pending' ? (
                            <span className="text-text-tertiary">pending</span>
                          ) : (
                            <span>{prompts.progress}%</span>
                          )}
                        </div>
                      </div>

                      {/* Audio */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <Progress value={audio.status === 'complete' ? 100 : audio.progress} className="h-1.5 flex-1" />
                        <div className="text-xs text-text-secondary shrink-0 text-right min-w-[60px]">
                          {audio.status === 'complete' ? (
                            <span className="flex items-center justify-end gap-1 text-success">
                              <Check className="w-3 h-3" />
                              done
                            </span>
                          ) : audio.status === 'pending' ? (
                            <span className="text-text-tertiary">pending</span>
                          ) : (
                            <span className="flex items-center justify-end gap-1">
                              <span>{audio.progress}%</span>
                              {audio.activeWorkers !== undefined && (
                                <span className="text-purple-400 text-[10px] font-medium">⚡{audio.activeWorkers}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Images */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Image className="w-3.5 h-3.5 text-accent shrink-0" />
                        <Progress value={images.status === 'complete' ? 100 : images.progress} className="h-1.5 flex-1" />
                        <div className="text-xs text-text-secondary shrink-0 text-right min-w-[60px]">
                          {images.status === 'complete' ? (
                            <span className="flex items-center justify-end gap-1 text-success">
                              <Check className="w-3 h-3" />
                              done
                            </span>
                          ) : images.images ? (
                            <span className="flex items-center justify-end gap-1">
                              <span className="text-text-primary">{images.images.completed}/{images.images.total}</span>
                              {images.images.failed > 0 && (
                                <span className="text-error">({images.images.failed}!)</span>
                              )}
                              {images.activeWorkers !== undefined && (
                                <span className="text-accent text-[10px] font-medium">⚡{images.activeWorkers}</span>
                              )}
                            </span>
                          ) : images.status === 'pending' ? (
                            <span className="text-text-tertiary">pending</span>
                          ) : (
                            <span>{images.progress}%</span>
                          )}
                        </div>
                      </div>

                      {/* Subtitles */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Subtitles className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <Progress value={subtitles.status === 'complete' ? 100 : subtitles.progress} className="h-1.5 flex-1" />
                        <div className="text-xs text-text-secondary shrink-0 text-right min-w-[60px]">
                          {subtitles.status === 'complete' ? (
                            <span className="flex items-center justify-end gap-1 text-success">
                              <Check className="w-3 h-3" />
                              done
                            </span>
                          ) : subtitles.status === 'pending' ? (
                            <span className="text-text-tertiary">pending</span>
                          ) : (
                            <span className="flex items-center justify-end gap-1">
                              <span>{subtitles.progress}%</span>
                              {subtitles.activeWorkers !== undefined && (
                                <span className="text-green-400 text-[10px] font-medium">⚡{subtitles.activeWorkers}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timer + Overall + Status */}
                      <div className="flex items-center gap-3 shrink-0">
                        {group.overallStatus === 'processing' && (
                          <div className="flex items-center gap-1 text-text-tertiary">
                            <Clock className="w-3 h-3" />
                            <span className="text-xs font-mono">{formatElapsedTime(group.startedAt)}</span>
                          </div>
                        )}
                        <span className="text-xs font-medium text-text-primary">{overallProgress}%</span>
                        <Badge
                          variant={
                            group.overallStatus === 'processing' ? 'info' :
                            group.overallStatus === 'failed' ? 'destructive' :
                            'secondary'
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {group.overallStatus}
                        </Badge>
                      </div>
                    </div>

                    {/* Error message */}
                    {hasFailed && (
                      <p className="mt-2 text-xs text-error">
                        {group.tasks.find(t => t.status === 'failed')?.error}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <ListTodo className="w-10 h-10 mx-auto text-text-tertiary mb-3" />
              <h4 className="text-text-primary font-medium mb-1">Queue is empty</h4>
              <p className="text-text-secondary text-sm">
                No active generation tasks
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
