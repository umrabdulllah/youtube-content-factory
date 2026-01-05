import { EventEmitter } from 'events'
import {
  addToSyncQueue,
  getPendingSyncItems,
  getPendingSyncCount,
  markSyncItemAttempted,
  removeSyncItem,
} from '../../database/queries/sync'
import type { SyncQueueItem } from '../../../shared/types'

// Exponential backoff delays in milliseconds
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000, 60000]

export class OfflineQueue extends EventEmitter {
  private isProcessing = false
  private processingTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
  }

  /**
   * Add an item to the offline sync queue
   */
  addItem(
    eventType: 'project_stats' | 'activity_log' | 'daily_stats',
    payload: Record<string, unknown>
  ): SyncQueueItem {
    const item = addToSyncQueue(eventType, payload)
    this.emit('itemAdded', item)
    return item
  }

  /**
   * Get all pending items in the queue
   */
  getPendingItems(limit = 50): SyncQueueItem[] {
    return getPendingSyncItems(limit)
  }

  /**
   * Get count of pending items
   */
  getPendingCount(): number {
    return getPendingSyncCount()
  }

  /**
   * Process the queue with a sync handler
   * Returns { success: number, failed: number }
   */
  async processQueue(
    syncHandler: (item: SyncQueueItem) => Promise<boolean>
  ): Promise<{ success: number; failed: number }> {
    if (this.isProcessing) {
      console.log('[OfflineQueue] Already processing, skipping')
      return { success: 0, failed: 0 }
    }

    this.isProcessing = true
    this.emit('processingStarted')

    let success = 0
    let failed = 0

    try {
      const items = this.getPendingItems()
      console.log(`[OfflineQueue] Processing ${items.length} items`)

      for (const item of items) {
        try {
          const result = await syncHandler(item)

          if (result) {
            // Successfully synced, remove from queue
            removeSyncItem(item.id)
            success++
            this.emit('itemSynced', item)
          } else {
            // Failed to sync, mark attempt
            markSyncItemAttempted(item.id, 'Sync returned false')
            failed++
            this.emit('itemFailed', item)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          markSyncItemAttempted(item.id, errorMessage)
          failed++
          this.emit('itemFailed', item, error)
          console.error(`[OfflineQueue] Error processing item ${item.id}:`, error)
        }
      }
    } finally {
      this.isProcessing = false
      this.emit('processingComplete', { success, failed })
    }

    return { success, failed }
  }

  /**
   * Start periodic processing with exponential backoff
   */
  startPeriodicProcessing(
    syncHandler: (item: SyncQueueItem) => Promise<boolean>,
    baseInterval = 30000 // 30 seconds
  ): void {
    if (this.processingTimer) {
      console.log('[OfflineQueue] Periodic processing already started')
      return
    }

    const processWithBackoff = async () => {
      const pendingCount = this.getPendingCount()

      if (pendingCount === 0) {
        // No items, schedule next check at base interval
        this.scheduleNextProcess(processWithBackoff, baseInterval)
        return
      }

      const result = await this.processQueue(syncHandler)

      if (result.failed > 0 && result.success === 0) {
        // All items failed, use exponential backoff
        const backoffIndex = Math.min(result.failed - 1, BACKOFF_DELAYS.length - 1)
        const delay = BACKOFF_DELAYS[backoffIndex]
        console.log(`[OfflineQueue] All items failed, backing off for ${delay}ms`)
        this.scheduleNextProcess(processWithBackoff, delay)
      } else {
        // Some success, continue at base interval
        this.scheduleNextProcess(processWithBackoff, baseInterval)
      }
    }

    // Start immediately
    processWithBackoff()
  }

  private scheduleNextProcess(callback: () => void, delay: number): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
    }
    this.processingTimer = setTimeout(callback, delay)
  }

  /**
   * Stop periodic processing
   */
  stopPeriodicProcessing(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
      this.processingTimer = null
    }
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopPeriodicProcessing()
    this.removeAllListeners()
  }
}

// Singleton instance
let offlineQueueInstance: OfflineQueue | null = null

export function getOfflineQueue(): OfflineQueue {
  if (!offlineQueueInstance) {
    offlineQueueInstance = new OfflineQueue()
  }
  return offlineQueueInstance
}

export function cleanupOfflineQueue(): void {
  if (offlineQueueInstance) {
    offlineQueueInstance.cleanup()
    offlineQueueInstance = null
  }
}
