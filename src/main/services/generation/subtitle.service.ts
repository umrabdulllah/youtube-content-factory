import path from 'node:path'
import fs from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { SUBTITLES_DIR } from '@shared/constants'

const execAsync = promisify(exec)

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
// OPENAI WHISPER SUBTITLE SERVICE
// ============================================

interface OpenAIWord {
  word: string
  start: number
  end: number
}

interface OpenAISegment {
  id: number
  start: number
  end: number
  text: string
}

interface OpenAITranscriptionResponse {
  language: string
  duration: number
  text: string
  words: OpenAIWord[]
  segments: OpenAISegment[]
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatOpenAISrtTime(seconds: number): string {
  if (!seconds || seconds < 0) seconds = 0

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const millis = Math.round((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`
}

/**
 * Normalize word for matching (remove punctuation, lowercase)
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\w]/g, '')
}

/**
 * Generate SRT from OpenAI transcription with word-level timestamps
 * Uses segment text for punctuation and word timestamps for timing
 */
function generateOpenAISRT(transcription: OpenAITranscriptionResponse, wordsPerLine: number = 5): string {
  const subtitles: string[] = []
  let subtitleIndex = 1
  const words = transcription.words
  const segments = transcription.segments

  if (!words || words.length === 0) {
    return ''
  }

  // Build array of punctuated words with timestamps
  // Strategy: Match segment words (with punctuation) to word timestamps
  const punctuatedWords: { word: string; start: number; end: number }[] = []
  let wordIndex = 0

  for (const segment of segments || []) {
    // Split segment text into words (keeping punctuation attached)
    const segmentWords = segment.text.trim().split(/\s+/).filter(w => w.length > 0)

    for (const segWord of segmentWords) {
      // Find matching word in timestamps array
      const normalizedSegWord = normalizeWord(segWord)

      // Look for matching word starting from current index
      let matched = false
      for (let i = wordIndex; i < Math.min(wordIndex + 5, words.length); i++) {
        const normalizedTimedWord = normalizeWord(words[i].word)
        if (normalizedTimedWord === normalizedSegWord) {
          punctuatedWords.push({
            word: segWord,
            start: words[i].start,
            end: words[i].end,
          })
          wordIndex = i + 1
          matched = true
          break
        }
      }

      // If no match found, use last known timestamp + estimate
      if (!matched && punctuatedWords.length > 0) {
        const lastWord = punctuatedWords[punctuatedWords.length - 1]
        punctuatedWords.push({
          word: segWord,
          start: lastWord.end,
          end: lastWord.end + 0.3, // Estimate 300ms per word
        })
      } else if (!matched && words[wordIndex]) {
        // Use next available timestamp
        punctuatedWords.push({
          word: segWord,
          start: words[wordIndex].start,
          end: words[wordIndex].end,
        })
        wordIndex++
      }
    }
  }

  // Fallback: if no segments, use words directly
  if (punctuatedWords.length === 0) {
    for (const w of words) {
      punctuatedWords.push({ word: w.word, start: w.start, end: w.end })
    }
  }

  // Group words into subtitle lines
  for (let i = 0; i < punctuatedWords.length; i += wordsPerLine) {
    const wordGroup = punctuatedWords.slice(i, i + wordsPerLine)
    if (wordGroup.length === 0) continue

    const startTime = wordGroup[0].start
    const endTime = wordGroup[wordGroup.length - 1].end
    const textLine = wordGroup.map(w => w.word).join(' ')

    subtitles.push(`${subtitleIndex}`)
    subtitles.push(`${formatOpenAISrtTime(startTime)} --> ${formatOpenAISrtTime(endTime)}`)
    subtitles.push(textLine)
    subtitles.push('')

    subtitleIndex++
  }

  return subtitles.join('\n')
}

// OpenAI Whisper Subtitle Service
export class OpenAIWhisperService implements SubtitleGenerationService {
  readonly name = 'subtitles' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'OpenAI API key is required for transcription' }
    }

    if (!this.apiKey.startsWith('sk-')) {
      return { valid: false, error: 'Invalid OpenAI API key format' }
    }

    return { valid: true }
  }

  /**
   * Transcribe a single audio file (must be under 25MB)
   */
  private async transcribeSingleFile(audioPath: string): Promise<OpenAITranscriptionResponse> {
    const audioBuffer = await fs.readFile(audioPath)
    const fileName = path.basename(audioPath)

    // Create form data for OpenAI API
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer]), fileName)
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'word')
    formData.append('timestamp_granularities[]', 'segment')

    console.log(`[OpenAI Whisper] Transcribing: ${audioPath}, size: ${audioBuffer.length} bytes`)

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `OpenAI transcription failed: ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorMessage
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage)
    }

    return response.json()
  }

