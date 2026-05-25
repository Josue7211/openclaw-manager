import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './global.css'
import { runMigrations } from './lib/migrations'
import { applyThemeFromState } from './lib/theme-store'
import { setDesktopApiKeys } from './lib/api'

window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason?.message ?? event.reason ?? '')
  if (reason.includes('__TAURI__') || reason.includes('Tauri')) {
    event.preventDefault()
  }
})

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
}, { capture: true })

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()
  const opensDevTools =
    event.key === 'F12' ||
    ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
    (event.metaKey && event.altKey && key === 'i')

  if (opensDevTools) {
    event.preventDefault()
    event.stopPropagation()
  }
}, { capture: true })

runMigrations()
applyThemeFromState()

async function bootstrapDesktopApiKeys() {
  if (typeof window === 'undefined') return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    ;(globalThis as typeof globalThis & { isTauri?: boolean }).isTauri = true
    const [localApiKey, remoteApiKey] = await Promise.all([
      invoke<string | null>('get_secret', { key: 'mc-api-key' }).catch(() => null),
      invoke<string | null>('get_secret', { key: 'backend.device-api-key' }).catch(() => null),
    ])
    setDesktopApiKeys({ localApiKey, remoteApiKey })
  } catch {
    // Browser dev sessions do not have Tauri IPC. They can still use public
    // setup/auth routes, but desktop-only API calls need the Tauri key path.
  }
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root was not found.')
}

bootstrapDesktopApiKeys().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
