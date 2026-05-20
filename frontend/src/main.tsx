import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { runMigrations } from './lib/migrations'

window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason?.message ?? event.reason ?? '')
  if (reason.includes('__TAURI__') || reason.includes('Tauri')) {
    event.preventDefault()
  }
})

runMigrations()

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root was not found.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