  /**
   * Get audio duration using ffprobe
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    )
    return parseFloat(stdout.trim())
  }

  /**
   * Transcribe a large audio file by splitting into chunks
   */
  private async transcribeLargeFile(audioPath: string): Promise<OpenAITranscriptionResponse> {
    const chunkDir = path.join(path.dirname(audioPath), 'transcription_chunks')
    await fs.mkdir(chunkDir, { recursive: true })

    // Get total duration
    const totalDuration = await this.getAudioDuration(audioPath)
    const chunkDuration = 600 // 10 minutes per chunk

    console.log(`[OpenAI Whisper] Large file detected. Duration: ${totalDuration.toFixed(1)}s, splitting into ${Math.ceil(totalDuration / chunkDuration)} chunks`)

    const chunks: string[] = []

    // Split audio into chunks using ffmpeg
    for (let start = 0; start < totalDuration; start += chunkDuration) {
      const chunkPath = path.join(chunkDir, `chunk_${start}.mp3`)
      await execAsync(
        `ffmpeg -y -i "${audioPath}" -ss ${start} -t ${chunkDuration} -acodec libmp3lame -q:a 2 "${chunkPath}"`
      )
      chunks.push(chunkPath)
    }

    // Transcribe each chunk and merge results
    const allWords: OpenAIWord[] = []
    const allSegments: OpenAISegment[] = []
    let timeOffset = 0
    let segmentIdOffset = 0

    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = chunks[i]
      console.log(`[OpenAI Whisper] Transcribing chunk ${i + 1}/${chunks.length}`)

      const result = await this.transcribeSingleFile(chunkPath)

      // Add words with time offset
      for (const word of result.words || []) {
        allWords.push({
          word: word.word,
          start: word.start + timeOffset,
          end: word.end + timeOffset,
        })
      }

      // Add segments with time offset
      for (const segment of result.segments || []) {
        allSegments.push({
          id: segment.id + segmentIdOffset,
          start: segment.start + timeOffset,
          end: segment.end + timeOffset,
          text: segment.text,
        })
      }

      timeOffset = (i + 1) * chunkDuration
      segmentIdOffset += (result.segments || []).length
    }

    // Cleanup chunks
    await fs.rm(chunkDir, { recursive: true, force: true })

    return {
      language: 'en',
      duration: totalDuration,
      text: allSegments.map(s => s.text).join(' '),
      words: allWords,
      segments: allSegments,
    }
  }

  /**
   * Transcribe audio file with OpenAI Whisper
   * Handles large files by splitting into chunks
   */
  private async transcribeWithOpenAI(audioPath: string): Promise<OpenAITranscriptionResponse> {
    // Check file size - OpenAI limit is 25MB
    const stats = await fs.stat(audioPath)
    const MAX_SIZE = 24 * 1024 * 1024 // 24MB to be safe

    if (stats.size > MAX_SIZE) {
      return this.transcribeLargeFile(audioPath)
    }

    return this.transcribeSingleFile(audioPath)
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

    const stats = await fs.stat(audioPath)
    console.log(`[OpenAI Whisper] Audio file: ${audioPath}, size: ${stats.size} bytes`)

    onProgress({
      percentage: 10,
      message: 'Starting OpenAI Whisper transcription...',
      details: { audioSize: stats.size },
    })

    if (signal.aborted) throw new Error('Subtitle generation cancelled')

    // Transcribe with OpenAI
    const transcription = await this.transcribeWithOpenAI(audioPath)

    if (!transcription.words || transcription.words.length === 0) {
      throw new Error('No transcription data received from OpenAI')
    }

    console.log(`[OpenAI Whisper] Transcription complete: ${transcription.words.length} words, duration: ${transcription.duration}s`)

    onProgress({
      percentage: 80,
      message: 'Generating SRT file...',
      details: { wordCount: transcription.words.length },
    })

    if (signal.aborted) throw new Error('Subtitle generation cancelled')

    // Generate SRT from transcription
    const srtContent = generateOpenAISRT(transcription, 5)
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

  async estimateCost(input: SubtitleGenerationInput): Promise<{ amount: number; currency: string }> {
    // OpenAI Whisper costs approximately $0.006 per minute of audio
    // Estimate based on audio file size (rough estimate: 1MB = 1 minute for MP3)
    try {
      const stats = await fs.stat(input.audioPath)
      const estimatedMinutes = stats.size / (1024 * 1024)
      const costPerMinute = 0.006
      return {
        amount: Math.round(estimatedMinutes * costPerMinute * 1000) / 1000,
        currency: 'USD',
      }
    } catch {
      return { amount: 0.02, currency: 'USD' } // Default estimate
    }
  }
}

// Factory function
export function createSubtitleService(apiKey?: string): SubtitleGenerationService {
  if (apiKey && apiKey.startsWith('sk-')) {
    return new OpenAIWhisperService(apiKey)
  }
  return mockSubtitleService
}
