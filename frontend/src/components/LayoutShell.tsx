

import React, { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore, Suspense } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import { GlobalAssistantDrawer } from '@/components/assistant/GlobalAssistantLauncher'
import PageErrorBoundary from '@/components/PageErrorBoundary'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
const CommandPalette = React.lazy(() => import('@/components/CommandPalette'))
const KeyboardShortcutsModal = React.lazy(() => import('@/components/KeyboardShortcutsModal'))
const SetupWizard = React.lazy(() => import('@/components/SetupWizard'))
const ThemePicker = React.lazy(() => import('@/components/ThemePicker'))
const GuidedTour = React.lazy(() => import('@/components/GuidedTour'))
import { getKeybindings, subscribeKeybindings, isBindingModPressed, matchesExtraModifier } from '@/lib/keybindings'
import { getTitleBarVisible, getTitleBarAutoHide, subscribeTitleBarSettings } from '@/lib/titlebar-settings'
import { getSidebarTitleText, getSidebarDefaultWidth, subscribeSidebarSettings } from '@/lib/sidebar-settings'
import { isDemoMode } from '@/lib/demo-data'
import { getSetupCompletionSnapshot, shouldAutoOpenWizard, subscribeSetupCompletion } from '@/lib/wizard-store'
import { useTourState } from '@/lib/tour-store'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { IconContext } from '@phosphor-icons/react'
import { ToastProvider } from '@/components/ui/Toast'
import { NavigationProgressBar } from '@/components/ui/ProgressBar'
import { api } from '@/lib/api'
import { getAccountSyncStatus } from '@/lib/account-sync'
import { useThemeState } from '@/lib/theme-store'
import { getThemeById } from '@/lib/theme-definitions'
import { getSidebarConfig } from '@/lib/sidebar-config'
import { startScheduleTimer } from '@/lib/theme-scheduling'
import { useApprovals } from '@/hooks/useApprovals'

// Module-level scroll position map -- persists across re-renders without causing re-renders.
// Capped at 50 entries to prevent memory leaks.
const scrollPositions = new Map<string, number>()
const MAX_SCROLL_ENTRIES = 50
const ASSISTANT_MIN_WIDTH = 280
const ASSISTANT_DEFAULT_WIDTH = 300
const ASSISTANT_MAX_WIDTH = 420

function saveScrollPosition(pathname: string, scrollTop: number) {
  scrollPositions.set(pathname, scrollTop)
  if (scrollPositions.size > MAX_SCROLL_ENTRIES) {
    // Delete oldest entry (first key in insertion order)
    const firstKey = scrollPositions.keys().next().value
    if (firstKey !== undefined) scrollPositions.delete(firstKey)
  }
}

