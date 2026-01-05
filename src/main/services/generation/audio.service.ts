import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { VOICEOVERS_DIR } from '@shared/constants'
import type {
  AudioGenerationService,
  AudioGenerationInput,
  AudioGenerationOutput,
  ProgressCallback,
} from './types'

const execAsync = promisify(exec)

// Estimate audio duration from word count (average ~150 words per minute)
function estimateDuration(script: string, speed: number = 1.0): number {
  const wordCount = script.split(/\s+/).filter(w => w.length > 0).length
  const baseMinutes = wordCount / 150
  const adjustedMinutes = baseMinutes / speed
  return Math.round(adjustedMinutes * 60) // Return seconds
}

// Get actual audio duration using ffprobe
async function getActualDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    )
    return Math.round(parseFloat(stdout.trim()))
  } catch {
    return 0
  }
}

// Check if macOS `say` command is available
async function isMacOSSayAvailable(): Promise<boolean> {
  try {
    await execAsync('which say')
    return true
  } catch {
    return false
  }
}

// Generate audio using macOS `say` command
async function generateWithMacOSSay(
  script: string,
  outputPath: string,
  voiceId?: string,
  speed?: number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<{ durationSeconds: number }> {
  // Create AIFF first (say command outputs AIFF), then convert to MP3
  const tempAiffPath = outputPath.replace(/\.mp3$/, '.aiff')

  // Build say command
  const voice = voiceId || 'Samantha' // Default macOS voice
  const rate = Math.round((speed || 1.0) * 175) // Default rate is ~175 wpm

  // Write script to temp file to avoid command line length limits
  const tempScriptPath = path.join(path.dirname(outputPath), '.temp_script.txt')
  await fs.writeFile(tempScriptPath, script, 'utf-8')

  try {
    onProgress?.({
      percentage: 10,
      message: 'Starting text-to-speech conversion...',
      details: { voice, rate },
    })

    // Generate AIFF using say command
    const sayCommand = `say -v "${voice}" -r ${rate} -o "${tempAiffPath}" -f "${tempScriptPath}"`

    await new Promise<void>((resolve, reject) => {
      const child = exec(sayCommand, (error) => {
        if (error) reject(error)
        else resolve()
      })

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          child.kill()
          reject(new Error('Audio generation cancelled'))
        })
      }
    })

    onProgress?.({
      percentage: 60,
      message: 'Converting to MP3 format...',
      details: { stage: 'conversion' },
    })

    // Check if ffmpeg is available for conversion
    try {
      await execAsync('which ffmpeg')

      // Convert AIFF to MP3 using ffmpeg
      const ffmpegCommand = `ffmpeg -y -i "${tempAiffPath}" -acodec libmp3lame -ab 192k "${outputPath}"`
      await execAsync(ffmpegCommand)

      // Clean up AIFF file
      await fs.unlink(tempAiffPath).catch(() => {})
    } catch {
      // ffmpeg not available, rename AIFF to output (user can convert manually)
      await fs.rename(tempAiffPath, outputPath.replace(/\.mp3$/, '.aiff'))
      // Update output path
      return {
        durationSeconds: estimateDuration(script, speed),
      }
    }

    // Get actual duration from the file
    let durationSeconds = estimateDuration(script, speed)
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
      )
      durationSeconds = Math.round(parseFloat(stdout.trim()))
    } catch {
      // Use estimated duration
    }

    onProgress?.({
      percentage: 100,
      message: 'Audio generation complete',
      details: { durationSeconds },
    })

    return { durationSeconds }
  } finally {
    // Clean up temp files
    await fs.unlink(tempScriptPath).catch(() => {})
    await fs.unlink(tempAiffPath).catch(() => {})
  }
}

// Generate silent audio file as fallback
async function generateSilentAudio(
  durationSeconds: number,
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.({
    percentage: 10,
    message: 'Generating placeholder audio...',
    details: { durationSeconds },
  })

  // Check if ffmpeg is available
  try {
    await execAsync('which ffmpeg')

    // Generate silent audio using ffmpeg
    const ffmpegCommand = `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${durationSeconds} -acodec libmp3lame -ab 128k "${outputPath}"`
    await execAsync(ffmpegCommand)

    onProgress?.({
      percentage: 100,
      message: 'Placeholder audio created',
      details: { durationSeconds },
    })
  } catch {
    // ffmpeg not available - create empty file with metadata
    const metadata = {
      type: 'placeholder_audio',
      durationSeconds,
      message: 'ffmpeg not available - placeholder file',
      createdAt: new Date().toISOString(),
    }

    // Write a JSON placeholder (not a real audio file)
    await fs.writeFile(
      outputPath.replace(/\.mp3$/, '.json'),
      JSON.stringify(metadata, null, 2)
    )

    onProgress?.({
      percentage: 100,
      message: 'Placeholder metadata created (ffmpeg not available)',
      details: { durationSeconds, placeholder: true },
    })
  }
}

