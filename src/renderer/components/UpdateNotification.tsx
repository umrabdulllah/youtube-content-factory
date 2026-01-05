// Update notification dialog component
import { useState, useEffect } from 'react'
import { Download, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { useUpdater } from '../hooks/useUpdater'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

export function UpdateNotification() {
  const {
    state,
    isDownloading,
    isUpdateAvailable,
    isUpdateDownloaded,
    hasError,
    downloadUpdate,
    installUpdate,
  } = useUpdater()

  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Show dialog when update is available or downloaded
  useEffect(() => {
    if ((isUpdateAvailable || isUpdateDownloaded) && !dismissed) {
      setIsOpen(true)
    }
  }, [isUpdateAvailable, isUpdateDownloaded, dismissed])

  // Handle dismiss
  const handleDismiss = () => {
    setIsOpen(false)
    setDismissed(true)
  }

  // Handle download
  const handleDownload = async () => {
    await downloadUpdate()
  }

  // Handle install (quit and install)
  const handleInstall = () => {
    installUpdate()
  }

  // Get release notes as string
  const getReleaseNotes = (): string | null => {
    if (!state.updateInfo?.releaseNotes) return null
    if (typeof state.updateInfo.releaseNotes === 'string') {
      return state.updateInfo.releaseNotes
    }
    // Array of release notes
    return state.updateInfo.releaseNotes
      .map((note) => `${note.version}: ${note.note || 'No notes'}`)
      .join('\n')
  }

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // Format speed
  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond)}/s`
  }

  const releaseNotes = getReleaseNotes()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUpdateDownloaded ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Update Ready to Install
              </>
            ) : isDownloading ? (
              <>
                <Download className="w-5 h-5 text-accent animate-pulse" />
                Downloading Update
              </>
            ) : hasError ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-500" />
                Update Error
              </>
            ) : (
              <>
                <Download className="w-5 h-5 text-accent" />
                Update Available
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isUpdateDownloaded ? (
              <>
                Version {state.updateInfo?.version} is ready. Restart to complete
                the update.
              </>
            ) : isDownloading ? (
              <>Downloading version {state.updateInfo?.version}...</>
            ) : hasError ? (
              <span className="text-red-500">{state.error}</span>
            ) : (
              <>
                A new version ({state.updateInfo?.version}) is available. You are
                currently on version {state.currentVersion}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Download Progress */}
        {isDownloading && state.progress && (
          <div className="space-y-2">
            <Progress value={state.progress.percent} />
            <div className="flex justify-between text-xs text-text-tertiary">
              <span>
                {formatBytes(state.progress.transferred)} /{' '}
                {formatBytes(state.progress.total)}
              </span>
              <span>{formatSpeed(state.progress.bytesPerSecond)}</span>
            </div>
          </div>
        )}

        {/* Release Notes */}
        {releaseNotes && !isDownloading && !hasError && (
          <div className="max-h-32 overflow-y-auto rounded-md bg-bg-elevated p-3 text-sm">
            <p className="text-text-secondary whitespace-pre-wrap">{releaseNotes}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isUpdateDownloaded ? (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                Later
              </Button>
              <Button onClick={handleInstall} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Restart & Install
              </Button>
            </>
          ) : isDownloading ? (
            <Button variant="outline" onClick={handleDismiss} disabled>
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Downloading...
            </Button>
          ) : hasError ? (
            <Button variant="outline" onClick={handleDismiss}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                Later
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download Update
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
