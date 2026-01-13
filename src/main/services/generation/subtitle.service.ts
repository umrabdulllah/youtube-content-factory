import path from 'node:path'
import fs from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { SUBTITLES_DIR } from '@shared/constants'

const execAsync = promisify(exec)

// Get actual audio duration using ffprobe
async function getAudioDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    )
    const duration = parseFloat(stdout.trim())
    return isNaN(duration) ? null : duration
  } catch {
    return null
  }
}
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
 * @param whisperOutput - The WhisperX transcription output
 * @param wordsPerLine - Number of words per subtitle line
 * @param scaleFactor - Factor to scale timestamps (actualDuration / whisperDuration)
 */
function generateWhisperSRT(whisperOutput: WhisperOutput, wordsPerLine: number = 5, scaleFactor: number = 1.0): string {
  const subtitles: string[] = []
  let subtitleIndex = 1

  // Collect all valid words
  const allWords: { word: string; start: number; end: number }[] = []

  for (const segment of whisperOutput.segments) {
    // Apply scale factor to segment boundaries
    const segStart = segment.start * scaleFactor
    const segEnd = segment.end * scaleFactor
    const wordsData = segment.words

    if (!wordsData || wordsData.length === 0) {
      // Fallback: use segment-level timing
      const text = segment.text?.trim()
      if (!text) continue

      const words = text.split(/\s+/)
      const segmentDuration = segEnd - segStart

      for (let i = 0; i < words.length; i++) {
        const word = words[i]
        if (!word) continue

        const wordStart = segStart + (i * segmentDuration) / words.length
        const wordEnd = segStart + ((i + 1) * segmentDuration) / words.length

        allWords.push({ word, start: wordStart, end: wordEnd })
      }
      continue
    }

    // Process word-level data - first collect all words (including those without timing)
    // Apply scale factor to word timestamps
    const segmentWords: Array<{ word: string; start?: number; end?: number }> = []

    for (const wordInfo of wordsData) {
      const word = wordInfo.word?.trim()
      if (!word) continue
      if (/^[.,!?;:"'()[\]{}]+$/.test(word)) continue

      segmentWords.push({
        word,
        start: wordInfo.start !== undefined ? wordInfo.start * scaleFactor : undefined,
        end: wordInfo.end !== undefined ? wordInfo.end * scaleFactor : undefined,
      })
    }

    // Interpolate missing timestamps by distributing time evenly among consecutive words
    // First pass: identify gaps and distribute time evenly
    let i = 0
    while (i < segmentWords.length) {
      const w = segmentWords[i]

      if (w.start !== undefined && w.end !== undefined) {
        // Word has complete timing, add it directly
        allWords.push({ word: w.word, start: w.start, end: w.end })
        i++
        continue
      }

      // Find the range of consecutive words without complete timing
      let gapStart = i
      let gapEnd = i

      // Count consecutive words without start timestamps
      while (gapEnd < segmentWords.length && segmentWords[gapEnd].start === undefined) {
        gapEnd++
      }

      // If we found words with missing timestamps
      if (gapEnd > gapStart) {
        // Find the time boundaries (using scaled segment boundaries)
        let prevEnd = segStart
        for (let j = gapStart - 1; j >= 0; j--) {
          if (segmentWords[j].end !== undefined) {
            prevEnd = segmentWords[j].end as number
            break
          }
        }

        let nextStart = segEnd
        for (let j = gapEnd; j < segmentWords.length; j++) {
          if (segmentWords[j].start !== undefined) {
            nextStart = segmentWords[j].start as number
            break
          }
        }

        // Distribute time evenly among all words in the gap
        const wordsInGap = gapEnd - gapStart
        const totalTime = nextStart - prevEnd
        const timePerWord = totalTime / wordsInGap

        for (let j = gapStart; j < gapEnd; j++) {
          const wordIndex = j - gapStart
          const wordStart = prevEnd + wordIndex * timePerWord
          // End time is simply the next slot, clamped to never exceed nextStart
          const wordEnd = Math.min(prevEnd + (wordIndex + 1) * timePerWord, nextStart)

          segmentWords[j].start = wordStart
          segmentWords[j].end = wordEnd

          allWords.push({
            word: segmentWords[j].word,
            start: wordStart,
            end: wordEnd,
          })
        }

        i = gapEnd
        continue
      }

      // Word has start but might be missing end
      const wordStart = w.start as number
      let wordEnd = w.end

      if (wordEnd === undefined || wordEnd <= wordStart) {
        // Find next word's start for end time (using scaled segment boundary)
        let nextWordStart = segEnd
        for (let j = i + 1; j < segmentWords.length; j++) {
          if (segmentWords[j].start !== undefined) {
            nextWordStart = segmentWords[j].start as number
            break
          }
        }
        wordEnd = Math.min(wordStart + 0.5, nextWordStart - 0.05)
        if (wordEnd <= wordStart) wordEnd = wordStart + 0.3
      }

      allWords.push({ word: w.word, start: wordStart, end: wordEnd })
      i++
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

        // Calculate scale factor to correct Whisper timing drift
        // Get actual audio duration and compare to Whisper's last timestamp
        const actualDuration = await getAudioDuration(audioPath)
        const whisperEndTime = whisperOutput.segments.length > 0
          ? whisperOutput.segments[whisperOutput.segments.length - 1].end
          : 0

        let scaleFactor = 1.0
        if (actualDuration && whisperEndTime > 0) {
          scaleFactor = actualDuration / whisperEndTime
          console.log(`[WhisperX] Timing correction: audio=${actualDuration.toFixed(2)}s, whisper=${whisperEndTime.toFixed(2)}s, scale=${scaleFactor.toFixed(3)}`)
        }

        const srtContent = generateWhisperSRT(whisperOutput, 5, scaleFactor)
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
