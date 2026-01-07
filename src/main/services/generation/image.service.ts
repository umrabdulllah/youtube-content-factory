import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs/promises'
import Replicate from 'replicate'
import { IMAGES_DIR } from '@shared/constants'
import type {
  ImageGenerationService,
  ImageGenerationInput,
  ImageGenerationOutput,
  ProgressCallback,
} from './types'

// ============================================
// CONFIGURATION
// ============================================

const REPLICATE_MODEL = 'umrabdulllah/flux-history:bcd6783b08eea26142c7679b025735947bc83b2c13ce01832b8f61432f6bfa24'
const DEFAULT_ASPECT_RATIO = '16:9'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

// Helper to parse script into segments
function parseScriptIntoSegments(script: string): string[] {
  // Split by double newlines (paragraphs) first
  const paragraphs = script
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  // If we have paragraphs, use them
  if (paragraphs.length >= 3) {
    return paragraphs
  }

  // Otherwise, split by sentences
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10) // Filter out very short sentences

  // Group sentences into chunks of ~2-3 for reasonable image count
  const segments: string[] = []
  let currentSegment = ''

  for (const sentence of sentences) {
    if (currentSegment.length + sentence.length < 200) {
      currentSegment += (currentSegment ? ' ' : '') + sentence
    } else {
      if (currentSegment) segments.push(currentSegment)
      currentSegment = sentence
    }
  }

  if (currentSegment) segments.push(currentSegment)

  return segments.length > 0 ? segments : [script.substring(0, 500)]
}

// Generate a gradient color based on index
function getGradientColors(index: number): { start: string; end: string } {
  const gradients = [
    { start: '#667eea', end: '#764ba2' }, // Purple
    { start: '#f093fb', end: '#f5576c' }, // Pink
    { start: '#4facfe', end: '#00f2fe' }, // Blue
    { start: '#43e97b', end: '#38f9d7' }, // Green
    { start: '#fa709a', end: '#fee140' }, // Orange-pink
    { start: '#a8edea', end: '#fed6e3' }, // Pastel
    { start: '#ff9a9e', end: '#fecfef' }, // Soft pink
    { start: '#ffecd2', end: '#fcb69f' }, // Peach
  ]

  return gradients[index % gradients.length]
}

// Truncate text to fit in image
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

