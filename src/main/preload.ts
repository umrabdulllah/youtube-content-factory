import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  Category,
  CategoryWithStats,
  CreateCategoryInput,
  UpdateCategoryInput,
  Channel,
  ChannelWithCategory,
  CreateChannelInput,
  UpdateChannelInput,
  Project,
  ProjectWithChannel,
  CreateProjectInput,
  UpdateProjectInput,
  QueueTaskWithProject,
  QueueStats,
  AppSettings,
} from '../shared/types'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const api = {
  // Categories
  categories: {
    getAll: (): Promise<CategoryWithStats[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES.GET_ALL),
    getById: (id: string): Promise<Category | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES.GET_BY_ID, id),
    create: (input: CreateCategoryInput): Promise<Category> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES.CREATE, input),
    update: (input: UpdateCategoryInput): Promise<Category> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES.UPDATE, input),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES.DELETE, id),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES.REORDER, ids),
  },

  // Channels
  channels: {
    getAll: (): Promise<ChannelWithCategory[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHANNELS.GET_ALL),
    getById: (id: string): Promise<Channel | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHANNELS.GET_BY_ID, id),
    getByCategory: (categoryId: string): Promise<Channel[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHANNELS.GET_BY_CATEGORY, categoryId),
    create: (input: CreateChannelInput): Promise<Channel> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHANNELS.CREATE, input),
    update: (input: UpdateChannelInput): Promise<Channel> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHANNELS.UPDATE, input),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHANNELS.DELETE, id),
  },

  // Projects
  projects: {
    getAll: (): Promise<ProjectWithChannel[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_ALL),
    getById: (id: string): Promise<Project | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_BY_ID, id),
    getByChannel: (channelId: string): Promise<Project[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_BY_CHANNEL, channelId),
    create: (input: CreateProjectInput): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.CREATE, input),
    update: (input: UpdateProjectInput): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.UPDATE, input),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.DELETE, id),
    generate: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GENERATE, id),
    openFolder: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.OPEN_FOLDER, id),
    getAssets: (id: string): Promise<{ images: string[]; audioPath: string | null; subtitles: string | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_ASSETS, id),
    getImage: (id: string, imageName: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_IMAGE, id, imageName),
    getAudioPath: (id: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_AUDIO_PATH, id),
    getSubtitles: (id: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS.GET_SUBTITLES, id),
  },

  // Queue
  queue: {
    getAll: (): Promise<QueueTaskWithProject[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.GET_ALL),
    getStats: (): Promise<QueueStats> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.GET_STATS),
    getPaused: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.GET_PAUSED),
    pause: (): Promise<{ paused: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.PAUSE),
    resume: (): Promise<{ paused: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.RESUME),
    cancelTask: (taskId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.CANCEL_TASK, taskId),
    retryTask: (taskId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.RETRY_TASK, taskId),
    reorderTask: (taskId: string, newPriority: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUEUE.REORDER_TASK, taskId, newPriority),
    onProgress: (callback: (data: { taskId: string; progress: number; progressDetails?: Record<string, unknown> }) => void) => {
      const handler = (_: unknown, data: { taskId: string; progress: number; progressDetails?: Record<string, unknown> }) => {
        callback(data)
      }
      ipcRenderer.on(IPC_CHANNELS.QUEUE.ON_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.QUEUE.ON_PROGRESS, handler)
    },
    onStatusChange: (callback: (data: { taskId: string; status: string; error?: string }) => void) => {
      const handler = (_: unknown, data: { taskId: string; status: string; error?: string }) => {
        callback(data)
      }
      ipcRenderer.on(IPC_CHANNELS.QUEUE.ON_STATUS_CHANGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.QUEUE.ON_STATUS_CHANGE, handler)
    },
    onPipelineComplete: (callback: (data: { projectId: string }) => void) => {
      const handler = (_: unknown, data: { projectId: string }) => {
        callback(data)
      }
      ipcRenderer.on('pipeline:complete', handler)
      return () => ipcRenderer.removeListener('pipeline:complete', handler)
    },
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET),
    set: (settings: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET, settings),
    getValue: <K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_VALUE, key),
    setValue: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_VALUE, key, value),
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SELECT_DIRECTORY),
    fetchVoiceTemplates: (apiKey: string): Promise<{ templates: Array<{ id: string; uuid?: string; name: string }>; balance?: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.FETCH_VOICE_TEMPLATES, apiKey),
    checkVoiceBalance: (apiKey: string): Promise<{ balance: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.CHECK_VOICE_BALANCE, apiKey),
  },

  // Analytics
  analytics: {
    getDashboard: (): Promise<{
      totalCategories: number
      totalChannels: number
      totalProjects: number
      completedToday: number
      inQueue: number
      recentActivity: Array<{ id: string; type: string; title: string; status: string; timestamp: string; channelName: string | null; categoryName: string | null }>
    }> => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS.GET_DASHBOARD),
    getCategoryStats: (): Promise<Array<{ name: string; count: number; color: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS.GET_CATEGORY_STATS),
    getTimeline: (days: number): Promise<Array<{ date: string; created: number; completed: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS.GET_TIMELINE, days),
  },

  // Search
  search: {
    query: (
      query: string,
      limit?: number
    ): Promise<{
      categories: Array<{ type: 'category'; id: string; title: string; subtitle: string; color?: string }>
      channels: Array<{ type: 'channel'; id: string; title: string; subtitle: string; color?: string }>
      projects: Array<{ type: 'project'; id: string; title: string; subtitle: string; color?: string }>
      total: number
    }> => ipcRenderer.invoke(IPC_CHANNELS.SEARCH.QUERY, query, limit),
  },

  // File System
  fs: {
    openPath: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SYSTEM.OPEN_PATH, path),
    getAppPath: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SYSTEM.GET_APP_PATH),
    getLogPath: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SYSTEM.GET_LOG_PATH),
    openLogsFolder: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SYSTEM.OPEN_LOGS_FOLDER),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.CLOSE),
  },
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', api)

// Type declaration for the exposed API
export type ElectronAPI = typeof api
