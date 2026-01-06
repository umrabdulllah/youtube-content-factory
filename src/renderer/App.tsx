import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Dashboard } from './pages/Dashboard'
import { Categories } from './pages/Categories'
import { CategoryDetail } from './pages/CategoryDetail'
import { Channels } from './pages/Channels'
import { ChannelDetail } from './pages/ChannelDetail'
import { Projects } from './pages/Projects'
import { ProjectDetail } from './pages/ProjectDetail'
import { NewProject } from './pages/NewProject'
import { Queue } from './pages/Queue'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { UserManagement } from './pages/UserManagement'
import { AdminDashboard } from './pages/AdminDashboard'
import { Toaster } from './components/ui/toaster'
import { UpdateNotification } from './components/UpdateNotification'

// Completion sound notification
function useCompletionSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Create audio element for completion sound
    audioRef.current = new Audio()
    // Use a simple system beep or create a data URL for a ping sound
    // This creates a short ping/chime sound using Web Audio API fallback
    const playCompletionSound = () => {
      try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.setValueAtTime(880, audioContext.currentTime) // A5 note
        oscillator.type = 'sine'

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.3)

        // Play a second higher note for a pleasant chime
        setTimeout(() => {
          const osc2 = audioContext.createOscillator()
          const gain2 = audioContext.createGain()
          osc2.connect(gain2)
          gain2.connect(audioContext.destination)
          osc2.frequency.setValueAtTime(1320, audioContext.currentTime) // E6 note
          osc2.type = 'sine'
          gain2.gain.setValueAtTime(0.2, audioContext.currentTime)
          gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4)
          osc2.start(audioContext.currentTime)
          osc2.stop(audioContext.currentTime + 0.4)
        }, 150)
      } catch (error) {
        console.warn('Could not play completion sound:', error)
      }
    }

    // Subscribe to pipeline complete events
    const unsubscribe = window.api.queue.onPipelineComplete(() => {
      console.log('[App] Pipeline complete, playing notification sound')
      playCompletionSound()
    })

    return () => {
      unsubscribe()
    }
  }, [])
}

function App() {
  // Play completion sound when generation finishes
  useCompletionSound()

  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes - require authentication */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ErrorBoundary>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/categories" element={<Categories />} />
                        <Route path="/categories/:id" element={<CategoryDetail />} />
                        <Route path="/channels" element={<Channels />} />
                        <Route path="/channels/:id" element={<ChannelDetail />} />
                        <Route path="/channels/:channelId/projects" element={<Projects />} />
                        <Route path="/projects/new" element={<NewProject />} />
                        <Route path="/projects/:id" element={<ProjectDetail />} />
                        <Route path="/queue" element={<Queue />} />
                        <Route path="/settings" element={<Settings />} />
                        {/* Admin only routes */}
                        <Route
                          path="/users"
                          element={
                            <ProtectedRoute requireAdmin>
                              <UserManagement />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/admin"
                          element={
                            <ProtectedRoute requireAdmin>
                              <AdminDashboard />
                            </ProtectedRoute>
                          }
                        />
                      </Routes>
                    </ErrorBoundary>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster />
          <UpdateNotification />
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
