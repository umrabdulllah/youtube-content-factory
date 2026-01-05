import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import * as settingsQueries from '../database/queries/settings'
import {
  CATEGORY_JSON,
  CHANNEL_JSON,
  PROJECT_JSON,
  SCRIPT_FILE,
  IMAGES_DIR,
  VOICEOVERS_DIR,
  SUBTITLES_DIR,
} from '../../shared/constants'
import type { Category, Channel, Project } from '../../shared/types'
import { sanitizeSlug, isPathWithinBase, validateImageName } from '../utils/path-validation'

class FileManager {
  private getBasePath(): string {
    const settings = settingsQueries.getSettings()
    return settings.basePath || path.join(app.getPath('documents'), 'YouTube Content Factory')
  }

  /**
   * Validates that a constructed path is within the base path.
   * Throws an error if path traversal is detected.
   */
  private validatePathSecurity(targetPath: string, basePath: string): void {
    if (!isPathWithinBase(targetPath, basePath)) {
      throw new Error('Security error: Path traversal detected')
    }
  }

  // ============================================
  // Category Operations
  // ============================================

  async createCategoryDirectory(category: Category): Promise<void> {
    const basePath = this.getBasePath()
    const safeSlug = sanitizeSlug(category.slug)
    const categoryPath = path.join(basePath, safeSlug)
    this.validatePathSecurity(categoryPath, basePath)

    await fs.mkdir(categoryPath, { recursive: true })

    // Create category.json
    const metadata = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color,
      created_at: category.createdAt,
    }

