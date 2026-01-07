/**
 * Platform detection utilities for keyboard shortcuts
 */

// Check if running on macOS
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

/**
 * Get the modifier key symbol/text based on platform
 * Returns ⌘ on Mac, Ctrl on Windows/Linux
 */
export function getModifierKey(): string {
  return isMac ? '⌘' : 'Ctrl+'
}

/**
 * Get the modifier key for display (shorter version)
 * Returns ⌘ on Mac, Ctrl on Windows/Linux
 */
export function getModifierSymbol(): string {
  return isMac ? '⌘' : 'Ctrl'
}

/**
 * Check if the current platform is macOS
 */
export function isMacOS(): boolean {
  return isMac
}

/**
 * Hook to get platform-aware keyboard shortcut display
 */
export function usePlatform() {
  return {
    isMac,
    modifierKey: getModifierKey(),
    modifierSymbol: getModifierSymbol(),
    // Format a shortcut like "K" to "⌘K" or "Ctrl+K"
    formatShortcut: (key: string) => isMac ? `⌘${key}` : `Ctrl+${key}`,
  }
}
