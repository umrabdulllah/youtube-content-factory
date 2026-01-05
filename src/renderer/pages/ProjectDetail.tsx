import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FolderOpen,
  Sparkles,
  FileText,
  Image,
  Music,
  Subtitles,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { useToast } from '../components/ui/toaster'
import { formatRelativeTime, formatWordCount, estimateReadingTime, formatDuration } from '../lib/format'
import type { Project, Channel } from '@shared/types'

interface ProjectAssets {
  images: string[]
  audioPath: string | null
  subtitles: string | null
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [project, setProject] = React.useState<Project | null>(null)
  const [channel, setChannel] = React.useState<Channel | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const [editScript, setEditScript] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Assets state
  const [assets, setAssets] = React.useState<ProjectAssets>({ images: [], audioPath: null, subtitles: null })

  // Image gallery state
  const [selectedImageIndex, setSelectedImageIndex] = React.useState<number | null>(null)
  const [imageData, setImageData] = React.useState<Map<string, string>>(new Map())
  const [loadingImages, setLoadingImages] = React.useState<Set<string>>(new Set())

  // Audio player state
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [audioProgress, setAudioProgress] = React.useState(0)
  const [audioDuration, setAudioDuration] = React.useState(0)
  const [isMuted, setIsMuted] = React.useState(false)

  // Subtitles state
  const [showSubtitles, setShowSubtitles] = React.useState(false)

  React.useEffect(() => {
    if (id) {
      loadProject()
    }
  }, [id])

  // Cleanup audio on unmount
  React.useEffect(() => {
    const audio = audioRef.current
    return () => {
      if (audio) {
        audio.pause()
        audio.src = ''
      }
    }
  }, [])

  React.useEffect(() => {
    if (project && project.status === 'completed') {
      loadAssets()
    }
  }, [project])

  // Subscribe to real-time events for generating/queued projects
  // Using event-driven updates only (no polling) to prevent race conditions
  React.useEffect(() => {
    if (!project || (project.status !== 'generating' && project.status !== 'queued')) {
      return
    }

    // Subscribe to status changes to detect completion/failure
    const unsubscribeStatus = window.api.queue.onStatusChange((data) => {
      // Reload project when any task completes or fails
      if (data.status === 'completed' || data.status === 'failed') {
        loadProject()
      }
    })

    // Subscribe to progress updates for real-time progress display
    // Debounce to prevent excessive reloads from rapid progress updates
    let progressDebounceTimer: NodeJS.Timeout | null = null
    const unsubscribeProgress = window.api.queue.onProgress(() => {
      if (progressDebounceTimer) {
        clearTimeout(progressDebounceTimer)
      }
      progressDebounceTimer = setTimeout(() => {
        loadProject()
      }, 500) // Debounce to max once per 500ms
    })

    return () => {
      unsubscribeStatus()
      unsubscribeProgress()
      if (progressDebounceTimer) {
        clearTimeout(progressDebounceTimer)
      }
    }
  }, [project?.status])

