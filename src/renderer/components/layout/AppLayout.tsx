import * as React from 'react'
import { Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import type { QueueStats } from '@shared/types'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [queueStats, setQueueStats] = React.useState<QueueStats | null>(null)

  // Subscribe to queue stats updates
  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await window.api.queue.getStats()
        setQueueStats(stats)
      } catch (error) {
        console.error('Failed to fetch queue stats:', error)
      }
    }

    fetchStats()

    const unsubscribe = window.api.queue.onStatusChange(() => {
      fetchStats() // Refresh stats when any task status changes
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
      {/* Unified Top Bar - spans full width */}
      <Header />

      {/* Below: Sidebar + Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Page Content */}
          <main className="flex-1 overflow-auto p-6">
            <div className="animate-in">
              {children}
            </div>
          </main>

          {/* Bottom Bar */}
          <footer className="h-6 px-4 flex items-center justify-between border-t border-border bg-bg-surface text-[11px] text-text-tertiary">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Ready
              </span>
            </div>

            {/* Queue Status - Center */}
            {queueStats && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {queueStats.pending} pending
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  {queueStats.processing} processing
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  {queueStats.completed} done
                </span>
                {queueStats.failed > 0 && (
                  <>
                    <span className="text-text-tertiary">·</span>
                    <span className="flex items-center gap-1 text-red-500">
                      <XCircle className="w-3 h-3" />
                      {queueStats.failed} failed
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <span>
                <kbd className="px-1 py-0.5 bg-bg-elevated rounded text-[9px] border border-border">⌘K</kbd>
                {' '}Search
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-bg-elevated rounded text-[9px] border border-border">⌘N</kbd>
                {' '}New
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
