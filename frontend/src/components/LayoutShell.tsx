

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import QuickCaptureWidget from '@/components/QuickCaptureWidget'
import CommandPalette from '@/components/CommandPalette'
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal'

const GO_ROUTES: Record<string, string> = {
  h: '/',
  d: '/dashboard',
  a: '/agents',
  m: '/missions',
  c: '/calendar',
  t: '/todos',
  e: '/email',
  s: '/settings',
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export default function LayoutShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isLogin = pathname === '/login' || pathname.startsWith('/auth/')

  const [offline, setOffline] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const gPressedAt = useRef<number>(0)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    setOffline(!navigator.onLine)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K: toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
        return
      }

      // Don't handle single-key shortcuts when typing in an input
      if (isInputFocused()) return

      // Don't handle when modifiers are held (except shift for ?)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // ? key: show keyboard shortcuts (Shift+/ on US keyboards)
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      // G key: mark timestamp for "go-to" shortcut
      if (e.key === 'g' || e.key === 'G') {
        gPressedAt.current = Date.now()
        return
      }

      // Check if G was pressed within last 500ms for go-to navigation
      const timeSinceG = Date.now() - gPressedAt.current
      if (timeSinceG < 500) {
        const route = GO_ROUTES[e.key.toLowerCase()]
        if (route) {
          e.preventDefault()
          gPressedAt.current = 0
          navigate(route)
          return
        }
      }
    },
    [navigate],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  if (isLogin) {
    return <div><Outlet /></div>
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
    }}>
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          left: '-10000px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
        onFocus={(e) => {
          e.currentTarget.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10000;padding:8px 16px;background:#0c0d11;color:#00e5cc;border:2px solid #00e5cc;border-radius:6px;font-size:14px;text-decoration:none;'
        }}
        onBlur={(e) => {
          e.currentTarget.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;'
        }}
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 28px',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1,
      }}>
        {offline && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            color: 'rgba(245, 158, 11, 0.9)',
            marginBottom: 16,
            flexShrink: 0,
          }}>
            You&apos;re offline &mdash; showing cached data
          </div>
        )}
        <Outlet />
      </main>
      <QuickCaptureWidget />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
