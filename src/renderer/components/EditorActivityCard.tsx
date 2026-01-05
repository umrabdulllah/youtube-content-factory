import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { EditorStatus, ActivityEventType } from '@shared/types'

interface EditorActivityCardProps {
  editor: EditorStatus
  className?: string
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never'

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function getEventLabel(eventType: ActivityEventType | null): string {
  if (!eventType) return 'Unknown'

  const labels: Record<ActivityEventType, string> = {
    project_created: 'Created project',
    project_started: 'Started project',
    project_completed: 'Completed project',
    project_failed: 'Project failed',
    status_changed: 'Updated status',
    app_opened: 'Opened app',
    app_closed: 'Closed app',
    heartbeat: 'Active',
  }

  return labels[eventType] || eventType
}

export function EditorActivityCard({ editor, className }: EditorActivityCardProps) {
  const isOnline = editor.isOnline
  const statusColor = isOnline ? 'bg-success' : 'bg-text-tertiary'
  const statusText = isOnline ? 'Online' : 'Offline'

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center text-text-secondary font-medium text-sm">
                {editor.editorName?.[0]?.toUpperCase() || 'E'}
              </div>
              <div
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-surface',
                  statusColor
                )}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">{editor.editorName || 'Unknown Editor'}</CardTitle>
              <p className="text-xs text-text-tertiary">{editor.editorId.slice(0, 8)}...</p>
            </div>
          </div>
          <Badge variant={isOnline ? 'success' : 'outline'} className="h-5">
            {statusText}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-tertiary">Last Activity</span>
            <span className="text-text-secondary">{formatTimeAgo(editor.lastActivityAt)}</span>
          </div>

          {editor.lastEventType && editor.lastEventType !== 'heartbeat' && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">Last Action</span>
              <span className="text-text-secondary">{getEventLabel(editor.lastEventType)}</span>
            </div>
          )}

          {editor.currentProject && (
            <div className="pt-2 border-t border-border mt-2">
              <p className="text-xs text-text-tertiary mb-1">Working on</p>
              <p className="text-sm text-text-primary truncate">{editor.currentProject}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface EditorStatusGridProps {
  editors: EditorStatus[]
  className?: string
}

export function EditorStatusGrid({ editors, className }: EditorStatusGridProps) {
  const onlineEditors = editors.filter((e) => e.isOnline)
  const offlineEditors = editors.filter((e) => !e.isOnline)

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-medium text-text-primary">Editors</h3>
        <Badge variant="secondary" className="h-5">
          {onlineEditors.length}/{editors.length} online
        </Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...onlineEditors, ...offlineEditors].map((editor) => (
          <EditorActivityCard key={editor.editorId} editor={editor} />
        ))}
        {editors.length === 0 && (
          <div className="col-span-full text-center py-8 text-text-tertiary text-sm">
            No editors registered yet
          </div>
        )}
      </div>
    </div>
  )
}
