import './globals.css'
import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { runMigrations } from './lib/migrations'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import LayoutShell from './components/LayoutShell'
import ErrorBoundary from './components/ErrorBoundary'
import AuthGuard from './components/AuthGuard'
import { applyThemeFromState, getThemeState, setUseGtkTheme } from './lib/theme-store'
import { setOsDarkPreference, setGtkThemeMapping, setWallbashState, isWallbashActive, wallbashUpdatedRecently } from './lib/theme-engine'
import type { WallbashColors } from './lib/theme-definitions'
import { PersonalSkeleton, DashboardSkeleton, MessagesSkeleton, SettingsSkeleton, GenericPageSkeleton } from './components/Skeleton'
import { registerPrimitives } from './components/primitives/register'
import { exposePrimitivesAPI, loadBjornModules } from './lib/bjorn-store'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Personal = lazy(() => import('./pages/Personal'))
const Chat = lazy(() => import('./pages/Chat'))
const Todos = lazy(() => import('./pages/Todos'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Reminders = lazy(() => import('./pages/Reminders'))
const Messages = lazy(() => import('./pages/Messages'))
const Pomodoro = lazy(() => import('./pages/Pomodoro'))
const Email = lazy(() => import('./pages/Email'))
const HomeLab = lazy(() => import('./pages/HomeLab'))
const MediaRadar = lazy(() => import('./pages/MediaRadar'))
const Missions = lazy(() => import('./pages/Missions'))
const Agents = lazy(() => import('./pages/Agents'))
const Memory = lazy(() => import('./pages/Memory'))
const CronJobs = lazy(() => import('./pages/CronJobs'))
const OpenClaw = lazy(() => import('./pages/OpenClaw'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'))
const Notes = lazy(() => import('./pages/notes/Notes'))
const Sessions = lazy(() => import('./pages/sessions/SessionsPage'))
const RemoteViewer = lazy(() => import('./pages/remote/RemotePage'))
const Ideas = lazy(() => import('./pages/Ideas'))
const Capture = lazy(() => import('./pages/Capture'))
const Settings = lazy(() => import('./pages/Settings'))
const Search = lazy(() => import('./pages/Search'))
const Login = lazy(() => import('./pages/Login'))
const CustomPage = lazy(() => import('./pages/CustomPage'))
const NotFound = lazy(() => import('./pages/NotFound'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 2,
      // Exponential backoff: 1s, 2s, 4s — keeps a slow service from blocking others
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    }
  }
})

// Tie React Query focus refetching to Tauri window focus events
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    focusManager.setEventListener((handleFocus) => {
      let unlisten: (() => void) | undefined
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        handleFocus(focused)
      }).then(fn => { unlisten = fn })
      return () => unlisten?.()
    })
  })
}

// Always disable native decorations in Tauri — we use a custom title bar
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    getCurrentWindow().setDecorations(false)
  })
}

// Run migrations first — v5 migration converts old theme/accent keys to theme-state
runMigrations()

// Apply saved theme before first paint (uses ThemeStore + ThemeEngine pipeline)
applyThemeFromState()

// Debounced theme apply — coalesces rapid wallbash/gsettings events into one apply.
// Both the file watcher and gsettings monitor can fire for the same mode switch,
// and rapid switching generates overlapping events.
let _applyTimer: ReturnType<typeof setTimeout> | null = null
const debouncedApply = () => {
  if (_applyTimer) clearTimeout(_applyTimer)
  _applyTimer = setTimeout(() => {
    _applyTimer = null
    applyThemeFromState()
  }, 150)
}

