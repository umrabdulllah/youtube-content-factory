/**
 * Prompt Generation Service
 *
 * Generates oil painting prompts from scripts using Claude or GPT.
 * Uses parallel workers with batch processing and novelty tracking.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { PromptModel } from '../../../shared/types'

// ============================================
// CONFIGURATION
// ============================================

const PROMPTS_PER_BATCH = 10
const MAX_WORKERS = 4
const STAGGER_DELAY_MS = 3000
const TRIGGER_WORD = 'opaint'

// ============================================
// TYPES
// ============================================

export interface PromptGenerationInput {
  script: string
  apiKey: string
  model: PromptModel
  onBatchComplete?: (batch: PromptBatch) => void
  onProgress?: (progress: PromptProgress) => void
}

export interface PromptGenerationOutput {
  prompts: string[]
  context: ScriptContext
  totalGenerated: number
}

export interface PromptBatch {
  batchIndex: number
  prompts: string[]
  globalOffset: number
}

export interface PromptProgress {
  phase: 'context' | 'generating' | 'complete'
  currentBatch: number
  totalBatches: number
  promptsGenerated: number
  totalPrompts: number
  activeWorkers?: number
  maxWorkers?: number
}

interface ScriptContext {
  era: string
  timePeriod: string
  geographicSetting: string
  architectureStyle: string
  costumeDetails: string
  keyFigures: string[]
  colorPalette: string
  visualThemes: string
  contextSummary: string
}

interface BatchTask {
  batchIndex: number
  chunk: string
  promptCount: number
  globalPromptOffset: number
}

interface BatchResult {
  batchIndex: number
  prompts: string[]
  success: boolean
  error?: string
}

// ============================================
// BANNED WORDS (anti-digital)
// ============================================

const BANNED_WORDS = [
  'glowing', 'glow', 'luminous', 'luminescent', 'radiant', 'ethereal',
  'magical', 'magic', 'mystical', 'enchanted', 'supernatural',
  'neon', 'fluorescent', 'iridescent', 'holographic',
  'laser', 'electric blue', 'plasma',
  'fantasy', 'mythical', 'otherworldly',
  'hyper-realistic', 'photorealistic', '3d render', 'cgi', 'render',
  'sleek', 'minimalist', 'clean lines',
  'perfect lighting', 'flawless', 'pristine',
  'stock photo', 'corporate', 'concept art', 'digital art',
  'sharp details', 'high definition', 'ultra detailed',
]

// ============================================
// UTILITY FUNCTIONS
// ============================================

function isAnthropicKey(apiKey: string): boolean {
  return apiKey.startsWith('sk-ant-')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================
// NOVELTY TRACKING
// ============================================

class NoveltyTracker {
  private committedPrompts: string[] = []

  getConstraints(): string {
    return buildNoveltyConstraints(this.committedPrompts)
  }

  commitBatch(prompts: string[]): void {
    this.committedPrompts.push(...prompts)
  }
}

function extractPromptElements(prompt: string): { subjects: string[]; settings: string[]; framings: string[] } {
  const promptLower = prompt.toLowerCase()

  const framingPatterns = [
    'macro', 'close-up', 'extreme close-up', 'medium shot', 'wide shot',
    'establishing shot', 'bird\'s eye', 'overhead', 'worm\'s eye',
    'looking up', 'looking down', 'dutch angle', 'through'
  ]
  const framings = framingPatterns.filter(f => promptLower.includes(f))

  const settingPatterns = [
    'desk', 'office', 'street', 'crowd', 'lab', 'laboratory', 'courtroom',
    'bedroom', 'battlefield', 'factory', 'classroom', 'market', 'port',
    'palace', 'bank', 'vault', 'church', 'temple', 'hospital', 'prison',
    'garden', 'forest', 'mountain', 'river', 'ocean', 'city', 'village',
    'farm', 'mine', 'warehouse', 'library', 'museum', 'theater', 'arena'
  ]
  const settings = settingPatterns.filter(s => promptLower.includes(s))

  const subjectPatterns = [
    'hands', 'figure', 'silhouette', 'person', 'crowd', 'face', 'portrait',
    'map', 'document', 'letter', 'book', 'newspaper', 'chart', 'graph',
    'coin', 'money', 'gold', 'treasure', 'weapon', 'tool', 'machine',
    'building', 'tower', 'bridge', 'ship', 'train', 'vehicle', 'animal',
    'landscape', 'skyline', 'horizon', 'storm', 'fire', 'water', 'ruins'
  ]
  const subjects = subjectPatterns.filter(s => promptLower.includes(s))

  return { subjects, settings, framings }
}

function buildNoveltyConstraints(previousPrompts: string[]): string {
  if (previousPrompts.length === 0) return ''

  const allElements = { subjects: [] as string[], settings: [] as string[], framings: [] as string[] }

  const recentPrompts = previousPrompts.slice(-25)
  for (const prompt of recentPrompts) {
    const elements = extractPromptElements(prompt)
    allElements.subjects.push(...elements.subjects)
    allElements.settings.push(...elements.settings)
    allElements.framings.push(...elements.framings)
  }

  const uniqueSubjects = [...new Set(allElements.subjects)].slice(0, 10)
  const uniqueSettings = [...new Set(allElements.settings)].slice(0, 10)
  const uniqueFramings = [...new Set(allElements.framings)].slice(0, 6)

  if (uniqueSubjects.length === 0 && uniqueSettings.length === 0 && uniqueFramings.length === 0) {
    return ''
  }

  let constraints = '\n## PREFER AVOIDING (from earlier prompts):\n'
  if (uniqueSubjects.length > 0) {
    constraints += `- Primary subjects already used: ${uniqueSubjects.join(', ')} — try to use different ones\n`
  }
  if (uniqueSettings.length > 0) {
    constraints += `- Settings already used: ${uniqueSettings.join(', ')} — try to use different ones\n`
  }
  if (uniqueFramings.length > 0) {
    constraints += `- Framings already used: ${uniqueFramings.join(', ')} — try to use different ones\n`
  }
  constraints += 'Prioritize variety, but you may reuse if the chunk strongly calls for it.\n'

  return constraints
}

// ============================================
// CONTEXT EXTRACTION
// ============================================

const CONTEXT_EXTRACTION_PROMPT = `You are analyzing a script to extract visual context for generating topic-accurate documentary-style oil painting imagery.

Analyze the script and extract the following information. Be specific and concise.

Return ONLY a JSON object with these fields:
{
  "era": "The historical era (e.g., 'Roman Empire 27 BC - 476 AD', 'Victorian England 1837-1901', 'Modern 21st century')",
  "timePeriod": "Specific decade or century (e.g., '1770s', 'Late 18th century', '2020s')",
  "geographicSetting": "Primary locations (e.g., 'Rome and Mediterranean', 'Edinburgh and London')",
  "architectureStyle": "Architecture to depict (e.g., 'Roman columns marble temples', 'modern skyscrapers')",
  "costumeDetails": "Period-accurate clothing (e.g., 'togas laurel wreaths', 'business suits ties')",
  "keyFigures": ["List of named historical figures mentioned, if any"],
  "colorPalette": "Era-appropriate colors (e.g., 'terracotta ochre marble white bronze')",
  "visualThemes": "Recurring visual motifs (e.g., 'empire conquest legions eagles')",
  "contextSummary": "A 15-20 word visual anchor phrase for era consistency"
}

SCRIPT TO ANALYZE:
"""
{SCRIPT}
"""`

async function extractScriptContext(
  fullScript: string,
  apiKey: string,
  model: PromptModel
): Promise<ScriptContext> {
  const useAnthropic = isAnthropicKey(apiKey)
  const effectiveModel = useAnthropic ? 'claude-sonnet-4-5' : model

  const prompt = CONTEXT_EXTRACTION_PROMPT.replace('{SCRIPT}', fullScript.substring(0, 8000))

  let responseText: string

  if (useAnthropic) {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: effectiveModel,
      max_tokens: 1500,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    })
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic')
    }
    responseText = content.text.trim()
  } else {
    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model: effectiveModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 1500,
    })
    responseText = response.choices[0]?.message?.content?.trim() || ''
  }

  const cleanedResponse = responseText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[Context Extraction] No valid JSON found, using defaults')
    return getDefaultContext()
  }

  try {
    const context = JSON.parse(jsonMatch[0]) as ScriptContext
    console.log('[Context Extraction] Era:', context.era)
    return context
  } catch {
    console.error('[Context Extraction] JSON parse error, using defaults')
    return getDefaultContext()
  }
}

function getDefaultContext(): ScriptContext {
  return {
    era: 'Contemporary',
    timePeriod: '21st century',
    geographicSetting: 'Global / unspecified',
    architectureStyle: 'context-appropriate architecture',
    costumeDetails: 'context-appropriate clothing',
    keyFigures: [],
    colorPalette: 'muted documentary tones, natural pigments',
    visualThemes: 'topic-driven motifs',
    contextSummary: 'documentary-style scene consistent with the script\'s topic'
  }
}

// ============================================
// PROMPT BUILDING
// ============================================

function buildSystemPrompt(promptCount: number, context: ScriptContext): string {
  return `You are creating ${promptCount} DIVERSE image prompts for a documentary-style video. Each must look like an ACTUAL OIL PAINTING.

## CRITICAL RULE: MAXIMUM VARIETY

Every image must feel DIFFERENT from the others. Vary:
- Subject matter (objects, people, places, concepts)
- Composition (close-up, wide shot, bird's eye, worm's eye)
- Angle (straight on, 3/4 view, profile, overhead)
- Mood (dramatic, peaceful, tense, hopeful)
- Complexity (simple single object vs. rich scene)

## ERA CONTEXT (apply to all imagery):
- Era: ${context.era}
- Time Period: ${context.timePeriod}
- Setting: ${context.geographicSetting}
- Architecture: ${context.architectureStyle}
- Clothing: ${context.costumeDetails}
- Colors: ${context.colorPalette}

## STYLE REQUIREMENTS:

**Artist Anchors (rotate through these):**
- "in the style of Claude Monet"
- "in the style of Joaquín Sorolla"
- "in the style of John Singer Sargent"
- "Russian Impressionist painting"
- "French Impressionist oil study"
- "alla prima technique"
- "plein air oil painting"

**Texture Phrases (use 2 per prompt):**
- "thick visible brushstrokes"
- "heavy impasto texture"
- "loose gestural brushwork"
- "palette knife marks"
- "broken color technique"
- "wet-on-wet oil technique"
- "paint built up in layers"

**Anti-Digital (use 1 per prompt):**
- "painted on canvas not digital"
- "traditional oil painting"
- "hand-painted quality"
- "oil paint on linen"

## PROMPT STRUCTURE (70-90 words):
"[STYLE ANCHOR], [VARIED SUBJECT with specific angle/composition], [ERA-APPROPRIATE DETAILS], [2 TEXTURE PHRASES], [COLOR PALETTE], [ANTI-DIGITAL], [LIGHTING/ATMOSPHERE]"

## OUTPUT FORMAT:
Return ONLY a JSON array of exactly ${promptCount} prompts. No markdown.
["prompt 1...", "prompt 2...", ...]`
}

function buildUserMessage(chunkText: string, promptCount: number, context: ScriptContext, chunkIndex: number, noveltyConstraints: string = ''): string {
  return `Create ${promptCount} VARIED oil painting prompts for this script section.
${noveltyConstraints}
## SCRIPT SECTION ${chunkIndex + 1}:
"""
${chunkText}
"""

## YOUR TASK (content-first):
1) Break the script section into distinct BEATS/CLAIMS.
2) For EACH prompt: pick ONE beat and visualize it.
3) Each prompt must include:
   - 2 concrete details lifted from the chunk
   - 1 clear visual "why" (what idea this image communicates)
4) Representation may be literal OR symbolic.

## ERA CONTEXT:
- Era: ${context.era}
- Period: ${context.timePeriod}
- Setting: ${context.geographicSetting}
- Colors: ${context.colorPalette}

Return ONLY a JSON array of ${promptCount} prompts with MAXIMUM VARIETY.`
}

// ============================================
// PROMPT ENHANCEMENT
// ============================================

function sanitizePrompt(prompt: string): string {
  let sanitized = prompt
  for (const banned of BANNED_WORDS) {
    const regex = new RegExp(`\\b${banned}\\b`, 'gi')
    sanitized = sanitized.replace(regex, '')
  }
  return sanitized.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim()
}

function enhancePrompt(prompt: string, index: number): string {
  prompt = sanitizePrompt(prompt)

  // Add trigger word if not present
  if (!prompt.toLowerCase().startsWith(TRIGGER_WORD)) {
    prompt = `${TRIGGER_WORD}${prompt}`
  }

  // Check for style anchor
  const styleAnchors = ['monet', 'sorolla', 'sargent', 'impressionist', 'plein air', 'alla prima']
  const hasStyleAnchor = styleAnchors.some(term => prompt.toLowerCase().includes(term))

  if (!hasStyleAnchor) {
    const anchors = [
      'Oil painting in the style of Claude Monet,',
      'Plein air impressionist painting in the style of Joaquín Sorolla,',
      'French Impressionist oil study in the style of John Singer Sargent,',
      'Russian Impressionist alla prima painting,',
      'Impressionist oil painting,',
      'Classical oil painting in the style of the Dutch Masters,',
    ]
    // Insert after trigger word
    const insertPos = TRIGGER_WORD.length
    prompt = prompt.slice(0, insertPos) + anchors[index % anchors.length] + ' ' + prompt.slice(insertPos)
  }

  // Check for texture phrases
  const textureTerms = ['impasto', 'brushstroke', 'palette knife', 'gestural', 'broken color', 'canvas texture', 'paint built', 'wet-on-wet']
  const hasTexture = textureTerms.some(term => prompt.toLowerCase().includes(term))

  if (!hasTexture) {
    const textures = [
      ', thick visible brushstrokes with heavy impasto texture',
      ', loose gestural brushwork with palette knife marks',
      ', broken color technique with paint built up in layers',
      ', wet-on-wet oil technique with visible canvas texture',
    ]
    prompt += textures[index % textures.length]
  }

  // Check for anti-digital phrase
  const antiDigital = ['not digital', 'traditional media', 'hand-painted', 'painted on canvas', 'oil paint on', 'traditional oil']
  const hasAntiDigital = antiDigital.some(term => prompt.toLowerCase().includes(term))

  if (!hasAntiDigital) {
    const phrases = [
      ', painted on canvas, traditional oil medium',
      ', traditional oil painting, not a render',
      ', hand-painted quality on linen canvas',
      ', oil paint on stretched canvas',
    ]
    prompt += phrases[index % phrases.length]
  }

  // Check for atmosphere/lighting
  const atmosphereTerms = ['haze', 'mist', 'atmospheric', 'diffused', 'dust', 'smoky', 'dramatic light', 'soft light', 'golden hour', 'candlelight', 'overcast', 'shadow', 'backlit']
  const hasAtmosphere = atmosphereTerms.some(term => prompt.toLowerCase().includes(term))

  if (!hasAtmosphere) {
    const atmospheres = [
      ', atmospheric haze with soft diffused light',
      ', dramatic side lighting casting long shadows',
      ', warm golden hour glow',
      ', moody overcast atmosphere',
      ', dust motes visible in window light',
      ', soft morning light filtering through',
    ]
    prompt += atmospheres[index % atmospheres.length]
  }

  return prompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim()
}

// ============================================
// SCRIPT CHUNKING
// ============================================

function splitScriptIntoChunks(script: string, numChunks: number): string[] {
  const sentences = script.split(/(?<=[.!?])\s+/).filter(s => s.trim())
  if (sentences.length === 0) return [script]

  const chunks: string[] = []

  if (sentences.length <= numChunks) {
    for (let i = 0; i < numChunks; i++) {
      const sentenceIndex = i % sentences.length
      chunks.push(sentences[sentenceIndex])
    }
    return chunks
  }

  const baseSize = Math.floor(sentences.length / numChunks)
  const remainder = sentences.length % numChunks

  let currentIndex = 0
  for (let i = 0; i < numChunks; i++) {
    const chunkSize = baseSize + (i < remainder ? 1 : 0)
    const end = currentIndex + chunkSize
    chunks.push(sentences.slice(currentIndex, end).join(' '))
    currentIndex = end
  }

  return chunks.filter(c => c.trim())
}

// ============================================
// BATCH GENERATION
// ============================================

async function generateBatchPrompts(
  chunkText: string,
  promptCount: number,
  apiKey: string,
  model: PromptModel,
  batchIndex: number,
  globalPromptOffset: number,
  context: ScriptContext,
  noveltyConstraints: string = ''
): Promise<string[]> {
  const useAnthropic = isAnthropicKey(apiKey)
  const effectiveModel = useAnthropic ? 'claude-sonnet-4-5' : model

  const systemPrompt = buildSystemPrompt(promptCount, context)
  const userMessage = buildUserMessage(chunkText, promptCount, context, batchIndex, noveltyConstraints)

  let responseText: string

  if (useAnthropic) {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: effectiveModel,
      max_tokens: 6000,
      temperature: 0.85,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic')
    }
    responseText = content.text.trim()
  } else {
    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model: effectiveModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.85,
      max_completion_tokens: 6000,
    })
    responseText = response.choices[0]?.message?.content?.trim() || ''
  }

  if (!responseText) {
    throw new Error('No response generated for batch ' + batchIndex)
  }

  const cleanedResponse = responseText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const arrayMatch = cleanedResponse.match(/\[[\s\S]*\]/)
  if (!arrayMatch) {
    throw new Error('No valid JSON array in batch ' + batchIndex)
  }

  const prompts = JSON.parse(arrayMatch[0]) as string[]
  return prompts.map((prompt, i) => enhancePrompt(prompt, globalPromptOffset + i))
}

// ============================================
// BATCH QUEUE
// ============================================

class BatchQueue {
  private tasks: BatchTask[]
  private results: Map<number, BatchResult> = new Map()
  private nextBatchToStream = 0
  private taskIndex = 0

  constructor(tasks: BatchTask[]) {
    this.tasks = tasks
  }

  getNextTask(): BatchTask | null {
    if (this.taskIndex >= this.tasks.length) return null
    return this.tasks[this.taskIndex++]
  }

  storeResult(result: BatchResult): void {
    this.results.set(result.batchIndex, result)
  }

  getStreamableResults(): BatchResult[] {
    const ready: BatchResult[] = []
    while (this.results.has(this.nextBatchToStream)) {
      ready.push(this.results.get(this.nextBatchToStream)!)
      this.results.delete(this.nextBatchToStream)
      this.nextBatchToStream++
    }
    return ready
  }

  getTotalTasks(): number {
    return this.tasks.length
  }
}

// ============================================
// PARALLEL WORKER
// ============================================

interface WorkerCallbacks {
  onBatchComplete?: (batch: PromptBatch) => void
  onProgress?: (progress: PromptProgress) => void
  completedPrompts: { value: number }
  activeWorkers: { value: number }
  totalPrompts: number
  totalBatches: number
  maxWorkers: number
}

async function runWorker(
  workerId: number,
  queue: BatchQueue,
  noveltyTracker: NoveltyTracker,
  context: ScriptContext,
  apiKey: string,
  model: PromptModel,
  lastTaskStartTime: { value: number },
  callbacks: WorkerCallbacks
): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  console.log(`[Worker ${workerId}] Started`)
  callbacks.activeWorkers.value++

  while (true) {
    const task = queue.getNextTask()
    if (!task) {
      console.log(`[Worker ${workerId}] No more tasks, exiting`)
      callbacks.activeWorkers.value--
      break
    }

    // Rate limit protection
    const timeSinceLastStart = Date.now() - lastTaskStartTime.value
    const waitTime = Math.max(0, STAGGER_DELAY_MS - timeSinceLastStart)
    if (waitTime > 0) {
      await sleep(waitTime)
    }
    lastTaskStartTime.value = Date.now()

    console.log(`[Worker ${workerId}] Processing batch ${task.batchIndex}`)

    const constraints = noveltyTracker.getConstraints()

    try {
      const prompts = await generateBatchPrompts(
        task.chunk,
        task.promptCount,
        apiKey,
        model,
        task.batchIndex,
        task.globalPromptOffset,
        context,
        constraints
      )

      console.log(`[Worker ${workerId}] Batch ${task.batchIndex} completed with ${prompts.length} prompts`)

      const result: BatchResult = {
        batchIndex: task.batchIndex,
        prompts,
        success: true
      }
      queue.storeResult(result)
      results.push(result)

      // Commit to novelty tracker and emit progress immediately
      noveltyTracker.commitBatch(result.prompts)
      callbacks.completedPrompts.value += result.prompts.length

      callbacks.onBatchComplete?.({
        batchIndex: result.batchIndex,
        prompts: result.prompts,
        globalOffset: result.batchIndex * PROMPTS_PER_BATCH
      })

      callbacks.onProgress?.({
        phase: 'generating',
        currentBatch: result.batchIndex + 1,
        totalBatches: callbacks.totalBatches,
        promptsGenerated: callbacks.completedPrompts.value,
        totalPrompts: callbacks.totalPrompts,
        activeWorkers: callbacks.activeWorkers.value,
        maxWorkers: callbacks.maxWorkers,
      })
    } catch (error) {
      console.error(`[Worker ${workerId}] Batch ${task.batchIndex} failed:`, error)

      const result: BatchResult = {
        batchIndex: task.batchIndex,
        prompts: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      queue.storeResult(result)
      results.push(result)
    }
  }

  return results
}

// ============================================
// MAIN GENERATION FUNCTION
// ============================================

export async function generatePrompts(input: PromptGenerationInput): Promise<PromptGenerationOutput> {
  const { script, apiKey, model, onBatchComplete, onProgress } = input

  if (!script || script.trim().length === 0) {
    throw new Error('Script is required')
  }

  if (!apiKey) {
    throw new Error('API key is required')
  }

  const wordCount = script.trim().split(/\s+/).length
  const totalPrompts = Math.floor(wordCount / 15)

  if (totalPrompts < 1) {
    throw new Error('Script is too short. Need at least 15 words to generate 1 image.')
  }

  console.log(`[Prompt Generation] Word count: ${wordCount}, Prompts: ${totalPrompts}`)

  // Step 1: Extract context
  onProgress?.({
    phase: 'context',
    currentBatch: 0,
    totalBatches: 0,
    promptsGenerated: 0,
    totalPrompts
  })

  const context = await extractScriptContext(script, apiKey, model)

  // Step 2: Generate prompts
  const batchCount = Math.ceil(totalPrompts / PROMPTS_PER_BATCH)
  const chunks = splitScriptIntoChunks(script, batchCount)

  onProgress?.({
    phase: 'generating',
    currentBatch: 0,
    totalBatches: batchCount,
    promptsGenerated: 0,
    totalPrompts
  })

  // Create batch tasks
  const tasks: BatchTask[] = []
  let promptOffset = 0
  for (let i = 0; i < chunks.length; i++) {
    const isLastBatch = i === chunks.length - 1
    const batchPromptCount = isLastBatch
      ? totalPrompts - promptOffset
      : PROMPTS_PER_BATCH

    tasks.push({
      batchIndex: i,
      chunk: chunks[i],
      promptCount: batchPromptCount,
      globalPromptOffset: promptOffset
    })

    promptOffset += batchPromptCount
  }

  // Initialize queue and tracker
  const queue = new BatchQueue(tasks)
  const noveltyTracker = new NoveltyTracker()
  const lastTaskStartTime = { value: 0 }
  const completedPromptsCounter = { value: 0 }
  const activeWorkersCounter = { value: 0 }

  // Start workers
  const workerCount = Math.min(MAX_WORKERS, tasks.length)

  // Create shared callbacks for workers
  const callbacks: WorkerCallbacks = {
    onBatchComplete,
    onProgress,
    completedPrompts: completedPromptsCounter,
    activeWorkers: activeWorkersCounter,
    totalPrompts,
    totalBatches: batchCount,
    maxWorkers: workerCount,
  }
  const workerPromises: Promise<BatchResult[]>[] = []

  for (let w = 0; w < workerCount; w++) {
    const workerPromise = (async () => {
      if (w > 0) {
        await sleep(w * STAGGER_DELAY_MS)
      }
      return runWorker(w, queue, noveltyTracker, context, apiKey, model, lastTaskStartTime, callbacks)
    })()
    workerPromises.push(workerPromise)
  }

  // Wait for all workers
  await Promise.all(workerPromises)

  // Collect final results from queue
  const allPrompts: string[] = []
  const streamableResults = queue.getStreamableResults()
  for (const result of streamableResults) {
    if (result.success) {
      allPrompts.push(...result.prompts)
    }
  }

  onProgress?.({
    phase: 'complete',
    currentBatch: batchCount,
    totalBatches: batchCount,
    promptsGenerated: allPrompts.length,
    totalPrompts: allPrompts.length
  })

  console.log(`[Prompt Generation] Complete. Total prompts: ${allPrompts.length}`)

  return {
    prompts: allPrompts,
    context,
    totalGenerated: allPrompts.length
  }
}
