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
  LoginCredentials,
  RegisterWithInviteInput,
  UserProfile,
  CreateInviteInput,
  InviteToken,
  UserRole,
  AuthResult,
  LogoutResult,
  SessionResult,
  SyncState,
  SyncProjectStatsInput,
  LogActivityInput,
  SyncResult,
  AdminDashboardData,
  EditorStatus,
  ActivityLog,
  PaginatedProjectStats,
  ProjectBrowserFilters,
  DailyStats,
  UpdateState,
  UpdateInfo,
  ProgressInfo,
  CheckForUpdatesResult,
  DownloadResult,
  ApiKeyType,
  ApiKeysConfig,
  MaskedApiKeys,
  CloudSyncStatus,
  CloudSyncVersions,
  PushAllResult,
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

  // Auth
  auth: {
    login: (credentials: LoginCredentials): Promise<AuthResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.LOGIN, credentials),
    logout: (): Promise<LogoutResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.LOGOUT),
    getSession: (): Promise<SessionResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.GET_SESSION),
    refreshSession: (): Promise<SessionResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.REFRESH_SESSION),
    registerWithInvite: (input: RegisterWithInviteInput): Promise<{ user: UserProfile | null; session: SessionResult['session'] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.REGISTER_WITH_INVITE, input),
    getCurrentUser: (): Promise<UserProfile | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.GET_CURRENT_USER),
    updateProfile: (updates: { displayName?: string }): Promise<UserProfile> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.UPDATE_PROFILE, updates),
    changePassword: (currentPassword: string, newPassword: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH.CHANGE_PASSWORD, currentPassword, newPassword),
  },

  // Users (Admin only)
  users: {
    getAll: (): Promise<UserProfile[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.GET_ALL),
    getById: (id: string): Promise<UserProfile | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.GET_BY_ID, id),
    updateRole: (userId: string, role: UserRole): Promise<UserProfile> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.UPDATE_ROLE, userId, role),
    delete: (userId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.DELETE, userId),
    createInvite: (input: CreateInviteInput): Promise<InviteToken> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.CREATE_INVITE, input),
    getInvites: (): Promise<InviteToken[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.GET_INVITES),
    revokeInvite: (inviteId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS.REVOKE_INVITE, inviteId),
  },

  // Sync (Stats synchronization)
  sync: {
    getState: (): Promise<SyncState> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_STATE),
    syncNow: (): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.SYNC_NOW),
    logActivity: (input: LogActivityInput): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.LOG_ACTIVITY, input),
    syncProject: (input: SyncProjectStatsInput): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.SYNC_PROJECT, input),
    getPendingCount: (): Promise<number> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_PENDING_COUNT),
    // Admin only
    getDashboard: (): Promise<AdminDashboardData> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_DASHBOARD),
    getEditorStatus: (editorId: string): Promise<EditorStatus | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_EDITOR_STATUS, editorId),
    getAllEditors: (): Promise<EditorStatus[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_ALL_EDITORS),
    getActivityFeed: (limit?: number): Promise<ActivityLog[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_ACTIVITY_FEED, limit),
    getProjectStats: (filters: ProjectBrowserFilters, page?: number, pageSize?: number): Promise<PaginatedProjectStats> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_PROJECT_STATS, filters, page, pageSize),
    getDailyStats: (days?: number): Promise<DailyStats[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC.GET_DAILY_STATS, days),
    // Real-time event listeners
    onSyncStateChange: (callback: (state: SyncState) => void) => {
      const handler = (_: unknown, state: SyncState) => callback(state)
      ipcRenderer.on(IPC_CHANNELS.SYNC.ON_SYNC_STATE_CHANGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC.ON_SYNC_STATE_CHANGE, handler)
    },
    onActivity: (callback: (activity: ActivityLog) => void) => {
      const handler = (_: unknown, activity: ActivityLog) => callback(activity)
      ipcRenderer.on(IPC_CHANNELS.SYNC.ON_ACTIVITY, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC.ON_ACTIVITY, handler)
    },
    onEditorStatusChange: (callback: (status: EditorStatus) => void) => {
      const handler = (_: unknown, status: EditorStatus) => callback(status)
      ipcRenderer.on(IPC_CHANNELS.SYNC.ON_EDITOR_STATUS_CHANGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC.ON_EDITOR_STATUS_CHANGE, handler)
    },
  },

  // Updater
  updater: {
    checkForUpdates: (): Promise<CheckForUpdatesResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER.CHECK_FOR_UPDATES),
    downloadUpdate: (): Promise<DownloadResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER.DOWNLOAD_UPDATE),
    installUpdate: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER.INSTALL_UPDATE),
    getState: (): Promise<UpdateState> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER.GET_STATE),
    getCurrentVersion: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER.GET_CURRENT_VERSION),
    // Real-time event listeners
    onStateChange: (callback: (state: UpdateState) => void) => {
      const handler = (_: unknown, state: UpdateState) => callback(state)
      ipcRenderer.on(IPC_CHANNELS.UPDATER.ON_STATE_CHANGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER.ON_STATE_CHANGE, handler)
    },
    onDownloadProgress: (callback: (progress: ProgressInfo) => void) => {
      const handler = (_: unknown, progress: ProgressInfo) => callback(progress)
      ipcRenderer.on(IPC_CHANNELS.UPDATER.ON_DOWNLOAD_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER.ON_DOWNLOAD_PROGRESS, handler)
    },
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      const handler = (_: unknown, info: UpdateInfo) => callback(info)
      ipcRenderer.on(IPC_CHANNELS.UPDATER.ON_UPDATE_AVAILABLE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER.ON_UPDATE_AVAILABLE, handler)
    },
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
      const handler = (_: unknown, info: UpdateInfo) => callback(info)
      ipcRenderer.on(IPC_CHANNELS.UPDATER.ON_UPDATE_DOWNLOADED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER.ON_UPDATE_DOWNLOADED, handler)
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_: unknown, error: string) => callback(error)
      ipcRenderer.on(IPC_CHANNELS.UPDATER.ON_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER.ON_ERROR, handler)
    },
  },

  // API Keys (Centralized management)
  apiKeys: {
    getAll: (): Promise<ApiKeysConfig | MaskedApiKeys> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS.GET_ALL),
    getMasked: (): Promise<MaskedApiKeys> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS.GET_MASKED),
    getStatus: (): Promise<Record<ApiKeyType, boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS.GET_STATUS),
    set: (keyType: ApiKeyType, value: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS.SET, keyType, value),
    delete: (keyType: ApiKeyType): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS.DELETE, keyType),
    refreshCache: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS.REFRESH_CACHE),
  },

  // Cloud Sync (Categories/Channels synchronization)
  cloudSync: {
    checkForUpdates: (): Promise<{
      needsSync: boolean
      cloudVersions: CloudSyncVersions | null
      localVersions: CloudSyncVersions
    }> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC.CHECK_FOR_UPDATES),
    pullAll: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC.PULL_ALL),
    pullCategories: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC.PULL_CATEGORIES),
    pullChannels: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC.PULL_CHANNELS),
    pushAll: (): Promise<PushAllResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC.PUSH_ALL),
    getStatus: (): Promise<CloudSyncStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC.GET_STATUS),
    // Real-time event listeners
    onSyncComplete: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_COMPLETE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_COMPLETE, handler)
    },
    onSyncError: (callback: (error: string) => void) => {
      const handler = (_: unknown, error: string) => callback(error)
      ipcRenderer.on(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLOUD_SYNC.ON_SYNC_ERROR, handler)
    },
  },
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', api)

// Type declaration for the exposed API
export type ElectronAPI = typeof api