  const loadProject = async () => {
    try {
      const projectData = await window.api.projects.getById(id!)
      setProject(projectData)

      if (projectData) {
        const channelData = await window.api.channels.getById(projectData.channelId)
        setChannel(channelData)
      }
    } catch (error) {
      console.error('Failed to load project:', error)
      toast({ title: 'Error', description: 'Failed to load project', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const loadAssets = async () => {
    if (!id) return
    try {
      const assetsData = await window.api.projects.getAssets(id)
      setAssets(assetsData)

      // Preload first few images
      if (assetsData.images.length > 0) {
        const preloadCount = Math.min(6, assetsData.images.length)
        for (let i = 0; i < preloadCount; i++) {
          loadImage(assetsData.images[i])
        }
      }
    } catch (error) {
      console.error('Failed to load assets:', error)
    }
  }

  const loadImage = async (imageName: string) => {
    if (!id || imageData.has(imageName) || loadingImages.has(imageName)) return

    setLoadingImages((prev) => new Set(prev).add(imageName))
    try {
      const data = await window.api.projects.getImage(id, imageName)
      if (data) {
        setImageData((prev) => new Map(prev).set(imageName, data))
      }
    } catch (error) {
      console.error(`Failed to load image ${imageName}:`, error)
    } finally {
      setLoadingImages((prev) => {
        const next = new Set(prev)
        next.delete(imageName)
        return next
      })
    }
  }

  const handleOpenEdit = () => {
    if (project) {
      setEditTitle(project.title)
      setEditScript(project.script || '')
      setEditDialogOpen(true)
    }
  }

  const handleSaveEdit = async () => {
    if (!project) return

    setSaving(true)
    try {
      const updatedProject = await window.api.projects.update({
        id: project.id,
        title: editTitle,
        script: editScript,
      })
      setProject(updatedProject)
      setEditDialogOpen(false)
      toast({ title: 'Success', description: 'Project updated', variant: 'success' })
    } catch (error) {
      console.error('Failed to update project:', error)
      toast({ title: 'Error', description: 'Failed to update project', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (!project) return

    try {
      await window.api.projects.generate(project.id)
      toast({ title: 'Success', description: 'Project queued for generation', variant: 'success' })
      navigate('/queue')
    } catch (error) {
      console.error('Failed to queue project:', error)
      toast({ title: 'Error', description: 'Failed to queue project', variant: 'destructive' })
    }
  }

  const handleOpenFolder = async () => {
    if (!project) return
    await window.api.projects.openFolder(project.id)
  }

  const handleDelete = async () => {
    if (!project) return

    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      await window.api.projects.delete(project.id)
      toast({ title: 'Success', description: 'Project deleted', variant: 'success' })
      navigate(-1)
    } catch (error) {
      console.error('Failed to delete project:', error)
      toast({ title: 'Error', description: 'Failed to delete project', variant: 'destructive' })
    }
  }

  // Image gallery navigation
  const openImage = (index: number) => {
    setSelectedImageIndex(index)
    // Preload adjacent images
    const adjacentIndexes = [index - 1, index, index + 1].filter(
      (i) => i >= 0 && i < assets.images.length
    )
    adjacentIndexes.forEach((i) => loadImage(assets.images[i]))
  }

  const navigateImage = (direction: 'prev' | 'next') => {
    if (selectedImageIndex === null) return
    const newIndex =
      direction === 'prev'
        ? Math.max(0, selectedImageIndex - 1)
        : Math.min(assets.images.length - 1, selectedImageIndex + 1)
    openImage(newIndex)
  }

  // Audio controls
  const togglePlay = async () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        try {
          await audioRef.current.play()
          setIsPlaying(true)
        } catch (error) {
          console.error('Failed to play audio:', error)
          // Don't update state if play failed
        }
      }
    }
  }

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioProgress(audioRef.current.currentTime)
    }
  }

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration)
    }
  }

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setAudioProgress(time)
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success" />
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-error" />
      case 'generating':
      case 'queued':
        return <Clock className="w-5 h-5 text-warning animate-pulse" />
      default:
        return <FileText className="w-5 h-5 text-text-tertiary" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
      completed: 'success',
      failed: 'destructive',
      generating: 'warning',
      queued: 'warning',
      draft: 'secondary',
    }
    return variants[status] || 'secondary'
  }

  // Edit word count
  const editWordCount = React.useMemo(() => {
    return editScript.trim().split(/\s+/).filter((word) => word.length > 0).length
  }, [editScript])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Project not found</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            {getStatusIcon(project.status)}
            <div>
              <h2 className="text-xl font-bold text-text-primary">{project.title}</h2>
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span>{channel?.name || 'Unknown Channel'}</span>
                <span>•</span>
                <span>{formatRelativeTime(project.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={getStatusBadge(project.status)} className="text-sm">
            {project.status}
          </Badge>

          {project.status === 'draft' && (
            <Button variant="outline" onClick={handleOpenEdit} className="gap-2">
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          )}

          {project.status === 'completed' && (
            <Button variant="outline" onClick={handleOpenFolder} className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </Button>
          )}

          {(project.status === 'draft' || project.status === 'failed') && (
            <Button onClick={handleGenerate} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-error">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Script */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Script
              </CardTitle>
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <span>{formatWordCount(project.scriptWordCount)}</span>
                <span>•</span>
                <span>{estimateReadingTime(project.scriptWordCount)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-bg-elevated rounded-lg p-4 max-h-[400px] overflow-auto">
                <pre className="whitespace-pre-wrap text-sm text-text-secondary font-mono">
                  {project.script || 'No script available'}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Image Gallery (for completed projects) */}
          {project.status === 'completed' && assets.images.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Images ({assets.images.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {assets.images.map((imageName, index) => (
                    <button
                      key={imageName}
                      onClick={() => openImage(index)}
                      className="aspect-video bg-bg-elevated rounded-lg overflow-hidden border border-border hover:border-accent transition-colors"
                    >
                      {imageData.has(imageName) ? (
                        <img
                          src={imageData.get(imageName)}
                          alt={`Image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-tertiary text-xs">
                          {loadingImages.has(imageName) ? (
                            <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                          ) : (
                            <span
                              onClick={(e) => {
                                e.stopPropagation()
                                loadImage(imageName)
                              }}
                            >
                              {index + 1}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audio Player (for completed projects) */}
          {project.status === 'completed' && assets.audioPath && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Audio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <audio
                  ref={audioRef}
                  src={`file://${assets.audioPath}`}
                  onTimeUpdate={handleAudioTimeUpdate}
                  onLoadedMetadata={handleAudioLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white hover:bg-accent-hover transition-colors"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>

                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={audioDuration || 100}
                      value={audioProgress}
                      onChange={handleAudioSeek}
                      className="w-full h-1 bg-bg-elevated rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <div className="flex justify-between text-xs text-text-tertiary">
                      <span>{formatTime(audioProgress)}</span>
                      <span>{formatTime(audioDuration)}</span>
                    </div>
                  </div>

                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-md hover:bg-bg-hover text-text-secondary"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subtitles (for completed projects) */}
          {project.status === 'completed' && assets.subtitles && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Subtitles className="w-4 h-4" />
                  Subtitles
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSubtitles(!showSubtitles)}
                >
                  {showSubtitles ? 'Hide' : 'Show'}
                </Button>
              </CardHeader>
              {showSubtitles && (
                <CardContent>
                  <div className="bg-bg-elevated rounded-lg p-4 max-h-[300px] overflow-auto">
                    <pre className="whitespace-pre-wrap text-sm text-text-secondary font-mono">
                      {assets.subtitles}
                    </pre>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Generation Progress */}
          {(project.status === 'generating' || project.status === 'queued') && project.generationProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Generation Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Images */}
                {project.generationProgress.images && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Images
                      </span>
                      <span className="text-text-secondary">
                        {project.generationProgress.images.completed}/{project.generationProgress.images.total}
                      </span>
                    </div>
                    <Progress
                      value={(project.generationProgress.images.completed / project.generationProgress.images.total) * 100}
                    />
                  </div>
                )}

                {/* Audio */}
                {project.generationProgress.audio && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Music className="w-4 h-4" />
                        Audio
                      </span>
                      <span className="text-text-secondary">
                        {project.generationProgress.audio.progress}%
                      </span>
                    </div>
                    <Progress value={project.generationProgress.audio.progress} />
                  </div>
                )}

                {/* Subtitles */}
                {project.generationProgress.subtitles && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Subtitles className="w-4 h-4" />
                        Subtitles
                      </span>
                      <span className="text-text-secondary">
                        {project.generationProgress.subtitles.status}
                      </span>
                    </div>
                    <Progress
                      value={project.generationProgress.subtitles.status === 'completed' ? 100 : 0}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Error Message */}
          {project.status === 'failed' && project.errorMessage && (
            <Card className="border-error/30 bg-error/5">
              <CardHeader>
                <CardTitle className="text-base text-error flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Error
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary">{project.errorMessage}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Assets */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-accent" />
                  <span className="text-sm">Images</span>
                </div>
                <span className="text-sm font-medium">
                  {project.imageCount > 0 ? project.imageCount : '-'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400" />
                  <span className="text-sm">Audio</span>
                </div>
                <span className="text-sm font-medium">
                  {project.audioDurationSeconds
                    ? formatDuration(project.audioDurationSeconds)
                    : '-'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                <div className="flex items-center gap-2">
                  <Subtitles className="w-4 h-4 text-green-400" />
                  <span className="text-sm">Subtitles</span>
                </div>
                <span className="text-sm font-medium">
                  {project.subtitleCount > 0 ? `${project.subtitleCount} lines` : '-'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-tertiary">Created</span>
                <span>{formatRelativeTime(project.createdAt)}</span>
              </div>
              {project.queuedAt && (
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Queued</span>
                  <span>{formatRelativeTime(project.queuedAt)}</span>
                </div>
              )}
              {project.startedAt && (
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Started</span>
                  <span>{formatRelativeTime(project.startedAt)}</span>
                </div>
              )}
              {project.completedAt && (
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Completed</span>
                  <span>{formatRelativeTime(project.completedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Video title"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-script">Script</Label>
                <span className="text-xs text-text-tertiary">
                  {formatWordCount(editWordCount)} • {estimateReadingTime(editWordCount)}
                </span>
              </div>
              <Textarea
                id="edit-script"
                value={editScript}
                onChange={(e) => setEditScript(e.target.value)}
                placeholder="Your video script..."
                className="min-h-[400px] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      {selectedImageIndex !== null && assets.images[selectedImageIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedImageIndex(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setSelectedImageIndex(null)}
          >
            <X className="w-6 h-6" />
          </button>

          <button
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation()
              navigateImage('prev')
            }}
            disabled={selectedImageIndex === 0}
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <div className="max-w-[80vw] max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            {imageData.has(assets.images[selectedImageIndex]) ? (
              <img
                src={imageData.get(assets.images[selectedImageIndex])}
                alt={`Image ${selectedImageIndex + 1}`}
                className="max-w-full max-h-[80vh] object-contain"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
              </div>
            )}
          </div>

          <button
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation()
              navigateImage('next')
            }}
            disabled={selectedImageIndex === assets.images.length - 1}
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
            {selectedImageIndex + 1} / {assets.images.length}
          </div>
        </div>
      )}
    </div>
  )
}
