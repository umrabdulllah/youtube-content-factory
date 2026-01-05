/**
 * Text Chunker Utility
 *
 * Splits text into smaller chunks for TTS processing while maintaining
 * sentence boundaries and proper formatting.
 */

const MAX_CHUNK_SIZE = 9000 // Max characters per chunk for TTS API
const MIN_CHUNK_SIZE = 100  // Minimum chunk size to avoid tiny fragments

/**
 * Split text into chunks suitable for TTS processing.
 * Maintains sentence boundaries to ensure natural speech.
 *
 * @param text - The full text to chunk
 * @param maxSize - Maximum chunk size in characters (default: 9000)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxSize: number = MAX_CHUNK_SIZE): string[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  const trimmedText = text.trim()

  // If text is small enough, return as single chunk
  if (trimmedText.length <= maxSize) {
    return [trimmedText]
  }

  const chunks: string[] = []
  let currentChunk = ''

  // Split into sentences using common sentence terminators
  // This regex matches sentence endings followed by space or end of string
  const sentences = trimmedText.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    const sentenceTrimmed = sentence.trim()

    if (!sentenceTrimmed) {
      continue
    }

    // If adding this sentence would exceed max size
    if (currentChunk.length + sentenceTrimmed.length + 1 > maxSize) {
      // If current chunk has content, push it
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // If a single sentence is longer than max size, split it
      if (sentenceTrimmed.length > maxSize) {
        const sentenceChunks = splitLongSentence(sentenceTrimmed, maxSize)
        chunks.push(...sentenceChunks.slice(0, -1))
        currentChunk = sentenceChunks[sentenceChunks.length - 1]
      } else {
        currentChunk = sentenceTrimmed
      }
    } else {
      // Add sentence to current chunk
      if (currentChunk.length > 0) {
        currentChunk += ' ' + sentenceTrimmed
      } else {
        currentChunk = sentenceTrimmed
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim())
  }

  // Merge any tiny chunks with adjacent ones
  return mergeSmallChunks(chunks, maxSize)
}

/**
 * Split a single long sentence into smaller chunks.
 * Tries to break at punctuation marks (comma, semicolon, colon) or word boundaries.
 */
function splitLongSentence(sentence: string, maxSize: number): string[] {
  const chunks: string[] = []
  let remaining = sentence

  while (remaining.length > maxSize) {
    // Try to find a good breaking point
    let breakPoint = findBreakPoint(remaining, maxSize)

    if (breakPoint <= 0) {
      // No good break point found, just cut at max size
      breakPoint = maxSize
    }

    chunks.push(remaining.substring(0, breakPoint).trim())
    remaining = remaining.substring(breakPoint).trim()
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}

/**
 * Find a good break point in text, preferring punctuation then word boundaries.
 */
function findBreakPoint(text: string, maxPos: number): number {
  // Search area is the last 20% of the allowed range
  const searchStart = Math.floor(maxPos * 0.8)

  // First, try to find punctuation break points (comma, semicolon, colon)
  const punctuationBreaks = [',', ';', ':', '—', '-']
  for (const punct of punctuationBreaks) {
    for (let i = maxPos - 1; i >= searchStart; i--) {
      if (text[i] === punct && i < text.length - 1 && text[i + 1] === ' ') {
        return i + 1 // Break after the punctuation
      }
    }
  }

  // Next, try to find a word boundary (space)
  for (let i = maxPos - 1; i >= searchStart; i--) {
    if (text[i] === ' ') {
      return i
    }
  }

  // No good break point found
  return -1
}

/**
 * Merge small chunks with adjacent ones to avoid tiny fragments.
 */
function mergeSmallChunks(chunks: string[], maxSize: number): string[] {
  if (chunks.length <= 1) {
    return chunks
  }

  const merged: string[] = []
  let i = 0

  while (i < chunks.length) {
    let current = chunks[i]

    // Try to merge with next chunk if current is too small
    while (
      i < chunks.length - 1 &&
      current.length < MIN_CHUNK_SIZE &&
      current.length + chunks[i + 1].length + 1 <= maxSize
    ) {
      i++
      current += ' ' + chunks[i]
    }

    merged.push(current)
    i++
  }

  return merged
}

/**
 * Estimate the number of chunks for a given text.
 * Useful for progress calculation before actual chunking.
 */
export function estimateChunkCount(text: string, maxSize: number = MAX_CHUNK_SIZE): number {
  if (!text || text.trim().length === 0) {
    return 0
  }

  const length = text.trim().length

  if (length <= maxSize) {
    return 1
  }

  // Rough estimate - actual count may differ due to sentence boundaries
  return Math.ceil(length / (maxSize * 0.9))
}

/**
 * Get statistics about the text chunking.
 */
export function getChunkStats(text: string, maxSize: number = MAX_CHUNK_SIZE): {
  totalLength: number
  estimatedChunks: number
  averageChunkSize: number
} {
  const trimmedText = text?.trim() || ''
  const totalLength = trimmedText.length
  const estimatedChunks = estimateChunkCount(trimmedText, maxSize)

  return {
    totalLength,
    estimatedChunks,
    averageChunkSize: estimatedChunks > 0 ? Math.round(totalLength / estimatedChunks) : 0,
  }
}