// Detect OS dark mode preference — use Tauri native API on desktop (reads GTK
// settings on Linux), fall back to matchMedia in browser mode.
// On Linux (Hyprland/Wayland), Tauri's native theme() reads gtk-application-prefer-dark-theme
// which is often unset, so we call our Rust detect_system_dark_mode command as a fallback.
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    getCurrentWindow().theme().then(async (theme) => {
      let isDark = theme === 'dark'
      // On Linux, native detection may miss dark GTK themes — use gsettings fallback
      if (!isDark && navigator.userAgent.includes('Linux')) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          isDark = await invoke<boolean>('detect_system_dark_mode')
        } catch {
          // gsettings unavailable or command failed — keep native result
        }
      }
      setOsDarkPreference(isDark)

      // On Linux, detect the GTK theme name and map it to a built-in preset
      // so System mode matches the user's desktop theme (e.g. Rose-Pine, Catppuccin)
      if (navigator.userAgent.includes('Linux')) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const gtkTheme = await invoke<string>('detect_gtk_theme')
          if (gtkTheme) setGtkThemeMapping(gtkTheme)
        } catch {
          // gsettings unavailable — fall back to dark/light detection only
        }
      }

      if (getThemeState().mode === 'system') applyThemeFromState()
    })
    // Listen for OS theme changes (works on macOS/Windows; on Linux this fires
    // only if gtk-application-prefer-dark-theme changes, which is rare on Wayland)
    getCurrentWindow().onThemeChanged(({ payload }) => {
      setOsDarkPreference(payload === 'dark')
      // Skip apply if wallbash is driving theme — its events are authoritative
      if (getThemeState().mode === 'system' && !wallbashUpdatedRecently()) {
        debouncedApply()
      }
    })

    // On Linux, fetch initial wallbash colors if Wallbash-Gtk is active
    if (navigator.userAgent.includes('Linux')) {
      (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const colors = await invoke<WallbashColors>('read_wallbash_colors')
          const themeConf = await invoke<{ gtk_theme: string; color_scheme: string }>('read_theme_conf')

          const hasWallbash = colors && Object.keys(colors).length > 0

          // Atomic initial state setup
          setWallbashState({
            colors: hasWallbash ? colors : undefined,
            colorScheme: themeConf?.color_scheme ? (themeConf.color_scheme === 'prefer-dark' ? 'prefer-dark' : 'prefer-light') : undefined,
            gtkThemeName: themeConf?.gtk_theme || undefined,
          })

          // Also set osDarkPreference from theme.conf color_scheme
          if (themeConf?.color_scheme) {
            setOsDarkPreference(themeConf.color_scheme === 'prefer-dark')
          }

          // Auto-enable GTK theme mode on first detection — user can disable in Settings
          if ((hasWallbash || themeConf?.gtk_theme) && getThemeState().useGtkTheme === undefined) {
            setUseGtkTheme(true)
          }

          if (getThemeState().mode === 'system') applyThemeFromState()
        } catch { /* wallbash files not present */ }
      })()
    }

    // Combined wallbash event from Rust file watcher — colors + theme.conf
    // arrive as one atomic payload to prevent flash from stale intermediate state
    if (navigator.userAgent.includes('Linux')) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<{ colors: WallbashColors; theme: { gtk_theme: string; icon_theme: string; color_scheme: string } }>('wallbash-theme-update', (event) => {
          if (getThemeState().mode !== 'system') return
          const { colors, theme } = event.payload

          // Atomic state update — all wallbash state changes in one call
          setWallbashState({
            colors: (colors && Object.keys(colors).length > 0) ? colors : undefined,
            colorScheme: theme.color_scheme ? (theme.color_scheme === 'prefer-dark' ? 'prefer-dark' : 'prefer-light') : undefined,
            gtkThemeName: theme.gtk_theme || undefined,
          })

          // Auto-enable GTK theme on first wallbash detection
          if (getThemeState().useGtkTheme === undefined) {
            setUseGtkTheme(true)
          }

          debouncedApply()
        })

        // Instant color-scheme detection via gsettings monitor (Rust subprocess).
        // Fires immediately when gsettings color-scheme changes — no polling delay.
        listen<string>('gsettings-color-scheme-changed', (event) => {
          if (getThemeState().mode !== 'system') return
          if (wallbashUpdatedRecently()) return
          const isDark = event.payload === 'prefer-dark'
          setOsDarkPreference(isDark)
          debouncedApply()
        })
      })
    }

    // Fallback poll for GTK theme name changes on Linux (Wayland has no dbus signals).
    // Color-scheme changes are handled by the gsettings monitor above; this poll only
    // catches GTK theme name changes when wallbash is not active.
    if (navigator.userAgent.includes('Linux')) {
      let lastGtkTheme = ''
      setInterval(async () => {
        if (getThemeState().mode !== 'system') return
        if (isWallbashActive()) return // file watcher handles wallbash GTK themes
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const gtkTheme = await invoke<string>('detect_gtk_theme')
          if (gtkTheme && gtkTheme !== lastGtkTheme) {
            lastGtkTheme = gtkTheme
            setGtkThemeMapping(gtkTheme)
            debouncedApply()
          }
        } catch { /* gsettings unavailable */ }
      }, 3000)
    }
  })
} else {
  // Browser fallback — matchMedia listener
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  setOsDarkPreference(mq.matches)
  mq.addEventListener('change', (e) => {
    setOsDarkPreference(e.matches)
    if (getThemeState().mode === 'system') applyThemeFromState(undefined, true)
  })
}

