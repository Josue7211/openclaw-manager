

import React, { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore, Suspense } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import PageErrorBoundary from '@/components/PageErrorBoundary'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
const CommandPalette = React.lazy(() => import('@/components/CommandPalette'))
const KeyboardShortcutsModal = React.lazy(() => import('@/components/KeyboardShortcutsModal'))
const SetupWizard = React.lazy(() => import('@/components/SetupWizard'))
const ThemePicker = React.lazy(() => import('@/components/ThemePicker'))
import { getKeybindings, subscribeKeybindings, isBindingModPressed, matchesExtraModifier } from '@/lib/keybindings'
import { getTitleBarVisible, getTitleBarAutoHide, subscribeTitleBarSettings } from '@/lib/titlebar-settings'
import { getSidebarTitleText, getSidebarDefaultWidth, subscribeSidebarSettings } from '@/lib/sidebar-settings'
import { isDemoMode } from '@/lib/demo-data'
import { isFirstRun } from '@/lib/wizard-store'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { IconContext } from '@phosphor-icons/react'
import { ToastProvider } from '@/components/ui/Toast'
import { NavigationProgressBar } from '@/components/ui/ProgressBar'
import { useThemeState } from '@/lib/theme-store'
import { getThemeById } from '@/lib/theme-definitions'
import { getSidebarConfig } from '@/lib/sidebar-config'
import { startScheduleTimer } from '@/lib/theme-scheduling'

const _isDemo = isDemoMode()

