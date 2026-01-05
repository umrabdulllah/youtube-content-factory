import path from 'node:path'
import fs from 'node:fs/promises'
import { SUBTITLES_DIR } from '@shared/constants'
import type {
  SubtitleGenerationService,
  SubtitleGenerationInput,
  SubtitleGenerationOutput,
  ProgressCallback,
} from './types'

// SRT timestamp format helper
function formatSrtTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const millis = Math.round((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`
}

// Parse script into subtitle segments
function parseScriptForSubtitles(script: string): string[] {
  // Split by sentences first
  const sentences = script
    .replace(/\n+/g, ' ') // Normalize newlines to spaces
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  // If sentences are too long, split further
  const segments: string[] = []
  const maxCharsPerSegment = 80 // Standard subtitle length

  for (const sentence of sentences) {
    if (sentence.length <= maxCharsPerSegment) {
      segments.push(sentence)
    } else {
      // Split long sentences by commas, semicolons, or word boundaries
      const parts = sentence.split(/(?<=[,;:])\s+/)

      for (const part of parts) {
        if (part.length <= maxCharsPerSegment) {
          segments.push(part)
        } else {
          // Split by word boundaries
          const words = part.split(' ')
          let current = ''

          for (const word of words) {
            if ((current + ' ' + word).trim().length <= maxCharsPerSegment) {
              current = (current + ' ' + word).trim()
            } else {
              if (current) segments.push(current)
              current = word
            }
          }

          if (current) segments.push(current)
        }
      }
    }
  }

  return segments
}

// Calculate timing for each segment based on word count
function calculateTimings(
  segments: string[],
  totalDuration?: number,
  wordsPerMinute: number = 150
): { start: number; end: number }[] {
  // Calculate total words
  const totalWords = segments.reduce(
    (sum, seg) => sum + seg.split(/\s+/).filter(w => w.length > 0).length,
    0
  )

  // Calculate total duration if not provided
  const duration = totalDuration || (totalWords / wordsPerMinute) * 60

  // Calculate time per word
  const timePerWord = duration / totalWords

  const timings: { start: number; end: number }[] = []
  let currentTime = 0

  for (const segment of segments) {
    const wordCount = segment.split(/\s+/).filter(w => w.length > 0).length
    const segmentDuration = wordCount * timePerWord

    // Add small gap between segments
    const gap = 0.1

    timings.push({
      start: currentTime,
      end: currentTime + segmentDuration - gap,
    })

    currentTime += segmentDuration
  }

  return timings
}

// Generate SRT content
function generateSrtContent(
  segments: string[],
  timings: { start: number; end: number }[]
): string {
  const lines: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const { start, end } = timings[i]
    const segment = segments[i]

    lines.push(
      `${i + 1}`,
      `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`,
      segment,
      '' // Empty line separator
    )
  }

  return lines.join('\n')
}

// Mock Subtitle Generation Service
export class MockSubtitleService implements SubtitleGenerationService {
  readonly name = 'subtitles' as const

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    // Mock service always valid
    return { valid: true }
  }

  async generate(
    input: SubtitleGenerationInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<SubtitleGenerationOutput> {
    const { projectPath, script } = input
    const subtitlesDir = path.join(projectPath, SUBTITLES_DIR)

    // Ensure subtitles directory exists
    await fs.mkdir(subtitlesDir, { recursive: true })

    const outputPath = path.join(subtitlesDir, 'subtitles.srt')

    onProgress({
      percentage: 0,
      message: 'Parsing script for subtitles...',
      details: {},
    })

    // Check for cancellation
    if (signal.aborted) {
      throw new Error('Subtitle generation cancelled')
    }

    // Use script if provided, otherwise try to read from audio transcription
    // For mock, we always use the script
    const textToProcess = script || ''

    if (!textToProcess) {
      throw new Error('No script provided for subtitle generation')
    }

    // Parse script into segments
    const segments = parseScriptForSubtitles(textToProcess)

    onProgress({
      percentage: 30,
      message: `Parsed ${segments.length} subtitle segments`,
      details: { segmentCount: segments.length },
    })

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100))

    if (signal.aborted) {
      throw new Error('Subtitle generation cancelled')
    }

    // Calculate timings
    // Try to get actual audio duration if available
    let audioDuration: number | undefined
    try {
      const audioMetadataPath = path.join(projectPath, 'voiceovers', 'voiceover.json')
      const metadata = JSON.parse(await fs.readFile(audioMetadataPath, 'utf-8'))
      audioDuration = metadata.durationSeconds
    } catch {
      // No audio metadata available
    }

    const timings = calculateTimings(segments, audioDuration)

    onProgress({
      percentage: 60,
      message: 'Generating SRT file...',
      details: { totalDuration: timings[timings.length - 1]?.end || 0 },
    })

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100))

    if (signal.aborted) {
      throw new Error('Subtitle generation cancelled')
    }

    // Generate SRT content
    const srtContent = generateSrtContent(segments, timings)

    // Write SRT file
    await fs.writeFile(outputPath, srtContent, 'utf-8')

    onProgress({
      percentage: 100,
      message: 'Subtitles generated successfully',
      details: { lineCount: segments.length },
    })

    return {
      subtitlePath: outputPath,
      lineCount: segments.length,
      format: 'srt',
    }
  }

  async estimateCost(_input: SubtitleGenerationInput): Promise<{ amount: number; currency: string }> {
    // Mock: $0.00 for local subtitle generation
    return { amount: 0, currency: 'USD' }
  }
}

// Export singleton instance
export const mockSubtitleService = new MockSubtitleService()

// ============================================
// WHISPERX SUBTITLE SERVICE (Replicate)
// ============================================

const WHISPERX_MODEL_VERSION = '84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 100

interface WhisperWord {
  word: string
  start?: number
  end?: number
}

interface WhisperSegment {
  start: number
  end: number
  text: string
  words?: WhisperWord[]
}

interface WhisperOutput {
  segments: WhisperSegment[]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatWhisperSrtTime(seconds: number): string {
  if (!seconds || seconds < 0) seconds = 0

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const millis = Math.round((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`
}

/**
 * Generate SRT from WhisperX output with word-level timestamps
 */
function generateWhisperSRT(whisperOutput: WhisperOutput, wordsPerLine: number = 5): string {
  const subtitles: string[] = []
  let subtitleIndex = 1

  // Collect all valid words
  const allWords: { word: string; start: number; end: number }[] = []

  for (const segment of whisperOutput.segments) {
    const wordsData = segment.words

    if (!wordsData || wordsData.length === 0) {
      // Fallback: use segment-level timing
      const text = segment.text?.trim()
      if (!text) continue

      const words = text.split(/\s+/)
      const segmentDuration = segment.end - segment.start

      for (let i = 0; i < words.length; i++) {
        const word = words[i]
        if (!word) continue

        const wordStart = segment.start + (i * segmentDuration) / words.length
        const wordEnd = segment.start + ((i + 1) * segmentDuration) / words.length

        allWords.push({ word, start: wordStart, end: wordEnd })
      }
      continue
    }

    // Process word-level data
    for (const wordInfo of wordsData) {
      const word = wordInfo.word?.trim()
      const startTime = wordInfo.start

      if (!word) continue
      if (startTime === undefined || startTime === null || startTime < 0) continue
      if (/^[.,!?;:"'()[\]{}]+$/.test(word)) continue

      let endTime = wordInfo.end
      if (endTime === undefined || endTime === null || endTime <= startTime) {
        endTime = startTime + 0.3
      }

      allWords.push({ word, start: startTime, end: endTime })
    }
  }

  // Group words into subtitle lines
  for (let i = 0; i < allWords.length; i += wordsPerLine) {
    const wordGroup = allWords.slice(i, i + wordsPerLine)
    if (wordGroup.length === 0) continue

    const startTime = wordGroup[0].start
    const endTime = wordGroup[wordGroup.length - 1].end
    const textLine = wordGroup.map(w => w.word).join(' ')

    subtitles.push(`${subtitleIndex}`)
    subtitles.push(`${formatWhisperSrtTime(startTime)} --> ${formatWhisperSrtTime(endTime)}`)
    subtitles.push(textLine)
    subtitles.push('')

    subtitleIndex++
  }

  return subtitles.join('\n')
}

// Supported audio MIME types
const AUDIO_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
  '.aac': 'audio/aac',
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return AUDIO_MIME_TYPES[ext] || 'audio/mpeg'
}

// WhisperX Subtitle Service
export class WhisperXSubtitleService implements SubtitleGenerationService {
  readonly name = 'subtitles' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'Replicate API key is required' }
    }

    if (!this.apiKey.startsWith('r8_')) {
      return { valid: false, error: 'Invalid Replicate API key format' }
    }

    return { valid: true }
  }

  async generate(
    input: SubtitleGenerationInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<SubtitleGenerationOutput> {
    const { projectPath, audioPath } = input
    const subtitlesDir = path.join(projectPath, SUBTITLES_DIR)

    await fs.mkdir(subtitlesDir, { recursive: true })

    const outputPath = path.join(subtitlesDir, 'subtitles.srt')

    onProgress({
      percentage: 0,
      message: 'Preparing audio for transcription...',
      details: {},
    })

    if (signal.aborted) throw new Error('Subtitle generation cancelled')

    // Read and convert audio to base64 data URL
    const audioBuffer = await fs.readFile(audioPath)
    const audioBase64 = audioBuffer.toString('base64')
    const mimeType = getMimeType(audioPath)
    const audioDataUrl = `data:${mimeType};base64,${audioBase64}`

    console.log(`[WhisperX] Audio file: ${audioPath}, size: ${audioBuffer.length} bytes`)

    onProgress({
      percentage: 10,
      message: 'Starting transcription...',
      details: { audioSize: audioBuffer.length },
    })

    // Create prediction
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${this.apiKey}`,
      },
      body: JSON.stringify({
        version: WHISPERX_MODEL_VERSION,
        input: {
          audio_file: audioDataUrl,
          align_output: true,
          temperature: 0,
          batch_size: 64,
          language: input.settings.language || undefined,
        },
      }),
    })

    if (!createResponse.ok) {
      const contentType = createResponse.headers.get('content-type') || ''

      if (!contentType.includes('application/json')) {
        if (createResponse.status === 401 || createResponse.status === 403) {
          throw new Error('Invalid or expired Replicate API key')
        }
        throw new Error(`Replicate API error: ${createResponse.status}`)
      }

      const errorData = await createResponse.json()
      throw new Error(errorData.detail || 'Failed to start transcription')
    }

    const prediction = await createResponse.json()
    const predictionId = prediction.id

    console.log(`[WhisperX] Prediction created: ${predictionId}`)

    onProgress({
      percentage: 20,
      message: 'Transcription in progress...',
      details: { predictionId },
    })

    // Poll for completion
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (signal.aborted) throw new Error('Subtitle generation cancelled')

      await sleep(POLL_INTERVAL_MS)

      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      })

      if (!statusResponse.ok) {
        throw new Error(`Failed to check prediction status: ${statusResponse.status}`)
      }

      const status = await statusResponse.json()

      if (status.status === 'succeeded') {
        const whisperOutput = status.output as WhisperOutput

        if (!whisperOutput || !whisperOutput.segments) {
          throw new Error('No transcription data received')
        }

        onProgress({
          percentage: 80,
          message: 'Generating SRT file...',
          details: { segments: whisperOutput.segments.length },
        })

        const srtContent = generateWhisperSRT(whisperOutput, 5)
        await fs.writeFile(outputPath, srtContent, 'utf-8')

        const lineCount = srtContent.split('\n\n').filter(block => block.trim()).length

        onProgress({
          percentage: 100,
          message: 'Subtitles generated successfully',
          details: { lineCount },
        })

        return {
          subtitlePath: outputPath,
          lineCount,
          format: 'srt',
        }
      }

      if (status.status === 'failed' || status.status === 'canceled') {
        throw new Error(status.error || 'Transcription failed')
      }

      // Update progress
      const progress = 20 + Math.min(attempt * 2, 60)
      onProgress({
        percentage: progress,
        message: `Transcription in progress... (${status.status})`,
        details: { status: status.status },
      })
    }

    throw new Error('Transcription timed out')
  }

  async estimateCost(input: SubtitleGenerationInput): Promise<{ amount: number; currency: string }> {
    // WhisperX costs approximately $0.01 per minute of audio
    // Estimate based on audio file size (rough estimate: 1MB = 1 minute for MP3)
    try {
      const stats = await fs.stat(input.audioPath)
      const estimatedMinutes = stats.size / (1024 * 1024)
      const costPerMinute = 0.01
      return {
        amount: Math.round(estimatedMinutes * costPerMinute * 100) / 100,
        currency: 'USD',
      }
    } catch {
      return { amount: 0.05, currency: 'USD' } // Default estimate
    }
  }
}

// Factory function
export function createSubtitleService(apiKey?: string): SubtitleGenerationService {
  if (apiKey && apiKey.startsWith('r8_')) {
    return new WhisperXSubtitleService(apiKey)
  }
  return mockSubtitleService
}