export default function LayoutShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isLogin = pathname === '/login' || pathname.startsWith('/auth/')
  const isChatRoute = pathname === '/chat'
  const isMediaRoute = pathname === '/media'
  const isDemo = isDemoMode()

  const shouldShowSetupWizard = useSyncExternalStore(subscribeSetupCompletion, getSetupCompletionSnapshot)
  const [showWizard, setShowWizard] = useState(() => shouldAutoOpenWizard())
  const [offline, setOffline] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [recoveryReminderKey, setRecoveryReminderKey] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('sidebar-width', 260)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantDockVisible, setAssistantDockVisible] = useState(false)
  const [assistantDockClosing, setAssistantDockClosing] = useState(false)
  const [assistantWidth, setAssistantWidth] = useLocalStorageState('assistant-width', ASSISTANT_DEFAULT_WIDTH)
  const [mediaMobileShell, setMediaMobileShell] = useState(false)
  const sidebarDraggingRef = useRef(false)
  const assistantCollapsedSidebarRef = useRef(false)
  const assistantPrevSidebarWidthRef = useRef(sidebarWidth)
  const mainRef = useRef<HTMLElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevPathnameRef = useRef(pathname)
  const autoCollapsedRef = useRef(false)
  const prevWidthBeforeAutoCollapse = useRef(sidebarWidth)
  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const titleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)
  const tourState = useTourState()

  // Keep approval badge count synced globally (polls gateway every 3s)
  useApprovals()

  useEffect(() => {
    document.documentElement.dataset.clawRoute = pathname
  }, [pathname])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setMediaMobileShell(false)
      return undefined
    }
    const mediaQuery = window.matchMedia('(max-width: 920px)')
    const update = () => setMediaMobileShell(isMediaRoute && mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [isMediaRoute])

  useEffect(() => {
    if (!shouldShowSetupWizard) setShowWizard(false)
  }, [shouldShowSetupWizard])

  useEffect(() => {
    if (isLogin || isDemo) return
    let cancelled = false

    async function checkRecoveryReminder() {
      try {
        const [session, sync] = await Promise.all([
          api.get<{ authenticated: boolean; user?: { id?: string } }>('/api/auth/session'),
          getAccountSyncStatus(),
        ])
        const userId = session.user?.id ?? 'current'
        const key = `account-sync-recovery-reminder:${userId}`
        if (!cancelled && sync.needs_recovery_key && !localStorage.getItem(key)) {
          setRecoveryReminderKey(key)
        } else if (!cancelled) {
          setRecoveryReminderKey(null)
        }
      } catch {
        // Keep the shell quiet if auth/sync probing is unavailable.
      }
    }

    void checkRecoveryReminder()
    const timeout = setTimeout(() => { void checkRecoveryReminder() }, 8000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [isLogin, isDemo])

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
    if (assistantOpen) {
      if (sidebarWidth > 64) {
        assistantPrevSidebarWidthRef.current = sidebarWidth
        assistantCollapsedSidebarRef.current = true
        setSidebarWidth(64)
      }
      return
    }
    if (!assistantDockVisible && assistantCollapsedSidebarRef.current) {
      assistantCollapsedSidebarRef.current = false
      setSidebarWidth(Math.max(180, assistantPrevSidebarWidthRef.current))
    }
  }, [assistantDockVisible, assistantOpen, sidebarWidth, setSidebarWidth])

  useEffect(() => {
    if (assistantOpen) {
      setAssistantDockVisible(true)
      setAssistantDockClosing(false)
      return
    }
    if (!assistantDockVisible) return
    setAssistantDockClosing(true)
    const timeout = window.setTimeout(() => {
      setAssistantDockVisible(false)
      setAssistantDockClosing(false)
    }, 240)
    return () => window.clearTimeout(timeout)
  }, [assistantDockVisible, assistantOpen])

  const handleAssistantResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = assistantWidth
    const maxWidth = Math.min(ASSISTANT_MAX_WIDTH, Math.max(ASSISTANT_MIN_WIDTH, window.innerWidth - 64 - 520))

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX
      const next = Math.max(ASSISTANT_MIN_WIDTH, Math.min(maxWidth, startWidth + delta))
      setAssistantWidth(next)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [assistantWidth, setAssistantWidth])

  // Scroll restoration: save position on route change, restore on return
  useEffect(() => {
    const prev = prevPathnameRef.current
    if (prev !== pathname) {
      // Save scroll position for the page we're leaving
      const container = scrollContainerRef.current
      if (container) {
        saveScrollPosition(prev, container.scrollTop)
      }
      prevPathnameRef.current = pathname

      // Restore scroll position for the page we're entering
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current
        if (c) {
          const saved = scrollPositions.get(pathname)
          c.scrollTop = saved ?? 0
        }
      })
    }
  }, [pathname])

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
  const handleTitleBarMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!window.__TAURI_INTERNALS__ || event.button !== 0) return

    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, a, [data-no-window-drag]')) return

    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => {})
  }, [])

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

  const iconContextValue = useMemo(() => ({ size: 20, weight: 'bold' as const }), [])

  if (isLogin) {
    return <div><Outlet /></div>
  }

  const mediaDedicatedShell = mediaMobileShell
  const titleBarVisible = showTitleBar && !mediaMobileShell

  return (
    <IconContext.Provider value={iconContextValue}>
    <ToastProvider>
    <div className={`app-window-frame${isFullscreen ? ' app-window-frame-fullscreen' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
      background: 'var(--bg-base)',
    }}>
      <NavigationProgressBar />
      {/* Custom macOS-style title bar */}
      <>
        {/* Hover trigger zone when title bar is auto-hidden */}
        {titleBarVisible && (isFullscreen || autoHideTitleBar) && !titleBarHover && (
          <div
            onMouseEnter={() => setTitleBarHover(true)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '6px', zIndex: 9999 }}
          />
        )}
        <div
          data-tauri-drag-region
          onMouseDown={handleTitleBarMouseDown}
          style={{
            height: titleBarVisible ? '30px' : '0px',
            minHeight: titleBarVisible ? '30px' : '0px',
            opacity: titleBarVisible ? 1 : 0,
            background: 'var(--bg-modal)',
            borderBottom: titleBarVisible ? '1px solid var(--border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitAppRegion: 'drag',
            userSelect: 'none',
            flexShrink: 0,
            overflow: 'hidden',
            position: (titleBarVisible && (isFullscreen || autoHideTitleBar)) ? 'fixed' : 'relative',
            top: 0,
            left: 0,
            right: 0,
            zIndex: (titleBarVisible && (isFullscreen || autoHideTitleBar)) ? 9999 : undefined,
            transform: (titleBarVisible && (isFullscreen || autoHideTitleBar)) && !titleBarHover ? 'translateY(-100%)' : 'translateY(0)',
            transition: 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease, transform 0.4s var(--ease-spring)',
            pointerEvents: titleBarVisible ? 'auto' : 'none',
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
            {titleText || 'Hermes Agent'}
          </span>
        </div>
      </>
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
      {!mediaDedicatedShell && (
        <Sidebar
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          draggingRef={sidebarDraggingRef}
          assistantOpen={assistantOpen}
          onAssistantOpenChange={setAssistantOpen}
        />
      )}
      <main ref={mainRef} id="main-content" data-testid="main-content" data-tour="dashboard" style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        background: isMediaRoute ? 'var(--bg-base)' : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        containerType: 'inline-size',
        containerName: 'main-content',
      }}>
        <div ref={scrollContainerRef} style={{
          flex: 1,
          minHeight: 0,
          overflowY: isChatRoute ? 'hidden' : 'auto',
          overflowX: isMediaRoute ? 'hidden' : undefined,
          overscrollBehavior: isChatRoute ? 'contain' : undefined,
          padding: isMediaRoute ? '0' : '20px 28px',
          background: isMediaRoute ? 'var(--bg-base)' : undefined,
          display: 'flex',
          flexDirection: 'column',
        }}>
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
        {isDemo && <DemoModeBanner />}
        {recoveryReminderKey && (
          <div role="status" aria-live="polite" style={{
            background: 'var(--accent-a10)',
            border: '1px solid var(--accent-a25)',
            borderRadius: '6px',
            padding: '9px 12px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: 16,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <span>Account sync is unlocked. Add a recovery key for this account.</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => navigate('/settings?section=status')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--accent-solid)',
                  color: 'var(--text-on-color)',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Open Sync
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(recoveryReminderKey, 'dismissed')
                  setRecoveryReminderKey(null)
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  padding: '6px 4px',
                  cursor: 'pointer',
                }}
              >
                Later
              </button>
            </div>
          </div>
        )}
        <PageErrorBoundary key={pathname}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, minHeight: 0, position: 'relative', animation: isMediaRoute ? 'none' : 'pageEnter 0.15s ease-out both' }}>
            <Outlet />
          </div>
        </PageErrorBoundary>
        </div>
      </main>
      {assistantDockVisible && (
        <aside
          data-testid="global-assistant-dock"
          className="global-assistant-dock-shell"
          data-closing={assistantDockClosing ? 'true' : 'false'}
          style={{
            width: Math.max(ASSISTANT_MIN_WIDTH, Math.min(ASSISTANT_MAX_WIDTH, assistantWidth)),
            flex: '0 0 auto',
            minWidth: ASSISTANT_MIN_WIDTH,
            maxWidth: ASSISTANT_MAX_WIDTH,
            height: '100%',
            minHeight: 0,
            background: 'var(--bg-panel)',
            display: 'flex',
            overflow: 'hidden',
            pointerEvents: assistantDockClosing ? 'none' : 'auto',
            animation: assistantDockClosing
              ? 'assistantDockShellOut 240ms cubic-bezier(0.7, 0, 0.84, 0) both'
              : 'assistantDockShellIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <GlobalAssistantDrawer
            docked
            onClose={() => setAssistantOpen(false)}
            onResizeStart={handleAssistantResizeStart}
          />
        </aside>
      )}
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
      {tourState.active && (
        <Suspense fallback={null}>
          <GuidedTour />
        </Suspense>
      )}
      </div>
    </div>
    </ToastProvider>
    </IconContext.Provider>
  )
}
