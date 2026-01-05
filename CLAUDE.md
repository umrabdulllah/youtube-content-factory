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
```

## Architecture

### Process Separation (Electron)
- **Main process** (`src/main/`): Node.js environment handling database, file system, and IPC
- **Renderer process** (`src/renderer/`): React app running in Chromium
- **Preload** (`src/main/preload.ts`): Bridge exposing `window.api` to renderer via contextBridge
- **Shared** (`src/shared/`): Types and constants used by both processes

### IPC Communication Pattern
All main-renderer communication uses typed IPC channels:
1. Channel names defined in `src/shared/ipc-channels.ts`
2. Handlers registered in `src/main/ipc/*.ipc.ts` files
3. API exposed to renderer via `src/main/preload.ts` as `window.api`

Example: `window.api.projects.create(input)` invokes `IPC_CHANNELS.PROJECTS.CREATE`

### Database
Uses better-sqlite3 with schema in `src/main/database/schema.ts`. Core tables:
- `categories` → `channels` → `projects` (hierarchical content organization)
- `queue_tasks` (background job processing)
- `analytics_daily` (usage statistics)
- `settings` (key-value app configuration)

Query functions are in `src/main/database/queries/*.ts`.

### Path Aliases
Configured in `vite.config.ts`:
- `@/` → `src/`
- `@shared/` → `src/shared/`
- `@renderer/` → `src/renderer/`
- `@main/` → `src/main/`

### UI Components
Located in `src/renderer/components/ui/`. Uses Radix UI primitives with Tailwind CSS styling. shadcn/ui patterns.
