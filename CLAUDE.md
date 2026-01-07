# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Content Factory is an Electron desktop application for managing YouTube channels and automated content generation. It uses React for the renderer process, better-sqlite3 for local data persistence, and TypeScript throughout.

## Commands

```bash
# Development - runs Vite dev server and Electron concurrently
npm run electron:dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run electron:build

# Build Vite only (no Electron)
npm run build:vite

# Release (builds and publishes to GitHub)
npm run release           # All platforms
npm run release:mac       # macOS only
npm run release:win       # Windows only
```

## Architecture

### Process Separation (Electron)
- **Main process** (`src/main/`): Node.js environment handling database, file system, IPC, and generation services
- **Renderer process** (`src/renderer/`): React app running in Chromium with HashRouter for Windows file:// compatibility
- **Preload** (`src/main/preload.ts`): Bridge exposing `window.api` to renderer via contextBridge
- **Shared** (`src/shared/`): Types, constants, and IPC channel definitions used by both processes

### IPC Communication Pattern
All main-renderer communication uses typed IPC channels:
1. Channel names defined in `src/shared/ipc-channels.ts`
2. Handlers registered in `src/main/ipc/*.ipc.ts` files
3. API exposed to renderer via `src/main/preload.ts` as `window.api`

Example: `window.api.projects.create(input)` invokes `IPC_CHANNELS.PROJECTS.CREATE`

To add a new IPC endpoint:
1. Add channel name to `src/shared/ipc-channels.ts`
2. Create handler in appropriate `src/main/ipc/*.ipc.ts` file
3. Expose method in `src/main/preload.ts`
4. Add TypeScript types in `src/shared/types/`

### Database
Uses better-sqlite3 with schema in `src/main/database/schema.ts`. Core tables:
- `categories` → `channels` → `projects` (hierarchical content organization)
- `queue_tasks` (background job processing with dependencies)
- `analytics_daily` (usage statistics)
- `settings` (key-value app configuration)
- `sync_*` tables (offline queue and cloud sync tracking)

Query functions are in `src/main/database/queries/*.ts`. Schema migrations are handled inline in `schema.ts`.

### Content Generation Pipeline
Located in `src/main/services/generation/`. The `PipelineOrchestrator` coordinates parallel content generation:
1. **Phase 1**: Prompts (via Anthropic/OpenAI) + Audio (Russian TTS) run in parallel
2. **Phase 2**: Images (Replicate) + Subtitles (WhisperX) run in parallel after Phase 1
3. Emits `pipeline:complete` event for UI notifications

Services: `prompt-generation.service.ts`, `image.service.ts`, `audio.service.ts`, `subtitle.service.ts`

### Authentication & Sync
- Auth via Supabase (`src/main/services/supabase.ts`)
- Offline-first sync queue (`src/main/services/sync/`)
- Role-based access: admin routes protected via `<ProtectedRoute requireAdmin>`

### Path Aliases
Configured in `vite.config.ts`:
- `@/` → `src/`
- `@shared/` → `src/shared/`
- `@renderer/` → `src/renderer/`
- `@main/` → `src/main/`

### UI Components
Located in `src/renderer/components/ui/`. Uses Radix UI primitives with Tailwind CSS styling. shadcn/ui patterns.

### State Management
- Zustand for client-side state
- React Context for auth (`src/renderer/contexts/AuthContext.tsx`)