// Create a placeholder image with gradient and text
async function createPlaceholderImage(
  outputPath: string,
  text: string,
  index: number,
  total: number,
  style?: string
): Promise<void> {
  const width = 1920
  const height = 1080
  const { start, end } = getGradientColors(index)

  // Truncate and prepare text for SVG
  const displayText = truncateText(text, 200)
  const lines = wrapText(displayText, 60) // 60 chars per line
  const textLines = lines.slice(0, 5) // Max 5 lines

  // Create SVG with gradient background and text
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${start};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${end};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)"/>
      <rect x="100" y="100" width="${width - 200}" height="${height - 200}"
            rx="20" fill="rgba(0,0,0,0.3)"/>
      <text x="${width / 2}" y="180"
            font-family="Arial, sans-serif" font-size="36"
            fill="rgba(255,255,255,0.7)" text-anchor="middle">
        Image ${index + 1} of ${total} ${style ? `| Style: ${style}` : ''}
      </text>
      ${textLines
        .map(
          (line, i) => `
        <text x="${width / 2}" y="${400 + i * 60}"
              font-family="Arial, sans-serif" font-size="32"
              fill="white" text-anchor="middle">
          ${escapeXml(line)}
        </text>
      `
        )
        .join('')}
      <text x="${width / 2}" y="${height - 100}"
            font-family="Arial, sans-serif" font-size="24"
            fill="rgba(255,255,255,0.5)" text-anchor="middle">
        YouTube Content Factory - Placeholder Image
      </text>
    </svg>
  `

  // Use sharp to convert SVG to PNG
  await sharp(Buffer.from(svg)).png().toFile(outputPath)
}

// Wrap text into lines
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim()
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

// Escape XML special characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Mock Image Generation Service
export class MockImageService implements ImageGenerationService {
  readonly name = 'images' as const

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    // Mock service always valid
    return { valid: true }
  }

  async generate(
    input: ImageGenerationInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<ImageGenerationOutput> {
    const { projectPath, script, settings } = input
    const imagesDir = path.join(projectPath, IMAGES_DIR)

    // Ensure images directory exists
    await fs.mkdir(imagesDir, { recursive: true })

    // Parse script into segments
    const segments = parseScriptIntoSegments(script || '')
    const total = segments.length
    const images: string[] = []
    const prompts: string[] = []

    onProgress({
      percentage: 0,
      message: `Starting image generation (${total} images)`,
      details: { total, completed: 0 },
    })

    for (let i = 0; i < segments.length; i++) {
      // Check for cancellation
      if (signal.aborted) {
        throw new Error('Image generation cancelled')
      }

      const segment = segments[i]
      const filename = `${i + 1}.png`
      const outputPath = path.join(imagesDir, filename)

      // Generate prompt (for logging/debugging)
      const prompt = settings.customPromptPrefix
        ? `${settings.customPromptPrefix} ${segment} ${settings.customPromptSuffix || ''}`
        : segment
      prompts.push(prompt)

      // Create placeholder image
      await createPlaceholderImage(outputPath, segment, i, total, settings.style)

      images.push(outputPath)

      // Simulate some processing time (50-150ms per image)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))

      // Report progress
      const percentage = Math.round(((i + 1) / total) * 100)
      onProgress({
        percentage,
        message: `Generated image ${i + 1} of ${total}`,
        details: { total, completed: i + 1, currentFile: filename },
      })
    }

    return {
      images,
      count: images.length,
      prompts,
    }
  }

  async estimateCost(_input: ImageGenerationInput): Promise<{ amount: number; currency: string }> {
    // Mock: $0.00 for placeholder images
    return { amount: 0, currency: 'USD' }
  }
}

// Export singleton instance
export const mockImageService = new MockImageService()

// ============================================
// REPLICATE IMAGE SERVICE
// ============================================

interface ReplicateImageInput {
  prompt: string
  model?: 'dev' | 'schnell'
  go_fast?: boolean
  lora_scale?: number
  megapixels?: '1' | '0.25'
  num_outputs?: number
  aspect_ratio?: string
  output_format?: 'webp' | 'jpg' | 'png'
  guidance_scale?: number
  output_quality?: number
  prompt_strength?: number
  extra_lora_scale?: number
  num_inference_steps?: number
  seed?: number
  disable_safety_checker?: boolean
}

interface GenerateImageOptions {
  prompt: string
  index: number
  outputPath: string
  replicate: Replicate
  signal: AbortSignal
  aspectRatio?: string
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  await fs.writeFile(outputPath, Buffer.from(buffer))
}

async function generateSingleImage(
  options: GenerateImageOptions
): Promise<{ success: boolean; error?: string }> {
  const { prompt, outputPath, replicate, signal, aspectRatio = DEFAULT_ASPECT_RATIO } = options

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) {
      return { success: false, error: 'Cancelled' }
    }

    try {
      const input: ReplicateImageInput = {
        prompt: `opaint, ${prompt}`,
        model: 'dev',
        go_fast: false,
        lora_scale: 1,
        megapixels: '1',
        aspect_ratio: aspectRatio,
        num_outputs: 1,
        output_format: 'webp',
        guidance_scale: 3,
        output_quality: 90,
        prompt_strength: 0.8,
        extra_lora_scale: 1,
        num_inference_steps: 28,
        disable_safety_checker: true,
      }

      const output = await replicate.run(REPLICATE_MODEL, { input }) as Array<{ url: () => string } | string>

      if (!output || output.length === 0) {
        throw new Error('No output from Replicate')
      }

      // Get the URL from the output
      const firstOutput = output[0]
      const imageUrl = typeof firstOutput === 'string'
        ? firstOutput
        : typeof firstOutput === 'object' && 'url' in firstOutput
          ? (firstOutput as { url: () => string }).url()
          : null

      if (!imageUrl) {
        throw new Error('Could not extract image URL from output')
      }

      // Download and save the image
      await downloadImage(imageUrl, outputPath)

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[Image Gen] Attempt ${attempt}/${MAX_RETRIES} failed:`, error)

      // Detect credit-related rate limit (stop immediately, don't retry)
      if (errorMessage.includes('less than $5') ||
          (errorMessage.includes('429') && errorMessage.includes('credit'))) {
        console.error('[Image Gen] CRITICAL: Replicate account has insufficient credit')
        throw new Error('CREDIT_ERROR: Replicate account has less than $5 credit. Please add funds to continue.')
      }

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt)
      } else {
        return {
          success: false,
          error: errorMessage,
        }
      }
    }
  }

  return { success: false, error: 'Max retries exceeded' }
}

// Real Replicate Image Generation Service
export class ReplicateImageService implements ImageGenerationService {
  readonly name = 'images' as const
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

