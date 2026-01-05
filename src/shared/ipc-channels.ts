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
} as const
