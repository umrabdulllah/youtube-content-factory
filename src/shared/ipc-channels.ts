// IPC Channel names for communication between main and renderer processes

export const IPC_CHANNELS = {
  // Categories
  CATEGORIES: {
    GET_ALL: 'categories:getAll',
    GET_BY_ID: 'categories:getById',
    CREATE: 'categories:create',
    UPDATE: 'categories:update',
    DELETE: 'categories:delete',
    REORDER: 'categories:reorder',
  },

  // Channels
  CHANNELS: {
    GET_ALL: 'channels:getAll',
    GET_BY_ID: 'channels:getById',
    GET_BY_CATEGORY: 'channels:getByCategory',
    CREATE: 'channels:create',
    UPDATE: 'channels:update',
    DELETE: 'channels:delete',
  },

  // Projects
  PROJECTS: {
    GET_ALL: 'projects:getAll',
    GET_BY_ID: 'projects:getById',
    GET_BY_CHANNEL: 'projects:getByChannel',
    CREATE: 'projects:create',
    UPDATE: 'projects:update',
    DELETE: 'projects:delete',
    GENERATE: 'projects:generate',
    OPEN_FOLDER: 'projects:openFolder',
    GET_ASSETS: 'projects:getAssets',
    GET_IMAGE: 'projects:getImage',
    GET_AUDIO_PATH: 'projects:getAudioPath',
    GET_SUBTITLES: 'projects:getSubtitles',
  },

  // Queue
  QUEUE: {
    GET_ALL: 'queue:getAll',
    GET_STATS: 'queue:getStats',
    GET_PAUSED: 'queue:getPaused',
    PAUSE: 'queue:pause',
    RESUME: 'queue:resume',
    CANCEL_TASK: 'queue:cancelTask',
    RETRY_TASK: 'queue:retryTask',
    REORDER_TASK: 'queue:reorderTask',
    ON_PROGRESS: 'queue:onProgress',
    ON_STATUS_CHANGE: 'queue:onStatusChange',
  },

  // Settings
  SETTINGS: {
    GET: 'settings:get',
    SET: 'settings:set',
    GET_VALUE: 'settings:getValue',
    SET_VALUE: 'settings:setValue',
    SELECT_DIRECTORY: 'settings:selectDirectory',
    FETCH_VOICE_TEMPLATES: 'settings:fetchVoiceTemplates',
    CHECK_VOICE_BALANCE: 'settings:checkVoiceBalance',
  },

  // Analytics
  ANALYTICS: {
    GET_DASHBOARD: 'analytics:getDashboard',
    GET_CATEGORY_STATS: 'analytics:getCategoryStats',
    GET_TIMELINE: 'analytics:getTimeline',
  },

  // Search
  SEARCH: {
    QUERY: 'search:query',
  },

  // File System
  FILE_SYSTEM: {
    OPEN_PATH: 'fs:openPath',
    GET_APP_PATH: 'fs:getAppPath',
    GET_LOG_PATH: 'fs:getLogPath',
    OPEN_LOGS_FOLDER: 'fs:openLogsFolder',
  },

  // Window
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
  },

  // Auth
  AUTH: {
    LOGIN: 'auth:login',
    LOGOUT: 'auth:logout',
    GET_SESSION: 'auth:getSession',
    REFRESH_SESSION: 'auth:refreshSession',
    REGISTER_WITH_INVITE: 'auth:registerWithInvite',
    GET_CURRENT_USER: 'auth:getCurrentUser',
    UPDATE_PROFILE: 'auth:updateProfile',
    CHANGE_PASSWORD: 'auth:changePassword',
  },

  // Users (Admin only)
  USERS: {
    GET_ALL: 'users:getAll',
    GET_BY_ID: 'users:getById',
    UPDATE_ROLE: 'users:updateRole',
    DELETE: 'users:delete',
    CREATE_INVITE: 'users:createInvite',
    GET_INVITES: 'users:getInvites',
    REVOKE_INVITE: 'users:revokeInvite',
  },

  // Sync (Stats synchronization)
  SYNC: {
    GET_STATE: 'sync:getState',
    SYNC_NOW: 'sync:syncNow',
    LOG_ACTIVITY: 'sync:logActivity',
    SYNC_PROJECT: 'sync:syncProject',
    GET_PENDING_COUNT: 'sync:getPendingCount',
    // Admin only
    GET_DASHBOARD: 'sync:getDashboard',
    GET_EDITOR_STATUS: 'sync:getEditorStatus',
    GET_ALL_EDITORS: 'sync:getAllEditors',
    GET_ACTIVITY_FEED: 'sync:getActivityFeed',
    GET_PROJECT_STATS: 'sync:getProjectStats',
    GET_DAILY_STATS: 'sync:getDailyStats',
    // Real-time events
    ON_SYNC_STATE_CHANGE: 'sync:onSyncStateChange',
    ON_ACTIVITY: 'sync:onActivity',
    ON_EDITOR_STATUS_CHANGE: 'sync:onEditorStatusChange',
  },

  // Updater
  UPDATER: {
    CHECK_FOR_UPDATES: 'updater:checkForUpdates',
    DOWNLOAD_UPDATE: 'updater:downloadUpdate',
    INSTALL_UPDATE: 'updater:installUpdate',
    GET_STATE: 'updater:getState',
    GET_CURRENT_VERSION: 'updater:getCurrentVersion',
    // Real-time events
    ON_STATE_CHANGE: 'updater:onStateChange',
    ON_DOWNLOAD_PROGRESS: 'updater:onDownloadProgress',
    ON_UPDATE_AVAILABLE: 'updater:onUpdateAvailable',
    ON_UPDATE_DOWNLOADED: 'updater:onUpdateDownloaded',
    ON_ERROR: 'updater:onError',
  },

  // API Keys (Centralized management)
  API_KEYS: {
    GET_ALL: 'apiKeys:getAll', // Admin: full values, Editor: masked
    GET_MASKED: 'apiKeys:getMasked', // Always returns masked values
    GET_STATUS: 'apiKeys:getStatus', // Returns which keys are configured
    SET: 'apiKeys:set', // Admin only
    DELETE: 'apiKeys:delete', // Admin only
    REFRESH_CACHE: 'apiKeys:refreshCache', // Force re-fetch from cloud
  },

  // Cloud Sync (Categories/Channels/API Keys synchronization)
  CLOUD_SYNC: {
    CHECK_FOR_UPDATES: 'cloudSync:checkForUpdates',
    PULL_ALL: 'cloudSync:pullAll', // Sync categories and channels from cloud
    PULL_CATEGORIES: 'cloudSync:pullCategories',
    PULL_CHANNELS: 'cloudSync:pullChannels',
    PUSH_ALL: 'cloudSync:pushAll', // Admin: push all categories and channels to cloud
    GET_STATUS: 'cloudSync:getStatus',
    // Real-time events
    ON_SYNC_COMPLETE: 'cloudSync:onSyncComplete',
    ON_SYNC_ERROR: 'cloudSync:onSyncError',
  },
} as const