// Disable browser context menu in Tauri (not in browser dev mode)
if (window.__TAURI_INTERNALS__) {
  document.addEventListener('contextmenu', e => e.preventDefault())
}

// Load the MC API key from the OS keychain via Tauri IPC
if (window.__TAURI_INTERNALS__) {
  Promise.all([
    import('@tauri-apps/api/core'),
    import('./lib/api'),
    import('./lib/hooks/useChatSocket'),
  ]).then(([{ invoke }, { setApiKey }, { setChatSocketApiKey }]) => {
    invoke<string | null>('get_secret', { key: 'mc-api-key' }).then((key) => {
      if (key) {
        setApiKey(key)
        setChatSocketApiKey(key)
      }
    }).catch((err) => {
      console.warn('Failed to load MC API key:', err)
    })
  })
}

// Register module primitives into Widget Registry before first render
registerPrimitives()
exposePrimitivesAPI()
// Load Bjorn AI-generated modules from backend (non-blocking)
loadBjornModules()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '2px', zIndex: 9999, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--accent)',
              animation: 'progressBar 1.2s ease-in-out infinite',
              transformOrigin: 'left',
            }} />
            <style>{`@keyframes progressBar { 0% { transform: translateX(-100%) scaleX(0.3); } 50% { transform: translateX(30%) scaleX(0.5); } 100% { transform: translateX(100%) scaleX(0.3); } }`}</style>
          </div>
        }>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGuard><LayoutShell /></AuthGuard>}>
            <Route path="/" element={<Suspense fallback={<PersonalSkeleton />}><Personal /></Suspense>} />
            <Route path="/personal" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<Suspense fallback={<DashboardSkeleton />}><Dashboard /></Suspense>} />
            <Route path="/chat" element={<Suspense fallback={<GenericPageSkeleton />}><Chat /></Suspense>} />
            <Route path="/todos" element={<Suspense fallback={<GenericPageSkeleton />}><Todos /></Suspense>} />
            <Route path="/calendar" element={<Suspense fallback={<GenericPageSkeleton />}><Calendar /></Suspense>} />
            <Route path="/reminders" element={<Suspense fallback={<GenericPageSkeleton />}><Reminders /></Suspense>} />
            <Route path="/messages" element={<Suspense fallback={<MessagesSkeleton />}><Messages /></Suspense>} />
            <Route path="/pomodoro" element={<Suspense fallback={<GenericPageSkeleton />}><Pomodoro /></Suspense>} />
            <Route path="/email" element={<Suspense fallback={<GenericPageSkeleton />}><Email /></Suspense>} />
            <Route path="/homelab" element={<Suspense fallback={<GenericPageSkeleton />}><HomeLab /></Suspense>} />
            <Route path="/media" element={<Suspense fallback={<GenericPageSkeleton />}><MediaRadar /></Suspense>} />
            <Route path="/missions" element={<Suspense fallback={<GenericPageSkeleton />}><Missions /></Suspense>} />
            <Route path="/openclaw" element={<Suspense fallback={<GenericPageSkeleton />}><OpenClaw /></Suspense>} />
            <Route path="/agents" element={<Navigate to="/openclaw" replace />} />
            <Route path="/memory" element={<Suspense fallback={<GenericPageSkeleton />}><Memory /></Suspense>} />
            <Route path="/crons" element={<Navigate to="/openclaw" replace />} />
            <Route path="/pipeline" element={<Suspense fallback={<GenericPageSkeleton />}><Pipeline /></Suspense>} />
            <Route path="/knowledge" element={<Suspense fallback={<GenericPageSkeleton />}><KnowledgeBase /></Suspense>} />
            <Route path="/notes" element={<Suspense fallback={<GenericPageSkeleton />}><Notes /></Suspense>} />
            <Route path="/sessions" element={<Suspense fallback={<GenericPageSkeleton />}><Sessions /></Suspense>} />
            <Route path="/remote" element={<Suspense fallback={<GenericPageSkeleton />}><RemoteViewer /></Suspense>} />
            <Route path="/ideas" element={<Suspense fallback={<GenericPageSkeleton />}><Ideas /></Suspense>} />
            <Route path="/capture" element={<Suspense fallback={<GenericPageSkeleton />}><Capture /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<SettingsSkeleton />}><Settings /></Suspense>} />
            <Route path="/search" element={<Suspense fallback={<GenericPageSkeleton />}><Search /></Suspense>} />
            <Route path="/custom/:id" element={<Suspense fallback={<GenericPageSkeleton />}><CustomPage /></Suspense>} />
            <Route path="*" element={<Suspense fallback={null}><NotFound /></Suspense>} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
