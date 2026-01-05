// Application constants
export const APP_NAME = 'YouTube Content Factory'
export const APP_VERSION = '1.0.0'

// Database
export const DATABASE_NAME = 'database.sqlite'
export const CONFIG_NAME = 'config.json'

// File names
export const CATEGORY_JSON = 'category.json'
export const CHANNEL_JSON = 'channel.json'
export const PROJECT_JSON = 'project.json'
export const SCRIPT_FILE = 'script.txt'

// Directory names
export const IMAGES_DIR = 'images'
export const VOICEOVERS_DIR = 'voiceovers'
export const SUBTITLES_DIR = 'subtitles'

// Status colors
export const STATUS_COLORS: Record<string, string> = {
  draft: '#6b6b6b',
  queued: '#eab308',
  generating: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  archived: '#4a4a4a',
}

// Default category colors
export const CATEGORY_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
]

// Default icons
export const CATEGORY_ICONS = [
  'folder',
  'film',
  'music',
  'gamepad-2',
  'heart',
  'lightbulb',
  'book',
  'briefcase',
  'globe',
  'star',
]

// Generation settings
export const IMAGE_STYLES = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'anime', label: 'Anime' },
  { value: 'digital-art', label: 'Digital Art' },
  { value: 'dramatic', label: 'Dramatic' },
]

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
]
