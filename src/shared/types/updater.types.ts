// Auto-updater types for electron-updater integration

export interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes?: string | ReleaseNoteInfo[]
  releaseName?: string
  files: UpdateFileInfo[]
  path: string
  sha512: string
}

export interface ReleaseNoteInfo {
  version: string
  note: string | null
}

export interface UpdateFileInfo {
  url: string
  size?: number
  sha512?: string
}

export interface ProgressInfo {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  updateInfo: UpdateInfo | null
  progress: ProgressInfo | null
  error: string | null
  currentVersion: string
}

export interface CheckForUpdatesResult {
  updateAvailable: boolean
  updateInfo: UpdateInfo | null
  error: string | null
}

export interface DownloadResult {
  success: boolean
  error: string | null
}
