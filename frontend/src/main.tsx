import './globals.css'
import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { runMigrations } from './lib/migrations'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import LayoutShell from './components/LayoutShell'
import ErrorBoundary from './components/ErrorBoundary'
import AuthGuard from './components/AuthGuard'
import { applyAccentColor, getSavedAccent, applyGlowColor, getSavedGlowColor, applySecondaryColor, getSavedSecondaryColor, applyLogoColor, getSavedLogoColor } from './lib/themes'
import { PersonalSkeleton, DashboardSkeleton } from './components/Skeleton'

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
const Pipeline = lazy(() => import('./pages/Pipeline'))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'))
const Notes = lazy(() => import('./pages/Notes'))
const Status = lazy(() => import('./pages/Status'))
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

// Apply saved theme preference on load
;(() => {
  let theme: string | null = null
  try {
    const stored = localStorage.getItem('theme')
    if (stored) theme = JSON.parse(stored)
  } catch { /* */ }
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light'
  } else if (theme === 'system') {
    document.documentElement.dataset.theme =
      window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } else {
    document.documentElement.dataset.theme = 'dark'
  }
})()

// Apply saved accent color before first paint
;(() => {
  const accent = getSavedAccent()
  if (accent) {
    applyAccentColor(accent)
    document.documentElement.dataset.accent = accent
  }
  const glow = getSavedGlowColor()
  if (glow) applyGlowColor(glow)
  const secondary = getSavedSecondaryColor()
  if (secondary) applySecondaryColor(secondary)
  const logo = getSavedLogoColor()
  if (logo) applyLogoColor(logo)
})()

// Listen for system theme changes when in 'system' mode
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  let theme: string | null = null
  try {
    const stored = localStorage.getItem('theme')
    if (stored) theme = JSON.parse(stored)
  } catch { /* */ }
  if (theme === 'system') {
    document.documentElement.dataset.theme = e.matches ? 'light' : 'dark'
  }
})

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

runMigrations()

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
            <Route path="/chat" element={<Chat />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/pomodoro" element={<Pomodoro />} />
            <Route path="/email" element={<Email />} />
            <Route path="/homelab" element={<HomeLab />} />
            <Route path="/media" element={<MediaRadar />} />
            <Route path="/missions" element={<Missions />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/crons" element={<CronJobs />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/status" element={<Status />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/search" element={<Search />} />
            <Route path="/custom/:id" element={<CustomPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