// Mock Audio Generation Service
export class MockAudioService implements AudioGenerationService {
  readonly name = 'audio' as const

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    // Check if we have at least basic capability
    const hasSay = await isMacOSSayAvailable()
    if (!hasSay) {
      return {
        valid: true, // Still valid, will use fallback
        error: 'macOS say command not available - will generate placeholder audio',
      }
    }
    return { valid: true }
  }

  async generate(
    input: AudioGenerationInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<AudioGenerationOutput> {
    const { projectPath, script, settings } = input
    const voiceoversDir = path.join(projectPath, VOICEOVERS_DIR)

    // Ensure voiceovers directory exists
    await fs.mkdir(voiceoversDir, { recursive: true })

    const outputPath = path.join(voiceoversDir, 'voiceover.mp3')
    const speed = settings.voiceSpeed || 1.0

    onProgress({
      percentage: 0,
      message: 'Preparing audio generation...',
      details: { wordCount: script.split(/\s+/).length },
    })

    // Check for cancellation
    if (signal.aborted) {
      throw new Error('Audio generation cancelled')
    }

    // Try macOS say command first
    const hasSay = await isMacOSSayAvailable()

    let durationSeconds: number

    if (hasSay) {
      const result = await generateWithMacOSSay(
        script,
        outputPath,
        settings.voiceId,
        speed,
        onProgress,
        signal
      )
      durationSeconds = result.durationSeconds
    } else {
      // Fallback to silent audio
      durationSeconds = estimateDuration(script, speed)
      await generateSilentAudio(durationSeconds, outputPath, onProgress)
    }

    // Determine actual output format
    let actualPath = outputPath
    let format = 'mp3'

    // Check what file was actually created
    try {
      await fs.access(outputPath)
    } catch {
      // MP3 doesn't exist, check for AIFF or JSON
      const aiffPath = outputPath.replace(/\.mp3$/, '.aiff')
      const jsonPath = outputPath.replace(/\.mp3$/, '.json')

      try {
        await fs.access(aiffPath)
        actualPath = aiffPath
        format = 'aiff'
      } catch {
        try {
          await fs.access(jsonPath)
          actualPath = jsonPath
          format = 'json'
        } catch {
          throw new Error('Failed to generate audio file')
        }
      }
    }

    return {
      audioPath: actualPath,
      durationSeconds,
      format,
    }
  }

  async estimateCost(_input: AudioGenerationInput): Promise<{ amount: number; currency: string }> {
    // Mock: $0.00 for local TTS
    return { amount: 0, currency: 'USD' }
  }
}

// Export singleton instance
export const mockAudioService = new MockAudioService()

// ============================================
// RUSSIAN TTS SERVICE (voiceapi.csv666.ru)
// ============================================

const VOICE_API_BASE_URL = 'https://voiceapi.csv666.ru'
const MAX_TTS_RETRIES = 3
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 100
const MAX_CONCURRENT_CHUNKS = 10

