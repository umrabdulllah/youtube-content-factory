# YouTube Content Factory

A powerful desktop application for managing YouTube channels with AI-powered automated content generation.

---

## Overview

YouTube Content Factory is an Electron-based desktop application designed to streamline YouTube content creation workflows. It combines channel management, AI-driven content generation, and local data persistence into a unified, offline-first experience.

### Key Features

- **Channel Management** — Organize multiple YouTube channels with categories and projects
- **AI Content Generation** — Generate scripts, prompts, and content using Anthropic Claude and OpenAI
- **Image Generation** — Create thumbnails and visual assets via Replicate
- **Audio Synthesis** — Text-to-speech with Russian language support
- **Subtitle Generation** — Automatic subtitle creation with OpenAI Whisper
- **Offline-First** — Local SQLite database with cloud sync capabilities
- **Cross-Platform** — Available for macOS and Windows

---

## Installation

### Download

Download the latest release for your platform from the [Releases](https://github.com/umrabdulllah/youtube-content-factory/releases) page:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `.exe` (NSIS installer) |

### From Source

```bash
# Clone the repository
git clone https://github.com/umrabdulllah/youtube-content-factory.git
cd youtube-content-factory

# Install dependencies
npm install

# Start development server
npm run electron:dev
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Commands

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Start development server with hot reload |
| `npm run electron:build` | Build for production |
| `npm run build:vite` | Build Vite bundle only |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |

### Project Structure

```
src/
├── main/                   # Electron main process
│   ├── database/           # SQLite schema and queries
│   ├── ipc/                # IPC handlers
│   ├── services/           # Business logic and AI integrations
│   │   └── generation/     # Content generation pipeline
│   └── utils/              # Utility functions
├── renderer/               # React application
│   ├── components/         # UI components (Radix + Tailwind)
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   ├── pages/              # Page components
│   └── styles/             # Global styles
└── shared/                 # Shared types and constants
    └── types/              # TypeScript definitions
```

---

## Architecture

### Process Model

The application follows Electron's multi-process architecture:

- **Main Process** — Node.js environment handling database operations, file system access, IPC communication, and AI service integrations
- **Renderer Process** — React application running in Chromium with HashRouter for Windows compatibility
- **Preload Script** — Secure bridge exposing typed APIs via `contextBridge`

### Content Generation Pipeline

The `PipelineOrchestrator` coordinates parallel content generation:

```
Phase 1 (Parallel)
├── Prompt Generation (Anthropic/OpenAI)
└── Audio Synthesis (TTS)

Phase 2 (Parallel, after Phase 1)
├── Image Generation (Replicate)
└── Subtitle Generation (OpenAI Whisper)
```

### Database

Local SQLite database using `better-sqlite3`:

| Table | Purpose |
|-------|---------|
| `categories` | Channel organization |
| `channels` | YouTube channel metadata |
| `projects` | Content projects |
| `queue_tasks` | Background job processing |
| `analytics_daily` | Usage statistics |
| `settings` | Application configuration |

### Authentication

- Authentication via Supabase
- Offline-first sync queue for data synchronization
- Role-based access control with admin protection

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Electron 33 |
| Frontend | React 18, TypeScript |
| Styling | Tailwind CSS, Radix UI |
| Database | better-sqlite3 |
| AI Services | Anthropic Claude, OpenAI, Replicate |
| Auth | Supabase |
| Build | Vite, electron-builder |

---

## Release Process

Releases are built automatically via GitHub Actions for both macOS and Windows platforms.

1. Update version in `package.json`
2. Commit and push changes
3. Create and push a version tag:
   ```bash
   git tag v1.x.x
   git push origin v1.x.x
   ```

The workflow automatically builds, signs, and publishes releases with auto-update support.

---

## Configuration

The application requires API keys for AI services. Configure these in the Settings page:

- **Anthropic API Key** — For Claude-powered content generation
- **OpenAI API Key** — For GPT models and Whisper transcription
- **Replicate API Token** — For image generation

---

## License

All rights reserved.

---

## Author

Umer Abdullah
