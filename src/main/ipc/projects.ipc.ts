import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as projectsQueries from '../database/queries/projects'
import * as channelsQueries from '../database/queries/channels'
import * as categoriesQueries from '../database/queries/categories'
import * as queueQueries from '../database/queries/queue'
import { fileManager } from '../services/file-manager'
import { queueManager } from '../services/queue-manager'
import { validateImageName } from '../utils/path-validation'
import { handleIpcError } from '../utils/ipc-error-handler'
import type { CreateProjectInput, UpdateProjectInput } from '../../shared/types'

export function registerProjectsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_ALL, async () => {
    return handleIpcError(async () => {
      return projectsQueries.getAllProjects()
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_BY_ID, async (_, id: string) => {
    return handleIpcError(async () => {
      return projectsQueries.getProjectById(id)
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_BY_CHANNEL, async (_, channelId: string) => {
    return handleIpcError(async () => {
      return projectsQueries.getProjectsByChannel(channelId)
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.CREATE, async (_, input: CreateProjectInput) => {
    return handleIpcError(async () => {
      // Validate required fields
      if (!input.channelId || typeof input.channelId !== 'string') {
        throw new Error('Channel ID is required')
      }
      if (!input.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
        throw new Error('Project title is required')
      }

      const channel = channelsQueries.getChannelById(input.channelId)

      if (!channel) {
        throw new Error(`Channel not found: ${input.channelId}`)
      }

      const category = categoriesQueries.getCategoryById(channel.categoryId)

      if (!category) {
        throw new Error(`Category not found: ${channel.categoryId}`)
      }

      // Create DB record first
      const project = projectsQueries.createProject(input)

      try {
        // Then create directory structure on disk
        await fileManager.createProjectDirectory(category.slug, channel.slug, project, input.script)
      } catch (error) {
        // If directory creation fails, rollback the DB record to maintain consistency
        console.error('[Projects] Directory creation failed, rolling back DB record:', error)
        try {
          projectsQueries.deleteProject(project.id)
        } catch (deleteError) {
          console.error('[Projects] Failed to rollback DB record:', deleteError)
        }
        throw error
      }

      return project
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.UPDATE, async (_, input: UpdateProjectInput) => {
    return handleIpcError(async () => {
      // Validate required fields
      if (!input.id || typeof input.id !== 'string') {
        throw new Error('Project ID is required')
      }
      if (input.title !== undefined && (typeof input.title !== 'string' || input.title.trim().length === 0)) {
        throw new Error('Project title cannot be empty')
      }

      const oldProject = projectsQueries.getProjectById(input.id)
      const project = projectsQueries.updateProject(input)

      if (oldProject) {
        const channel = channelsQueries.getChannelById(oldProject.channelId)

        if (channel) {
          const category = categoriesQueries.getCategoryById(channel.categoryId)

          if (category) {
            // If title changed, rename directory
            if (input.title && oldProject.title !== input.title) {
              await fileManager.renameProjectDirectory(
                category.slug,
                channel.slug,
                oldProject.slug,
                project.slug
              )
            }

            // Update project.json and script if needed
            await fileManager.updateProjectMetadata(category.slug, channel.slug, project)

            if (input.script !== undefined) {
              await fileManager.updateProjectScript(category.slug, channel.slug, project.slug, input.script)
            }
          }
        }
      }

      return project
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.DELETE, async (_, id: string) => {
    return handleIpcError(async () => {
      const project = projectsQueries.getProjectById(id)

      // Return early if project doesn't exist
      if (!project) {
        return { deleted: false, error: 'Project not found' }
      }

      const channel = channelsQueries.getChannelById(project.channelId)

      if (channel) {
        const category = categoriesQueries.getCategoryById(channel.categoryId)

        if (category) {
          // Delete directory on disk
          await fileManager.deleteProjectDirectory(category.slug, channel.slug, project.slug)
        }
      }

      const deleted = projectsQueries.deleteProject(id)
      return { deleted }
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GENERATE, async (_, id: string) => {
    return handleIpcError(async () => {
      const project = projectsQueries.getProjectById(id)

      if (!project) {
        throw new Error(`Project not found: ${id}`)
      }

      if (!project.script) {
        throw new Error('Cannot generate assets: no script provided')
      }

      // Check if at least one generation option is enabled
      if (!project.generateImages && !project.generateAudio) {
        throw new Error('Cannot generate: no generation options selected')
      }

      console.log(`[Projects] Starting generation for ${id} with options:`, {
        generateImages: project.generateImages,
        generateAudio: project.generateAudio,
        generateSubtitles: project.generateSubtitles,
      })

      // Update project status to queued
      projectsQueries.updateProject({ id, status: 'queued' })

      // Create queue tasks for the project based on generation options
      // - prompts + audio run in parallel (Phase 0) - if enabled
      // - images depends on prompts, subtitles depends on audio (Phase 1) - if enabled
      queueQueries.createProjectQueueTasks(id, {
        generateImages: project.generateImages,
        generateAudio: project.generateAudio,
        generateSubtitles: project.generateSubtitles,
      })

      // Ensure queue manager is running to process tasks
      queueManager.start()

      return {
        success: true,
        message: 'Project queued for generation',
      }
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.OPEN_FOLDER, async (_, id: string) => {
    return handleIpcError(async () => {
      const project = projectsQueries.getProjectById(id)

      if (project) {
        const channel = channelsQueries.getChannelById(project.channelId)

        if (channel) {
          const category = categoriesQueries.getCategoryById(channel.categoryId)

          if (category) {
            const projectPath = await fileManager.getProjectPath(category.slug, channel.slug, project.slug)
            await shell.openPath(projectPath)
            return { opened: true }
          }
        }
      }

      return { opened: false }
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_ASSETS, async (_, id: string) => {
    return handleIpcError(async () => {
      const project = projectsQueries.getProjectById(id)

      if (!project) {
        return { images: [], audioPath: null, subtitles: null }
      }

      const channel = channelsQueries.getChannelById(project.channelId)
      if (!channel) {
        return { images: [], audioPath: null, subtitles: null }
      }

      const category = categoriesQueries.getCategoryById(channel.categoryId)
      if (!category) {
        return { images: [], audioPath: null, subtitles: null }
      }

      const [images, audioPath, subtitles] = await Promise.all([
        fileManager.listProjectImages(category.slug, channel.slug, project.slug),
        fileManager.getAudioPath(category.slug, channel.slug, project.slug),
        fileManager.getSubtitles(category.slug, channel.slug, project.slug),
      ])

      return { images, audioPath, subtitles }
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_IMAGE, async (_, id: string, imageName: string) => {
    return handleIpcError(async () => {
      // Validate image name to prevent path traversal
      if (!validateImageName(imageName)) {
        throw new Error('Invalid image name')
      }

      const project = projectsQueries.getProjectById(id)

      if (!project) {
        return null
      }

      const channel = channelsQueries.getChannelById(project.channelId)
      if (!channel) {
        return null
      }

      const category = categoriesQueries.getCategoryById(channel.categoryId)
      if (!category) {
        return null
      }

      const imagePath = await fileManager.getImagePath(category.slug, channel.slug, project.slug, imageName)
      return await fileManager.readImageAsBase64(imagePath)
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_AUDIO_PATH, async (_, id: string) => {
    return handleIpcError(async () => {
      const project = projectsQueries.getProjectById(id)

      if (!project) {
        return null
      }

      const channel = channelsQueries.getChannelById(project.channelId)
      if (!channel) {
        return null
      }

      const category = categoriesQueries.getCategoryById(channel.categoryId)
      if (!category) {
        return null
      }

      return await fileManager.getAudioPath(category.slug, channel.slug, project.slug)
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS.GET_SUBTITLES, async (_, id: string) => {
    return handleIpcError(async () => {
      const project = projectsQueries.getProjectById(id)

      if (!project) {
        return null
      }

      const channel = channelsQueries.getChannelById(project.channelId)
      if (!channel) {
        return null
      }

      const category = categoriesQueries.getCategoryById(channel.categoryId)
      if (!category) {
        return null
      }

      return await fileManager.getSubtitles(category.slug, channel.slug, project.slug)
    })
  })
}
