

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore, Suspense } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import PageErrorBoundary from '@/components/PageErrorBoundary'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
const CommandPalette = React.lazy(() => import('@/components/CommandPalette'))
const KeyboardShortcutsModal = React.lazy(() => import('@/components/KeyboardShortcutsModal'))
const OnboardingWelcome = React.lazy(() => import('@/components/OnboardingWelcome'))
import { getKeybindings, subscribeKeybindings, isBindingModPressed } from '@/lib/keybindings'
import { getTitleBarVisible, getTitleBarAutoHide, subscribeTitleBarSettings } from '@/lib/titlebar-settings'
import { getSidebarTitleText, getSidebarDefaultWidth, subscribeSidebarSettings } from '@/lib/sidebar-settings'
import { processQueue, getQueueLength, subscribeQueue } from '@/lib/offline-queue'
import { isDemoMode } from '@/lib/demo-data'
import { DemoModeBanner } from '@/components/DemoModeBanner'

const _isDemo = isDemoMode()

export default function LayoutShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isLogin = pathname === '/login' || pathname.startsWith('/auth/')

  const [offline, setOffline] = useState(false)
  const pendingCount = useSyncExternalStore(subscribeQueue, getQueueLength)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('sidebar-width', 260)
  const sidebarDraggingRef = useRef(false)
  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const titleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)

  // Sync sidebar width from settings store changes
  useEffect(() => {
    return subscribeSidebarSettings(() => {
      setSidebarWidth(getSidebarDefaultWidth())
    })
  }, [setSidebarWidth])


  useEffect(() => {
    const on = () => {
      setOffline(false)
      // Replay any mutations that were queued while offline
      processQueue()
    }
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    setOffline(!navigator.onLine)
    // Also try to drain the queue on mount (e.g. after a reload while online)
    if (navigator.onLine) processQueue()
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const tag = (e.target as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

      // Skip all keybindings when focused in an input — let native shortcuts work
      if (inInput) return

      for (const b of bindings) {
        if (b.mod && isBindingModPressed(e, b) && key === b.key) {
          if (b.action === 'undo' || b.action === 'redo') continue
          e.preventDefault()
          if (b.action === 'palette') { setPaletteOpen(prev => !prev); return }
          if (b.action === 'shortcuts') { setShortcutsOpen(prev => !prev); return }
          if (b.route) { navigate(b.route); return }
        }
      }
    },
    [navigate, bindings],
  )

  const showTitleBar = useSyncExternalStore(subscribeTitleBarSettings, getTitleBarVisible)
  const autoHideTitleBar = useSyncExternalStore(subscribeTitleBarSettings, getTitleBarAutoHide)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [titleBarHover, setTitleBarHover] = useState(false)

  // Auto-hide title bar: track mouse position globally
  useEffect(() => {
    if (!autoHideTitleBar && !isFullscreen) return () => {}
    const handler = (e: MouseEvent) => {
      if (e.clientY <= 6) {
        setTitleBarHover(true)
      } else if (e.clientY > 36) {
        setTitleBarHover(false)
      }
    }
    document.addEventListener('mousemove', handler)
    return () => document.removeEventListener('mousemove', handler)
  }, [autoHideTitleBar, isFullscreen])

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  // Track fullscreen state via resize event (fires on fullscreen toggle)
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return
    const check = async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      setIsFullscreen(await getCurrentWindow().isFullscreen())
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (isLogin) {
    return <div><Outlet /></div>
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
    }}>
      {/* Custom macOS-style title bar */}
      <>
        {/* Hover trigger zone when title bar is auto-hidden */}
        {showTitleBar && (isFullscreen || autoHideTitleBar) && !titleBarHover && (
          <div
            onMouseEnter={() => setTitleBarHover(true)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '6px', zIndex: 9999 }}
          />
        )}
        <div
          data-tauri-drag-region
          style={{
            height: showTitleBar ? '30px' : '0px',
            minHeight: showTitleBar ? '30px' : '0px',
            opacity: showTitleBar ? 1 : 0,
            background: 'rgba(10, 10, 12, 0.95)',
            borderBottom: showTitleBar ? '1px solid var(--border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitAppRegion: 'drag',
            userSelect: 'none',
            flexShrink: 0,
            overflow: 'hidden',
            position: (showTitleBar && (isFullscreen || autoHideTitleBar)) ? 'fixed' : 'relative',
            top: 0,
            left: 0,
            right: 0,
            zIndex: (showTitleBar && (isFullscreen || autoHideTitleBar)) ? 9999 : undefined,
            transform: (showTitleBar && (isFullscreen || autoHideTitleBar)) && !titleBarHover ? 'translateY(-100%)' : 'translateY(0)',
            transition: 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease, transform 0.4s var(--ease-spring)',
            pointerEvents: showTitleBar ? 'auto' : 'none',
          } as React.CSSProperties}
        >
          {/* Window controls — left side (macOS style) */}
          <div
            className="traffic-lights"
            style={{ position: 'absolute', left: '10px', display: 'flex', gap: '8px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onMouseEnter={e => {
              e.currentTarget.querySelectorAll<HTMLElement>('.tl-icon').forEach(el => el.style.opacity = '1')
            }}
            onMouseLeave={e => {
              e.currentTarget.querySelectorAll<HTMLElement>('.tl-icon').forEach(el => el.style.opacity = '0')
            }}
          >
            <button
              onClick={async () => {
                if (window.__TAURI_INTERNALS__) {
                  const { getCurrentWindow } = await import('@tauri-apps/api/window')
                  getCurrentWindow().hide()
                }
              }}
              aria-label="Hide to tray"
              style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57', border: 'none', cursor: 'pointer', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease' }}
            >
              <span className="tl-icon" style={{ opacity: 0, fontSize: '8px', lineHeight: 1, color: 'rgba(0,0,0,0.6)', fontWeight: 700, transition: 'opacity 0.15s ease', position: 'absolute' }}>&times;</span>
            </button>
            <button
              onClick={async () => {
                if (window.__TAURI_INTERNALS__) {
                  const { getCurrentWindow } = await import('@tauri-apps/api/window')
                  getCurrentWindow().hide()
                }
              }}
              aria-label="Minimize to tray"
              style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#febc2e', border: 'none', cursor: 'pointer', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease' }}
            >
              <span className="tl-icon" style={{ opacity: 0, fontSize: '10px', lineHeight: 1, color: 'rgba(0,0,0,0.6)', fontWeight: 700, transition: 'opacity 0.15s ease', position: 'absolute', marginTop: '-2px' }}>&minus;</span>
            </button>
            <button
              onClick={async () => {
                if (window.__TAURI_INTERNALS__) {
                  const { getCurrentWindow } = await import('@tauri-apps/api/window')
                  const win = getCurrentWindow()
                  const isFs = await win.isFullscreen()
                  await win.setFullscreen(!isFs)
                }
              }}
              aria-label="Fullscreen"
              style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28c840', border: 'none', cursor: 'pointer', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease' }}
            >
              <span className="tl-icon" style={{ opacity: 0, fontSize: '7px', lineHeight: 1, color: 'rgba(0,0,0,0.6)', fontWeight: 700, transition: 'opacity 0.15s ease', position: 'absolute' }}>&#x2197;</span>
            </button>
          </div>
          {/* Title centered */}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
            {titleText || 'OpenClaw'}
          </span>
        </div>
      </>
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        draggingRef={sidebarDraggingRef}
      />
      <main id="main-content" style={{
        flex: 1,
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column' }}>
        {(offline || pendingCount > 0) && (
          <div role="alert" aria-live="assertive" style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            color: 'rgba(245, 158, 11, 0.9)',
            marginBottom: 16,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span>
              {offline
                ? 'You\u2019re offline \u2014 showing cached data'
                : 'Back online \u2014 syncing changes\u2026'}
            </span>
            {pendingCount > 0 && (
              <span style={{
                background: 'rgba(245, 158, 11, 0.25)',
                borderRadius: '10px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
                {pendingCount} pending
              </span>
            )}
          </div>
        )}
        {_isDemo && <DemoModeBanner />}
        <PageErrorBoundary>
          <div key={pathname} style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'pageEnter 0.25s var(--ease-spring) both' }}>
            <Outlet />
          </div>
        </PageErrorBoundary>
        </div>
      </main>
      <Suspense fallback={null}>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <OnboardingWelcome />
      </Suspense>
      </div>
    </div>
  )
}