type TaskStatus = 'waiting' | 'processing' | 'ending' | 'ending_processed' | 'error' | 'error_handled'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Text chunking for TTS (imported logic)
function chunkTextForTTS(text: string, maxSize: number = 9000): string[] {
  if (!text || text.trim().length === 0) return []

  const trimmedText = text.trim()
  if (trimmedText.length <= maxSize) return [trimmedText]

  const chunks: string[] = []
  let currentChunk = ''

  const sentences = trimmedText.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    const sentenceTrimmed = sentence.trim()
    if (!sentenceTrimmed) continue

    if (currentChunk.length + sentenceTrimmed.length + 1 > maxSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      if (sentenceTrimmed.length > maxSize) {
        // Split long sentence at word boundaries
        const words = sentenceTrimmed.split(' ')
        let partialChunk = ''
        for (const word of words) {
          if (partialChunk.length + word.length + 1 > maxSize) {
            chunks.push(partialChunk.trim())
            partialChunk = word
          } else {
            partialChunk += (partialChunk ? ' ' : '') + word
          }
        }
        currentChunk = partialChunk
      } else {
        currentChunk = sentenceTrimmed
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentenceTrimmed
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// Concurrency limiter
function createConcurrencyLimiter(limit: number) {
  let active = 0
  const queue: (() => void)[] = []

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= limit) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

// Create a TTS task
async function createTTSTask(
  apiKey: string,
  text: string,
  templateId?: string
): Promise<number> {
  const body: Record<string, unknown> = { text }
  if (templateId) {
    body.template_uuid = templateId
  }

  const response = await fetch(`${VOICE_API_BASE_URL}/tasks`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid Voice API key')
    if (response.status === 402) throw new Error('Insufficient Voice API balance')
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to create TTS task: ${response.status}`)
  }

  const data = await response.json()
  return data.task_id
}

// Check task status
async function checkTTSTaskStatus(apiKey: string, taskId: number): Promise<TaskStatus> {
  const response = await fetch(`${VOICE_API_BASE_URL}/tasks/${taskId}/status`, {
    headers: { 'X-API-Key': apiKey },
  })

  if (!response.ok) {
    if (response.status === 404) throw new Error('Task not found')
    throw new Error(`Failed to check task status: ${response.status}`)
  }

  const data = await response.json()
  return data.status
}

// Get task result (audio)
async function getTTSTaskResult(apiKey: string, taskId: number): Promise<ArrayBuffer> {
  const response = await fetch(`${VOICE_API_BASE_URL}/tasks/${taskId}/result`, {
    headers: { 'X-API-Key': apiKey },
  })

  if (!response.ok) {
    if (response.status === 202) throw new Error('Audio not ready yet')
    if (response.status === 404) throw new Error('Task not found or audio missing')
    throw new Error(`Failed to get task result: ${response.status}`)
  }

  return await response.arrayBuffer()
}

// Wait for task completion
async function waitForTTSTask(
  apiKey: string,
  taskId: number,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (signal?.aborted) throw new Error('Audio generation cancelled')

    const status = await checkTTSTaskStatus(apiKey, taskId)

    if (status === 'ending') {
      return await getTTSTaskResult(apiKey, taskId)
    }

    if (status === 'error' || status === 'error_handled') {
      throw new Error('TTS task failed')
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('TTS task timed out')
}

// Generate audio for a single chunk with retry
async function generateChunkAudio(
  apiKey: string,
  text: string,
  templateId: string | undefined,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_TTS_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1))

      const taskId = await createTTSTask(apiKey, text, templateId)
      return await waitForTTSTask(apiKey, taskId, signal)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry auth/billing errors
      if (
        lastError.message.includes('Invalid') ||
        lastError.message.includes('Insufficient') ||
        lastError.message.includes('cancelled')
      ) {
        throw lastError
      }
    }
  }

  throw lastError || new Error('Chunk generation failed')
}

// Properly concatenate MP3 files using ffmpeg to avoid corrupt headers
async function concatenateMP3Files(buffers: ArrayBuffer[], outputPath: string): Promise<void> {
  if (buffers.length === 0) {
    await fs.writeFile(outputPath, Buffer.alloc(0))
    return
  }

  if (buffers.length === 1) {
    await fs.writeFile(outputPath, Buffer.from(buffers[0]))
    return
  }

  // Write each chunk to a temp file
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-concat-'))
  const tempFiles: string[] = []

  try {
    // Write chunks to temp files
    for (let i = 0; i < buffers.length; i++) {
      const tempFile = path.join(tempDir, `chunk_${i}.mp3`)
      await fs.writeFile(tempFile, Buffer.from(buffers[i]))
      tempFiles.push(tempFile)
    }

    // Create concat list file for ffmpeg
    const listFile = path.join(tempDir, 'concat_list.txt')
    const listContent = tempFiles.map(f => `file '${f}'`).join('\n')
    await fs.writeFile(listFile, listContent)

    console.log(`[Audio Concat] Merging ${buffers.length} chunks using ffmpeg`)

    // Use ffmpeg concat demuxer to properly merge MP3 files
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`,
      { timeout: 120000 }
    )

    console.log(`[Audio Concat] Successfully merged to ${outputPath}`)
  } finally {
    // Cleanup temp files
    for (const file of tempFiles) {
      await fs.unlink(file).catch(() => {})
    }
    await fs.unlink(path.join(tempDir, 'concat_list.txt')).catch(() => {})
    await fs.rmdir(tempDir).catch(() => {})
  }
}

// Russian TTS Service
export class RussianTTSService implements AudioGenerationService {
  readonly name = 'audio' as const
  private apiKey: string
  private templateId?: string

  constructor(apiKey: string, templateId?: string) {
    this.apiKey = apiKey
    this.templateId = templateId
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'Voice API key is required' }
    }

    // Test the API by fetching balance
    try {
      const response = await fetch(`${VOICE_API_BASE_URL}/balance`, {
        headers: { 'X-API-Key': this.apiKey },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid Voice API key' }
        }
        return { valid: false, error: 'Failed to validate Voice API key' }
      }

      const data = await response.json()
      if (data.balance <= 0) {
        return { valid: false, error: 'Insufficient Voice API balance' }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to validate Voice API',
      }
    }
  }

  async generate(
    input: AudioGenerationInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<AudioGenerationOutput> {
    const { projectPath, script } = input
    const voiceoversDir = path.join(projectPath, VOICEOVERS_DIR)

    // Ensure directory exists
    await fs.mkdir(voiceoversDir, { recursive: true })

    const outputPath = path.join(voiceoversDir, 'voiceover.mp3')

    // Chunk the text
    const chunks = chunkTextForTTS(script)
    const totalChunks = chunks.length

    console.log(`[Russian TTS] Starting generation: ${totalChunks} chunks, ${script.length} chars`)

    onProgress({
      percentage: 0,
      message: `Starting audio generation (${totalChunks} chunks)`,
      details: { totalChunks, totalChars: script.length },
    })

    if (totalChunks === 0) {
      throw new Error('No text to generate audio from')
    }

    // Single chunk - simple path
    if (totalChunks === 1) {
      const audioBuffer = await generateChunkAudio(
        this.apiKey,
        chunks[0],
        this.templateId,
        signal
      )

      await fs.writeFile(outputPath, Buffer.from(audioBuffer))

      // Get actual duration from the file, fall back to estimate
      const durationSeconds = await getActualDuration(outputPath) || estimateDuration(script)

      onProgress({
        percentage: 100,
        message: 'Audio generation complete',
        details: { durationSeconds },
      })

      return {
        audioPath: outputPath,
        durationSeconds,
        format: 'mp3',
      }
    }

    // Multiple chunks - parallel processing
    const limiter = createConcurrencyLimiter(MAX_CONCURRENT_CHUNKS)
    let completed = 0

    const chunkPromises = chunks.map((chunk, index) =>
      limiter(async () => {
        if (signal.aborted) throw new Error('Audio generation cancelled')

        const buffer = await generateChunkAudio(
          this.apiKey,
          chunk,
          this.templateId,
          signal
        )

        completed++
        const percentage = Math.round((completed / totalChunks) * 90)

        onProgress({
          percentage,
          message: `Generated chunk ${completed} of ${totalChunks}`,
          details: { completed, total: totalChunks },
        })

        return { index, buffer }
      })
    )

    const results = await Promise.all(chunkPromises)

    // Sort by index and concatenate using ffmpeg
    results.sort((a, b) => a.index - b.index)
    const buffers = results.map(r => r.buffer)

    // Use ffmpeg to properly concatenate MP3 files (avoids corrupt headers)
    await concatenateMP3Files(buffers, outputPath)

    console.log(`[Russian TTS] Concatenated ${buffers.length} chunks via ffmpeg`)

    // Get actual duration from the concatenated file, fall back to estimate
    const durationSeconds = await getActualDuration(outputPath) || estimateDuration(script)

    onProgress({
      percentage: 100,
      message: 'Audio generation complete',
      details: { durationSeconds, chunks: totalChunks },
    })

    return {
      audioPath: outputPath,
      durationSeconds,
      format: 'mp3',
    }
  }

  async estimateCost(input: AudioGenerationInput): Promise<{ amount: number; currency: string }> {
    // Cost estimation based on character count
    // Typical rate is about $0.0001 per character
    const charCount = input.script.length
    const costPerChar = 0.0001
    return {
      amount: Math.round(charCount * costPerChar * 100) / 100,
      currency: 'USD',
    }
  }
}

// Factory function
export function createAudioService(apiKey?: string, templateId?: string): AudioGenerationService {
  if (apiKey) {
    return new RussianTTSService(apiKey, templateId)
  }
  return mockAudioService
}
