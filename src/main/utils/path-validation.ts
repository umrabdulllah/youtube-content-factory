import path from 'node:path'
import os from 'node:os'

/**
 * Validates that a target path is within an allowed base directory.
 * Prevents path traversal attacks using ../
 */
export function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath)
  const resolvedBase = path.resolve(basePath)

  // Ensure the resolved target starts with the base path
  // Adding path.sep ensures we don't match partial directory names
  // e.g., /home/user/documents vs /home/user/documents2
  return resolvedTarget === resolvedBase ||
         resolvedTarget.startsWith(resolvedBase + path.sep)
}

/**
 * Sanitizes a slug to only contain safe characters.
 * Prevents path traversal by removing any directory separators or ..
 *
 * @param slug The slug to sanitize
 * @returns Sanitized slug containing only alphanumeric, dash, underscore, and dots (not leading)
 * @throws Error if the slug is empty or becomes empty after sanitization
 */
export function sanitizeSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Slug cannot be empty')
  }

  // Remove any path separators and parent directory references
  // Only allow: alphanumeric, dash, underscore, space (converted to dash), and non-leading dots
  const sanitized = slug
    // Replace path separators with nothing
    .replace(/[/\\]/g, '')
    // Replace .. with nothing
    .replace(/\.\./g, '')
    // Remove any characters that aren't alphanumeric, dash, underscore, space, or dot
    .replace(/[^a-zA-Z0-9\-_\s.]/g, '')
    // Replace spaces with dashes
    .replace(/\s+/g, '-')
    // Remove leading dots (hidden files)
    .replace(/^\.+/, '')
    // Collapse multiple dashes
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '')
    .trim()

  if (!sanitized) {
    throw new Error('Slug cannot be empty after sanitization')
  }

  return sanitized
}

/**
 * Validates that an image name doesn't contain path traversal characters.
 *
 * @param imageName The image file name to validate
 * @returns true if the image name is safe, false otherwise
 */
export function validateImageName(imageName: string): boolean {
  if (!imageName || typeof imageName !== 'string') {
    return false
  }

  // Check for path separators
  if (imageName.includes('/') || imageName.includes('\\')) {
    return false
  }

  // Check for parent directory reference
  if (imageName.includes('..')) {
    return false
  }

  // Check for null bytes (can bypass security checks)
  if (imageName.includes('\0')) {
    return false
  }

  // Must have a valid image extension
  if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(imageName)) {
    return false
  }

  return true
}

/**
 * Validates that a basePath is within safe directories (user's home or documents).
 *
 * @param basePath The base path to validate
 * @returns Object with valid status and optional error message
 */
export function validateBasePath(basePath: string): { valid: boolean; error?: string } {
  if (!basePath || typeof basePath !== 'string') {
    return { valid: false, error: 'Base path cannot be empty' }
  }

  const resolvedPath = path.resolve(basePath)
  const homeDir = os.homedir()

  // Check for path traversal in the input
  if (basePath.includes('..')) {
    return { valid: false, error: 'Base path cannot contain ".."' }
  }

  // Reject root paths
  if (resolvedPath === '/' || resolvedPath === 'C:\\' || resolvedPath === 'C:/') {
    return { valid: false, error: 'Base path cannot be the root directory' }
  }

  // Must be within user's home directory
  if (!resolvedPath.startsWith(homeDir + path.sep) && resolvedPath !== homeDir) {
    return { valid: false, error: 'Base path must be within your home directory' }
  }

  // Reject sensitive directories
  const sensitivePatterns = [
    /[/\\]\.ssh($|[/\\])/i,
    /[/\\]\.gnupg($|[/\\])/i,
    /[/\\]\.aws($|[/\\])/i,
    /[/\\]\.config[/\\]gcloud($|[/\\])/i,
    /[/\\]Library[/\\]Keychains($|[/\\])/i,
    /[/\\]\.credentials($|[/\\])/i,
    /[/\\]\.git-credentials($|[/\\])/i,
  ]

  for (const pattern of sensitivePatterns) {
    if (pattern.test(resolvedPath)) {
      return { valid: false, error: 'Base path cannot be a sensitive system directory' }
    }
  }

  return { valid: true }
}

/**
 * Validates that a file path is safe to open and within allowed directories.
 *
 * @param filePath The file path to validate
 * @param basePath The allowed base directory
 * @returns Object with valid status and optional error message
 */
export function validateFilePath(filePath: string, basePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path cannot be empty' }
  }

  if (!basePath || typeof basePath !== 'string') {
    return { valid: false, error: 'Base path cannot be empty' }
  }

  // Check for null bytes
  if (filePath.includes('\0')) {
    return { valid: false, error: 'File path contains invalid characters' }
  }

  // Resolve both paths
  const resolvedFilePath = path.resolve(filePath)
  const resolvedBasePath = path.resolve(basePath)

  // Verify the file path is within the base path
  if (!isPathWithinBase(resolvedFilePath, resolvedBasePath)) {
    return { valid: false, error: 'File path is outside the allowed directory' }
  }

  return { valid: true }
}
