import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, FileVideo, Clock, CheckCircle, AlertCircle, Pencil } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { useToast } from '../components/ui/toaster'
import { formatRelativeTime, formatWordCount, estimateReadingTime } from '../lib/format'
import type { Channel, Project } from '@shared/types'

export function ChannelDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [channel, setChannel] = React.useState<Channel | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

  const loadData = async () => {
    try {
      const [channelData, projectsData] = await Promise.all([
        window.api.channels.getById(id!),
        window.api.projects.getByChannel(id!),
      ])
      setChannel(channelData)
      setProjects(projectsData)
    } catch (error) {
      console.error('Failed to load channel:', error)
      toast({ title: 'Error', description: 'Failed to load channel', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success" />
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-error" />
      case 'generating':
      case 'queued':
        return <Clock className="w-4 h-4 text-warning" />
      default:
        return <Pencil className="w-4 h-4 text-text-tertiary" />
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'failed':
        return 'destructive'
      case 'generating':
      case 'queued':
        return 'warning'
      default:
        return 'secondary'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Channel not found</p>
        <Button variant="outline" onClick={() => navigate('/channels')} className="mt-4">
          Back to Channels
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
          <div>
            <h2 className="text-xl font-bold text-text-primary">{channel.name}</h2>
            {channel.description && (
              <p className="text-sm text-text-secondary">{channel.description}</p>
            )}
          </div>
        </div>
        <Button onClick={() => navigate('/projects/new', { state: { channelId: channel.id } })} className="gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-text-primary">{projects.length}</p>
            <p className="text-xs text-text-secondary">Total Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">
              {projects.filter((p) => p.status === 'completed').length}
            </p>
            <p className="text-xs text-text-secondary">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">
              {projects.filter((p) => p.status === 'queued' || p.status === 'generating').length}
            </p>
            <p className="text-xs text-text-secondary">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-text-tertiary">
              {projects.filter((p) => p.status === 'draft').length}
            </p>
            <p className="text-xs text-text-secondary">Drafts</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <div>
        <h3 className="font-semibold text-text-primary mb-4">Projects</h3>
        {projects.length > 0 ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:border-border-strong transition-colors"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(project.status)}
                      <div>
                        <h4 className="font-semibold text-text-primary">{project.title}</h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                          <span>{formatWordCount(project.scriptWordCount)}</span>
                          <span>{estimateReadingTime(project.scriptWordCount)}</span>
                          <span>{formatRelativeTime(project.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(project.status) as 'success' | 'destructive' | 'warning' | 'secondary'}>
                      {project.status}
                    </Badge>
                  </div>

                  {/* Progress for generating projects */}
                  {project.status === 'generating' && project.generationProgress && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-4 text-xs">
                        {project.generationProgress.images && (
                          <span className="text-text-secondary">
                            Images: {project.generationProgress.images.completed}/{project.generationProgress.images.total}
                          </span>
                        )}
                        {project.generationProgress.audio && (
                          <span className="text-text-secondary">
                            Audio: {project.generationProgress.audio.progress}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-bg-surface rounded-lg border border-border">
            <FileVideo className="w-10 h-10 mx-auto text-text-tertiary mb-3" />
            <h4 className="text-text-primary font-medium mb-1">No projects yet</h4>
            <p className="text-text-secondary text-sm mb-4">
              Create your first project for this channel
            </p>
            <Button onClick={() => navigate('/projects/new', { state: { channelId: channel.id } })}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
