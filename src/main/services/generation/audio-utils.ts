/**
 * Audio Utilities
 *
 * Utilities for working with audio data, including buffer concatenation
 * and format handling.
 */

/**
 * Concatenate multiple audio buffers into a single buffer.
 * For MP3 files, this is a simple byte concatenation since MP3 frames are self-contained.
 *
 * @param buffers - Array of ArrayBuffers containing audio data
 * @returns Single concatenated ArrayBuffer
 */
export function concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    return new ArrayBuffer(0)
  }

  if (buffers.length === 1) {
    return buffers[0]
  }

  // Calculate total size
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)

  // Create new buffer and copy all data
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  }

  return result.buffer
}

/**
 * Convert an ArrayBuffer to a base64 string.
 *
 * @param buffer - The ArrayBuffer to convert
 * @returns Base64 encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64')
}

/**
 * Convert a base64 string to an ArrayBuffer.
 *
 * @param base64 - The base64 string to convert
 * @returns ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const buffer = Buffer.from(base64, 'base64')
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * Create a data URL from an ArrayBuffer.
 *
 * @param buffer - The ArrayBuffer containing audio data
 * @param mimeType - The MIME type (default: 'audio/mpeg')
 * @returns Data URL string
 */
export function createAudioDataUrl(buffer: ArrayBuffer, mimeType: string = 'audio/mpeg'): string {
  const base64 = arrayBufferToBase64(buffer)
  return `data:${mimeType};base64,${base64}`
}

/**
 * Parse a data URL and extract the ArrayBuffer.
 *
 * @param dataUrl - The data URL to parse
 * @returns Object with mimeType and buffer
 */
export function parseDataUrl(dataUrl: string): { mimeType: string; buffer: ArrayBuffer } {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)

  if (!matches) {
    throw new Error('Invalid data URL format')
  }

  const mimeType = matches[1]
  const base64 = matches[2]
  const buffer = base64ToArrayBuffer(base64)

  return { mimeType, buffer }
}

/**
 * Estimate the duration of an MP3 file based on file size.
 * This is a rough estimate and may not be accurate for all bitrates.
 *
 * @param byteLength - Size of the audio data in bytes
 * @param bitrate - Audio bitrate in kbps (default: 128)
 * @returns Estimated duration in seconds
 */
export function estimateMp3Duration(byteLength: number, bitrate: number = 128): number {
  // Duration = (file size in bits) / (bitrate in bits per second)
  // bitrate is in kbps, so multiply by 1000 to get bps
  const durationSeconds = (byteLength * 8) / (bitrate * 1000)
  return Math.round(durationSeconds * 10) / 10 // Round to 1 decimal place
}

/**
 * Format duration in seconds to a human-readable string.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string like "2:34" or "1:02:15"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Get the appropriate file extension for a MIME type.
 *
 * @param mimeType - The MIME type
 * @returns File extension (without dot)
 */
export function getExtensionForMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
  }

  return mimeToExt[mimeType] || 'mp3'
}

/**
 * Get the appropriate MIME type for a file extension.
 *
 * @param extension - The file extension (with or without dot)
 * @returns MIME type string
 */
export function getMimeTypeForExtension(extension: string): string {
  const ext = extension.replace(/^\./, '').toLowerCase()

  const extToMime: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'flac': 'audio/flac',
    'ogg': 'audio/ogg',
    'opus': 'audio/opus',
    'webm': 'audio/webm',
    'aac': 'audio/aac',
  }

  return extToMime[ext] || 'audio/mpeg'
}
