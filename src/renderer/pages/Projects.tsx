import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { FileVideo, Plus, CheckCircle, Clock, AlertCircle, Pencil } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { formatRelativeTime, formatWordCount } from '../lib/format'
import type { ProjectWithChannel } from '@shared/types'

export function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = React.useState<ProjectWithChannel[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const data = await window.api.projects.getAll()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
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
        return <Clock className="w-4 h-4 text-warning animate-pulse" />
      default:
        return <Pencil className="w-4 h-4 text-text-tertiary" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
      completed: 'success',
      failed: 'destructive',
      generating: 'warning',
      queued: 'warning',
      draft: 'secondary',
      archived: 'secondary',
    }
    return variants[status] || 'secondary'
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
            All your video projects across all channels
          </p>
        </div>
        <Button onClick={() => navigate('/projects/new')} className="gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {/* Projects List */}
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
                  <div className="flex items-center gap-4">
                    {getStatusIcon(project.status)}
                    <div>
                      <h4 className="font-semibold text-text-primary">{project.title}</h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                        <span
                          className="px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: `${project.categoryColor}20`, color: project.categoryColor }}
                        >
                          {project.categoryName}
                        </span>
                        <span>•</span>
                        <span>{project.channelName}</span>
                        <span>•</span>
                        <span>{formatWordCount(project.scriptWordCount)}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(project.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {project.status === 'completed' && (
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span>{project.imageCount} images</span>
                        {project.audioDurationSeconds && (
                          <>
                            <span>•</span>
                            <span>{Math.floor(project.audioDurationSeconds / 60)}:{(project.audioDurationSeconds % 60).toString().padStart(2, '0')}</span>
                          </>
                        )}
                      </div>
                    )}
                    <Badge variant={getStatusBadge(project.status)}>
                      {project.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <FileVideo className="w-12 h-12 mx-auto text-text-tertiary mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No projects yet</h3>
          <p className="text-text-secondary text-sm mb-6">
            Create your first project to get started
          </p>
          <Button onClick={() => navigate('/projects/new')}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>
      )}
    </div>
  )
}