export default function LayoutShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isLogin = pathname === '/login' || pathname.startsWith('/auth/')

  const [showWizard, setShowWizard] = useState(() => isFirstRun())
  const [offline, setOffline] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('sidebar-width', 260)
  const sidebarDraggingRef = useRef(false)
  const mainRef = useRef<HTMLElement>(null)
  const autoCollapsedRef = useRef(false)
  const prevWidthBeforeAutoCollapse = useRef(sidebarWidth)
  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const titleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)

  // Sync sidebar width from settings store changes
  useEffect(() => {
    return subscribeSidebarSettings(() => {
      setSidebarWidth(getSidebarDefaultWidth())
    })
  }, [setSidebarWidth])

  // Auto-collapse sidebar when main content area drops below 900px
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const observer = new ResizeObserver((entries) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const mainWidth = entries[0].contentRect.width
        // Auto-collapse when main content is too narrow
        if (mainWidth < 900 && sidebarWidth > 64) {
          prevWidthBeforeAutoCollapse.current = sidebarWidth
          autoCollapsedRef.current = true
          setSidebarWidth(64)
        }
        // Note: do NOT auto-expand — user controls expansion manually
      }, 100)
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [sidebarWidth, setSidebarWidth])

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
      const key = e.key.toLowerCase()
      const tag = (e.target as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

      // Skip all keybindings when focused in an input — let native shortcuts work
      if (inInput) return

      for (const b of bindings) {
        if (b.mod && isBindingModPressed(e, b) && key === b.key && matchesExtraModifier(e, b)) {
          if (b.action === 'undo' || b.action === 'redo') continue
          e.preventDefault()
          if (b.action === 'palette') { setPaletteOpen(prev => !prev); return }
          if (b.action === 'shortcuts') { setShortcutsOpen(prev => !prev); return }
          if (b.action === 'theme-picker') { setThemePickerOpen(prev => !prev); return }
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

  // Per-page / per-category theme override — apply scoped CSS variables to <main>
  const themeState = useThemeState()
  useEffect(() => {
    const mainEl = mainRef.current
    if (!mainEl) return

    // Check for page-level override first (most specific)
    const pageOverrideId = themeState.pageOverrides?.[pathname]

    // If no page override, check category override
    let overrideId = pageOverrideId
    if (!overrideId && themeState.categoryOverrides) {
      const config = getSidebarConfig()
      for (const cat of config.categories) {
        if (cat.items.includes(pathname)) {
          overrideId = themeState.categoryOverrides[cat.id]
          break
        }
      }
    }

    if (overrideId) {
      const def = getThemeById(overrideId)
        ?? themeState.customThemes.find(t => t.id === overrideId)
      if (def) {
        for (const [key, value] of Object.entries(def.colors)) {
          mainEl.style.setProperty(`--${key}`, value)
        }
        return () => {
          // Clean up: remove all inline custom properties
          for (const key of Object.keys(def.colors)) {
            mainEl.style.removeProperty(`--${key}`)
          }
        }
      }
    }

    // No override — remove any previously set inline properties
    // We iterate a snapshot of the style properties to avoid mutation during iteration
    const propsToRemove: string[] = []
    for (let i = 0; i < mainEl.style.length; i++) {
      const prop = mainEl.style[i]
      if (prop.startsWith('--')) {
        propsToRemove.push(prop)
      }
    }
    for (const prop of propsToRemove) {
      mainEl.style.removeProperty(prop)
    }
  }, [pathname, themeState.pageOverrides, themeState.categoryOverrides, themeState.customThemes])

  // Schedule timer — auto-switch themes based on schedule
  useEffect(() => {
    if (!themeState.schedule || themeState.schedule.type === 'none') return
    const cleanup = startScheduleTimer()
    return cleanup
  }, [themeState.schedule])

  if (isLogin) {
    return <div><Outlet /></div>
  }

  const iconContextValue = useMemo(() => ({ size: 20, weight: 'bold' as const }), [])

  return (
    <IconContext.Provider value={iconContextValue}>
    <ToastProvider>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
    }}>
      <NavigationProgressBar />
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
            background: 'var(--bg-modal)',
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
              style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' /* macOS traffic light -- intentionally hardcoded */, border: 'none', cursor: 'pointer', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease' }}
            >
              <span className="tl-icon" style={{ opacity: 0, fontSize: '8px', lineHeight: 1, color: 'var(--overlay-heavy)', fontWeight: 700, transition: 'opacity 0.15s ease', position: 'absolute' }}>&times;</span>
            </button>
            <button
              onClick={async () => {
                if (window.__TAURI_INTERNALS__) {
                  const { getCurrentWindow } = await import('@tauri-apps/api/window')
                  getCurrentWindow().hide()
                }
              }}
              aria-label="Minimize to tray"
              style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#febc2e' /* macOS traffic light -- intentionally hardcoded */, border: 'none', cursor: 'pointer', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease' }}
            >
              <span className="tl-icon" style={{ opacity: 0, fontSize: '10px', lineHeight: 1, color: 'var(--overlay-heavy)', fontWeight: 700, transition: 'opacity 0.15s ease', position: 'absolute', marginTop: '-2px' }}>&minus;</span>
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
              style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28c840' /* macOS traffic light -- intentionally hardcoded */, border: 'none', cursor: 'pointer', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease' }}
            >
              <span className="tl-icon" style={{ opacity: 0, fontSize: '7px', lineHeight: 1, color: 'var(--overlay-heavy)', fontWeight: 700, transition: 'opacity 0.15s ease', position: 'absolute' }}>&#x2197;</span>
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
      <main ref={mainRef} id="main-content" data-testid="main-content" style={{
        flex: 1,
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        containerType: 'inline-size',
        containerName: 'main-content',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column' }}>
        {offline && (
          <div role="alert" aria-live="assertive" style={{
            background: 'var(--warning-a12)',
            border: '1px solid var(--warning-a30)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            color: 'var(--warning)',
            marginBottom: 16,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span>You&apos;re offline &mdash; showing cached data</span>
          </div>
        )}
        {_isDemo && <DemoModeBanner />}
        <PageErrorBoundary key={pathname}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'pageEnter 0.25s var(--ease-spring) both' }}>
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
      {showWizard && (
        <Suspense fallback={null}>
          <SetupWizard onComplete={() => setShowWizard(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {themePickerOpen && <ThemePicker open={themePickerOpen} onClose={() => setThemePickerOpen(false)} />}
      </Suspense>
      </div>
    </div>
    </ToastProvider>
    </IconContext.Provider>
  )
}