    await fs.writeFile(
      path.join(categoryPath, CATEGORY_JSON),
      JSON.stringify(metadata, null, 2)
    )
  }

  async renameCategoryDirectory(oldSlug: string, newSlug: string): Promise<void> {
    const basePath = this.getBasePath()
    const safeOldSlug = sanitizeSlug(oldSlug)
    const safeNewSlug = sanitizeSlug(newSlug)
    const oldPath = path.join(basePath, safeOldSlug)
    const newPath = path.join(basePath, safeNewSlug)
    this.validatePathSecurity(oldPath, basePath)
    this.validatePathSecurity(newPath, basePath)

    try {
      await fs.access(oldPath)
      await fs.rename(oldPath, newPath)
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(newPath, { recursive: true })
    }
  }

  async updateCategoryMetadata(category: Category): Promise<void> {
    const basePath = this.getBasePath()
    const safeSlug = sanitizeSlug(category.slug)
    const categoryPath = path.join(basePath, safeSlug)
    this.validatePathSecurity(categoryPath, basePath)

    try {
      await fs.access(categoryPath)
    } catch {
      await fs.mkdir(categoryPath, { recursive: true })
    }

    const metadata = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color,
      created_at: category.createdAt,
    }

    await fs.writeFile(
      path.join(categoryPath, CATEGORY_JSON),
      JSON.stringify(metadata, null, 2)
    )
  }

  async deleteCategoryDirectory(slug: string): Promise<void> {
    const basePath = this.getBasePath()
    const safeSlug = sanitizeSlug(slug)
    const categoryPath = path.join(basePath, safeSlug)
    this.validatePathSecurity(categoryPath, basePath)

    try {
      await fs.rm(categoryPath, { recursive: true, force: true })
    } catch {
      // Ignore errors
    }
  }

  // ============================================
  // Channel Operations
  // ============================================

  async createChannelDirectory(categorySlug: string, channel: Channel): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channel.slug)
    const channelPath = path.join(basePath, safeCategorySlug, safeChannelSlug)
    this.validatePathSecurity(channelPath, basePath)

    await fs.mkdir(channelPath, { recursive: true })

    // Create channel.json
    const metadata = {
      id: channel.id,
      category_id: channel.categoryId,
      name: channel.name,
      slug: channel.slug,
      description: channel.description,
      default_settings: channel.defaultSettings,
      created_at: channel.createdAt,
    }

    await fs.writeFile(
      path.join(channelPath, CHANNEL_JSON),
      JSON.stringify(metadata, null, 2)
    )
  }

  async renameChannelDirectory(categorySlug: string, oldSlug: string, newSlug: string): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeOldSlug = sanitizeSlug(oldSlug)
    const safeNewSlug = sanitizeSlug(newSlug)
    const oldPath = path.join(basePath, safeCategorySlug, safeOldSlug)
    const newPath = path.join(basePath, safeCategorySlug, safeNewSlug)
    this.validatePathSecurity(oldPath, basePath)
    this.validatePathSecurity(newPath, basePath)

    try {
      await fs.access(oldPath)
      await fs.rename(oldPath, newPath)
    } catch {
      await fs.mkdir(newPath, { recursive: true })
    }
  }

  async updateChannelMetadata(categorySlug: string, channel: Channel): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channel.slug)
    const channelPath = path.join(basePath, safeCategorySlug, safeChannelSlug)
    this.validatePathSecurity(channelPath, basePath)

    try {
      await fs.access(channelPath)
    } catch {
      await fs.mkdir(channelPath, { recursive: true })
    }

    const metadata = {
      id: channel.id,
      category_id: channel.categoryId,
      name: channel.name,
      slug: channel.slug,
      description: channel.description,
      default_settings: channel.defaultSettings,
      created_at: channel.createdAt,
    }

    await fs.writeFile(
      path.join(channelPath, CHANNEL_JSON),
      JSON.stringify(metadata, null, 2)
    )
  }

  async deleteChannelDirectory(categorySlug: string, channelSlug: string): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const channelPath = path.join(basePath, safeCategorySlug, safeChannelSlug)
    this.validatePathSecurity(channelPath, basePath)

    try {
      await fs.rm(channelPath, { recursive: true, force: true })
    } catch {
      // Ignore errors
    }
  }

  // ============================================
  // Project Operations
  // ============================================

  async createProjectDirectory(
    categorySlug: string,
    channelSlug: string,
    project: Project,
    script?: string
  ): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(project.slug)
    const projectPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug)
    this.validatePathSecurity(projectPath, basePath)

    // Create project directory and subdirectories
    await fs.mkdir(path.join(projectPath, IMAGES_DIR), { recursive: true })
    await fs.mkdir(path.join(projectPath, VOICEOVERS_DIR), { recursive: true })
    await fs.mkdir(path.join(projectPath, SUBTITLES_DIR), { recursive: true })

    // Create project.json
    const metadata = {
      id: project.id,
      channel_id: project.channelId,
      title: project.title,
      slug: project.slug,
      status: project.status,
      script_word_count: project.scriptWordCount,
      settings: project.settingsOverride,
      generation_log: [
        { timestamp: new Date().toISOString(), event: 'created' },
      ],
      created_at: project.createdAt,
    }

    await fs.writeFile(
      path.join(projectPath, PROJECT_JSON),
      JSON.stringify(metadata, null, 2)
    )

    // Save script if provided
    if (script) {
      await fs.writeFile(path.join(projectPath, SCRIPT_FILE), script)
    }
  }

  async renameProjectDirectory(
    categorySlug: string,
    channelSlug: string,
    oldSlug: string,
    newSlug: string
  ): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeOldSlug = sanitizeSlug(oldSlug)
    const safeNewSlug = sanitizeSlug(newSlug)
    const oldPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeOldSlug)
    const newPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeNewSlug)
    this.validatePathSecurity(oldPath, basePath)
    this.validatePathSecurity(newPath, basePath)

    try {
      await fs.access(oldPath)
      await fs.rename(oldPath, newPath)
    } catch {
      await fs.mkdir(newPath, { recursive: true })
    }
  }

  async updateProjectMetadata(
    categorySlug: string,
    channelSlug: string,
    project: Project
  ): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(project.slug)
    const projectPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug)
    this.validatePathSecurity(projectPath, basePath)

    try {
      await fs.access(projectPath)
    } catch {
      // Create directories if they don't exist
      await fs.mkdir(path.join(projectPath, IMAGES_DIR), { recursive: true })
      await fs.mkdir(path.join(projectPath, VOICEOVERS_DIR), { recursive: true })
      await fs.mkdir(path.join(projectPath, SUBTITLES_DIR), { recursive: true })
    }

    // Read existing metadata to preserve generation_log
    let existingMetadata: Record<string, unknown> = {}
    try {
      const content = await fs.readFile(path.join(projectPath, PROJECT_JSON), 'utf-8')
      existingMetadata = JSON.parse(content)
    } catch {
      // No existing metadata
    }

    const metadata = {
      id: project.id,
      channel_id: project.channelId,
      title: project.title,
      slug: project.slug,
      status: project.status,
      script_word_count: project.scriptWordCount,
      image_count: project.imageCount,
      audio_duration_seconds: project.audioDurationSeconds,
      settings: project.settingsOverride,
      generation_log: existingMetadata.generation_log || [],
      created_at: project.createdAt,
      completed_at: project.completedAt,
    }

    await fs.writeFile(
      path.join(projectPath, PROJECT_JSON),
      JSON.stringify(metadata, null, 2)
    )
  }

  async updateProjectScript(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string,
    script: string
  ): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const projectPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug)
    this.validatePathSecurity(projectPath, basePath)

    await fs.writeFile(path.join(projectPath, SCRIPT_FILE), script)
  }

  async deleteProjectDirectory(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string
  ): Promise<void> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const projectPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug)
    this.validatePathSecurity(projectPath, basePath)

    try {
      await fs.rm(projectPath, { recursive: true, force: true })
    } catch {
      // Ignore errors
    }
  }

  async getProjectPath(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string
  ): Promise<string> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const projectPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug)
    this.validatePathSecurity(projectPath, basePath)
    return projectPath
  }

  // ============================================
  // Utility Methods
  // ============================================

  async ensureBaseDirectoryExists(): Promise<void> {
    const basePath = this.getBasePath()
    await fs.mkdir(basePath, { recursive: true })
  }

  async readProjectScript(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string
  ): Promise<string | null> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const scriptPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug, SCRIPT_FILE)
    this.validatePathSecurity(scriptPath, basePath)

    try {
      return await fs.readFile(scriptPath, 'utf-8')
    } catch {
      return null
    }
  }

  async listProjectImages(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string
  ): Promise<string[]> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const imagesPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug, IMAGES_DIR)
    this.validatePathSecurity(imagesPath, basePath)

    try {
      const files = await fs.readdir(imagesPath)
      return files
        .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, '')) || 0
          const numB = parseInt(b.replace(/\D/g, '')) || 0
          return numA - numB
        })
    } catch {
      return []
    }
  }

  async getImagePath(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string,
    imageName: string
  ): Promise<string> {
    // Validate image name to prevent path traversal
    if (!validateImageName(imageName)) {
      throw new Error('Invalid image name')
    }

    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const imagePath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug, IMAGES_DIR, imageName)
    this.validatePathSecurity(imagePath, basePath)
    return imagePath
  }

  async getAudioPath(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string
  ): Promise<string | null> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const voiceoversPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug, VOICEOVERS_DIR)
    this.validatePathSecurity(voiceoversPath, basePath)

    try {
      const files = await fs.readdir(voiceoversPath)
      const audioFile = files.find(f => /\.(mp3|wav|m4a|ogg)$/i.test(f))
      if (audioFile) {
        return path.join(voiceoversPath, audioFile)
      }
      return null
    } catch {
      return null
    }
  }

  async getSubtitles(
    categorySlug: string,
    channelSlug: string,
    projectSlug: string
  ): Promise<string | null> {
    const basePath = this.getBasePath()
    const safeCategorySlug = sanitizeSlug(categorySlug)
    const safeChannelSlug = sanitizeSlug(channelSlug)
    const safeProjectSlug = sanitizeSlug(projectSlug)
    const subtitlesPath = path.join(basePath, safeCategorySlug, safeChannelSlug, safeProjectSlug, SUBTITLES_DIR)
    this.validatePathSecurity(subtitlesPath, basePath)

    try {
      const files = await fs.readdir(subtitlesPath)
      const srtFile = files.find(f => /\.srt$/i.test(f))
      if (srtFile) {
        return await fs.readFile(path.join(subtitlesPath, srtFile), 'utf-8')
      }
      return null
    } catch {
      return null
    }
  }

  async readImageAsBase64(imagePath: string): Promise<string | null> {
    // Validate that the path is within the base path
    const basePath = this.getBasePath()
    this.validatePathSecurity(imagePath, basePath)

    try {
      const buffer = await fs.readFile(imagePath)
      const ext = path.extname(imagePath).toLowerCase().slice(1)
      const mimeType = ext === 'jpg' ? 'jpeg' : ext
      return `data:image/${mimeType};base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }
}

export const fileManager = new FileManager()
