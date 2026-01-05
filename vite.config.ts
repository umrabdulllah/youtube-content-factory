import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src'),
              '@shared': path.resolve(__dirname, './src/shared'),
              '@renderer': path.resolve(__dirname, './src/renderer'),
              '@main': path.resolve(__dirname, './src/main')
            }
          },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: [
                'better-sqlite3',
                'sharp',
                '@img/sharp-darwin-arm64',
                '@img/sharp-darwin-x64',
                '@img/sharp-linux-x64',
                '@img/sharp-win32-x64',
                '@img/sharp-wasm32'
              ]
            }
          }
        }
      },
      {
        entry: 'src/main/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              output: {
                entryFileNames: '[name].mjs'
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