    // Test the API key with a simple request
    try {
      const replicate = new Replicate({ auth: this.apiKey })
      // Just check if we can access the API
      await replicate.models.get('stability-ai', 'sdxl')
      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to validate API key',
      }
    }
  }

  async generate(
    input: ImageGenerationInput,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<ImageGenerationOutput> {
    const { projectPath, prompts: inputPrompts, settings } = input
    const imagesDir = path.join(projectPath, IMAGES_DIR)

    // Ensure images directory exists
    await fs.mkdir(imagesDir, { recursive: true })

    // Use provided prompts or parse script
    const prompts = inputPrompts && inputPrompts.length > 0
      ? inputPrompts
      : input.script
        ? parseScriptIntoSegments(input.script).map(segment =>
            settings.customPromptPrefix
              ? `${settings.customPromptPrefix} ${segment} ${settings.customPromptSuffix || ''}`
              : segment
          )
        : []

    if (prompts.length === 0) {
      throw new Error('No prompts provided for image generation')
    }

    const total = prompts.length
    const images: string[] = []
    const failedIndices: number[] = []

    const replicate = new Replicate({ auth: this.apiKey })

    // Get concurrency from settings or default
    const maxConcurrent = settings.maxConcurrentImages || 8

    onProgress({
      percentage: 0,
      message: `Starting image generation (${total} images, ${maxConcurrent} parallel)`,
      details: { total, completed: 0, failed: 0, activeWorkers: 0, maxWorkers: maxConcurrent },
    })

    // Process images with concurrency limit
    let completed = 0
    let failed = 0

    // Create a semaphore for concurrency control
    const processing: Promise<void>[] = []
    const results: Array<{ index: number; success: boolean; path?: string }> = []

    for (let i = 0; i < prompts.length; i++) {
      if (signal.aborted) {
        break
      }

      // Wait if we've hit the concurrency limit
      if (processing.length >= maxConcurrent) {
        await Promise.race(processing)
      }

      const prompt = prompts[i]
      const filename = `${i + 1}.webp`
      const outputPath = path.join(imagesDir, filename)

      const task = (async () => {
        try {
          const result = await generateSingleImage({
            prompt,
            index: i,
            outputPath,
            replicate,
            signal,
            aspectRatio: DEFAULT_ASPECT_RATIO,
          })

          if (result.success) {
            results.push({ index: i, success: true, path: outputPath })
            completed++
          } else {
            results.push({ index: i, success: false })
            failed++
            failedIndices.push(i)
            console.error(`[Image Gen] Image ${i + 1} failed: ${result.error}`)
          }

          // Report progress
          const percentage = Math.round(((completed + failed) / total) * 100)
          onProgress({
            percentage,
            message: `Generated ${completed} of ${total} images${failed > 0 ? ` (${failed} failed)` : ''}`,
            details: { total, completed, failed, currentFile: filename, activeWorkers: processing.length, maxWorkers: maxConcurrent },
          })
        } catch (error) {
          // Re-throw credit errors to stop the entire process
          if (error instanceof Error && error.message.startsWith('CREDIT_ERROR:')) {
            throw error
          }
          // Handle other unexpected errors
          results.push({ index: i, success: false })
          failed++
          failedIndices.push(i)
          console.error(`[Image Gen] Image ${i + 1} failed unexpectedly:`, error)
        }
      })()

      processing.push(task)
      task.finally(() => {
        const idx = processing.indexOf(task)
        if (idx > -1) processing.splice(idx, 1)
      })
    }

    // Wait for remaining tasks
    await Promise.all(processing)

    // Sort results by index and extract successful paths
    results.sort((a, b) => a.index - b.index)
    for (const result of results) {
      if (result.success && result.path) {
        images.push(result.path)
      }
    }

    if (images.length === 0) {
      throw new Error('All image generation attempts failed')
    }

    return {
      images,
      count: images.length,
      prompts,
      failedIndices: failedIndices.length > 0 ? failedIndices : undefined,
    }
  }

  async estimateCost(input: ImageGenerationInput): Promise<{ amount: number; currency: string }> {
    const prompts = input.prompts || parseScriptIntoSegments(input.script || '')
    // Flux dev model costs approximately $0.0055 per image
    const costPerImage = 0.0055
    return {
      amount: Math.round(prompts.length * costPerImage * 100) / 100,
      currency: 'USD',
    }
  }
}

// Factory function to create the appropriate service
export function createImageService(apiKey?: string): ImageGenerationService {
  if (apiKey && apiKey.startsWith('r8_')) {
    return new ReplicateImageService(apiKey)
  }
  return mockImageService
}
