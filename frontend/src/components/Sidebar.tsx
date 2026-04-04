import React, { useState, useCallback, useRef, useMemo, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CaretRight, Gear, FileText, ArrowUp, ArrowDown, PencilSimple, Trash, FolderPlus, EyeSlash, Palette, X } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import GlobalSearch from './GlobalSearch'
import { NotificationBell } from './NotificationCenter'
import { StatusBar } from './StatusBar'
import { ContextMenu, type ContextMenuState, type ContextMenuItem } from './ContextMenu'
import NavSection from './sidebar/NavSection'
import SectionDivider from './sidebar/SectionDivider'
import SidebarQuickCapture from './sidebar/SidebarQuickCapture'
import ThemeOverrideMenu from './sidebar/ThemeOverrideMenu'
import TypewriterTitle from './sidebar/TypewriterTitle'
import { catRenameInputStyle, fixedDividerStyle, logoStyle, resizeHandleStyle, settingsIconStyle } from './sidebar/styles'
import { type NavItem, navItemsByHref } from '@/lib/nav-items'
import { subscribeSidebarSettings, getSidebarHeaderVisible, getSidebarDefaultWidth, setSidebarDefaultWidth, getSidebarSearchVisible, getSidebarLogoVisible, getSidebarTitleSize } from '@/lib/sidebar-settings'
import { subscribeModules, getEnabledModules } from '@/lib/modules'
import {
  getSidebarConfig, setSidebarConfig, subscribeSidebarConfig,
  setCategoryCollapsed,
  moveItem, renameItem, renameCategory, createCustomModule, softDeleteItem,
} from '@/lib/sidebar-config'
import { useUnreadCounts } from '@/lib/unread-store'
import { getDashboardState, subscribeDashboard, setActivePage } from '@/lib/dashboard-store'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/lib/api'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'
import {
  useThemeState,
  clearPageOverride,
  clearCategoryOverride,
} from '@/lib/theme-store'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SidebarProps {
  width: number
  onWidthChange: (w: number) => void
  draggingRef: React.MutableRefObject<boolean>
}

const PREFETCH_ROUTES: Record<string, { key: readonly string[]; path: string }> = {
  '/': { key: queryKeys.todos, path: '/api/todos' },
  '/missions': { key: queryKeys.missions, path: '/api/missions' },
  '/settings': { key: queryKeys.prefs, path: '/api/prefs' },
}
/* ─── Main Sidebar ───────────────────────────────────────────────────────── */

export default function Sidebar({ width, onWidthChange, draggingRef }: SidebarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [isDragging, setIsDragging] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  // Theme override submenu state
  const [themeOverrideMenu, setThemeOverrideMenu] = useState<{
    x: number; y: number; type: 'page' | 'category'; id: string
  } | null>(null)

  // Inline rename state
  const [editingHref, setEditingHref] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatValue, setEditingCatValue] = useState('')

  // Sidebar drag-to-reorder state
  const [sbDragHref, setSbDragHref] = useState<string | null>(null)
  const [sbDragFromCat, setSbDragFromCat] = useState<string | null>(null)
  const [sbDropCat, setSbDropCat] = useState<string | null>(null)
  const [sbDropIdx, setSbDropIdx] = useState<number | null>(null)

  // External stores
  const headerVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarHeaderVisible)
  const logoVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarLogoVisible)
  const titleSize = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleSize)
  const searchVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarSearchVisible)
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)
  const sidebarConfig = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)

  // Unread badge counts
  const unreadCounts = useUnreadCounts()

  // Dashboard state for sub-items
  const dashboardState = useSyncExternalStore(subscribeDashboard, getDashboardState)

  // Theme state for per-page/per-category overrides
  const themeState = useThemeState()

  // Derived state
  const collapsed = width <= 64

  // Resolve categories from config, filter by enabled modules, apply custom names
  // Also resolve custom modules (hrefs starting with /custom/)
  const resolvedCategories = useMemo(() => {
    return sidebarConfig.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      items: cat.items
        .map(href => {
          // Custom module
          if (href.startsWith('/custom/')) {
            const modId = href.slice('/custom/'.length)
            const customMod = (sidebarConfig.customModules || []).find(m => m.id === modId)
            if (!customMod) return null
            return {
              href,
              label: sidebarConfig.customNames[href] || customMod.name,
              icon: FileText,
            } as NavItem
          }
          // Built-in nav item
          const navItem = navItemsByHref.get(href)
          if (!navItem) return null
          if (navItem.moduleId && !enabledModules.includes(navItem.moduleId)) return null
          return {
            ...navItem,
            label: sidebarConfig.customNames[href] || navItem.label,
          }
        })
        .filter(Boolean) as NavItem[],
    }))
  }, [sidebarConfig, enabledModules])

  // Memoize header layout computations
  const headerLayout = useMemo(() => {
    const titleAvailable = logoVisible ? Math.max(0, width - 16 - 45 - 14) : Math.max(0, width - 32)
    const titleH = titleSize + 16
    const logoH = 57
    const headerHeight = headerVisible ? Math.max(logoVisible ? logoH : 0, titleH) : 0
    const headerOpacity = headerVisible ? 1 : 0
    const titleWidth = logoVisible ? titleAvailable : Math.max(0, width - 32)
    return { headerHeight, headerOpacity, titleWidth }
  }, [logoVisible, width, titleSize, headerVisible])

  // Memoize search visibility
  const searchLayout = useMemo(() => {
    const show = searchVisible && width >= 100
    return { show }
  }, [searchVisible, width])

  // Derive collapsed categories from persisted config
  const collapsedCats = sidebarConfig.collapsedCategories || {}

  // Memoize category toggle map — stable callbacks per category id
  const toggleCallbacksRef = useRef<Map<string, () => void>>(new Map())

  const toggleCategory = useCallback((id: string) => {
    const current = getSidebarConfig().collapsedCategories || {}
    setCategoryCollapsed(id, !(current[id] ?? false))
  }, [])

  // Build stable toggle callbacks — only recreate when categories change
  const categoryToggleCallbacks = useMemo(() => {
    const map = toggleCallbacksRef.current
    const currentIds = new Set(resolvedCategories.map(c => c.id))
    // Clean up stale entries
    for (const key of map.keys()) {
      if (!currentIds.has(key)) map.delete(key)
    }
    // Add missing entries
    for (const id of currentIds) {
      if (!map.has(id)) {
        map.set(id, () => toggleCategory(id))
      }
    }
    return map
  }, [resolvedCategories, toggleCategory])

  // Memoize per-category delay offsets to avoid recalculating in render loop
  const categoryDelayOffsets = useMemo(() => {
    const offsets: number[] = []
    let running = 0
    for (const cat of resolvedCategories) {
      offsets.push(running)
      running += cat.items.length
    }
    return offsets
  }, [resolvedCategories])

  // Compute page override colors for indicator dots
  const pageOverrideColors = useMemo(() => {
    const map: Record<string, string> = {}
    const overrides = themeState.pageOverrides
    if (!overrides) return map
    for (const [href, themeId] of Object.entries(overrides)) {
      const t = BUILT_IN_THEMES.find(bt => bt.id === themeId) ?? themeState.customThemes.find(ct => ct.id === themeId)
      if (t) map[href] = t.colors['accent'] || '#a78bfa'
    }
    return map
  }, [themeState.pageOverrides, themeState.customThemes])

  // Compute category override colors for indicator dots
  const categoryOverrideColors = useMemo(() => {
    const map: Record<string, string> = {}
    const overrides = themeState.categoryOverrides
    if (!overrides) return map
    for (const [catId, themeId] of Object.entries(overrides)) {
      const t = BUILT_IN_THEMES.find(bt => bt.id === themeId) ?? themeState.customThemes.find(ct => ct.id === themeId)
      if (t) map[catId] = t.colors['accent'] || '#a78bfa'
    }
    return map
  }, [themeState.categoryOverrides, themeState.customThemes])

  /* ── Sidebar drag-to-reorder handlers ──────────────────────────────── */

  const handleSbDragStart = useCallback((href: string, catId: string) => {
    setSbDragHref(href)
    setSbDragFromCat(catId)
  }, [])

  const handleSbDragOver = useCallback((catId: string, idx: number) => {
    setSbDropCat(catId)
    setSbDropIdx(idx)
  }, [])

  const handleSbDrop = useCallback((catId: string, idx: number) => {
    if (!sbDragHref || !sbDragFromCat) return
    const config = getSidebarConfig()
    const newCategories = config.categories.map(c => ({ ...c, items: [...c.items] }))

    const sourceCat = newCategories.find(c => c.id === sbDragFromCat)
    if (sourceCat) {
      sourceCat.items = sourceCat.items.filter(h => h !== sbDragHref)
    }
    const targetCat = newCategories.find(c => c.id === catId)
    if (targetCat) {
      let adjustedIdx = idx
      if (sbDragFromCat === catId) {
        const oldIdx = config.categories.find(c => c.id === catId)!.items.indexOf(sbDragHref)
        if (oldIdx < idx) adjustedIdx = Math.max(0, idx - 1)
      }
      targetCat.items.splice(adjustedIdx, 0, sbDragHref)
    }

    setSidebarConfig({ ...config, categories: newCategories })
    setSbDragHref(null)
    setSbDragFromCat(null)
    setSbDropCat(null)
    setSbDropIdx(null)
  }, [sbDragHref, sbDragFromCat])

  const handleSbDragEnd = useCallback(() => {
    setSbDragHref(null)
    setSbDragFromCat(null)
    setSbDropCat(null)
    setSbDropIdx(null)
  }, [])

  /* ── Context menu handlers ───────────────────────────────────────────── */

  const handleItemContextMenu = useCallback((href: string, catId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const config = getSidebarConfig()
    const cat = config.categories.find(c => c.id === catId)
    if (!cat) return
    const idx = cat.items.indexOf(href)
    const isFirst = idx === 0
    const isLast = idx === cat.items.length - 1
    const isCustom = href.startsWith('/custom/')
    const navItem = navItemsByHref.get(href)
    const displayName = config.customNames[href] || (isCustom
      ? (config.customModules || []).find(m => `/custom/${m.id}` === href)?.name || 'Module'
      : navItem?.label || 'Item')

    const items: ContextMenuItem[] = [
      {
        label: 'Rename',
        icon: PencilSimple,
        onClick: () => {
          setEditingHref(href)
          setEditingValue(displayName)
        },
      },
      {
        label: 'Move Up',
        icon: ArrowUp,
        onClick: () => moveItem(href, 'up'),
        disabled: isFirst,
      },
      {
        label: 'Move Down',
        icon: ArrowDown,
        onClick: () => moveItem(href, 'down'),
        disabled: isLast,
      },
    ]

    // Theme override options
    const hasPageOverride = !!(themeState.pageOverrides?.[href])
    items.push({
      label: hasPageOverride ? 'Change Page Theme' : 'Set Page Theme',
      icon: Palette,
      onClick: () => {
        setThemeOverrideMenu({ x: e.clientX, y: e.clientY, type: 'page', id: href })
      },
    })
    if (hasPageOverride) {
      items.push({
        label: 'Clear Page Theme',
        icon: X,
        onClick: () => clearPageOverride(href),
      })
    }

    items.push({
      label: 'Delete',
      icon: Trash,
      onClick: () => {
        softDeleteItem(href)
        if (pathname === href) navigate('/')
      },
      danger: true,
    })

    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [pathname, navigate, themeState.pageOverrides])

  const handleCategoryContextMenu = useCallback((catId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const config = getSidebarConfig()
    const cat = config.categories.find(c => c.id === catId)
    if (!cat) return

    const items: ContextMenuItem[] = [
      {
        label: 'Rename Category',
        icon: PencilSimple,
        onClick: () => {
          setEditingCatId(catId)
          setEditingCatValue(cat.name)
        },
      },
      {
        label: 'Create Module',
        icon: FolderPlus,
        onClick: () => {
          const href = createCustomModule('New Module', catId)
          navigate(href)
          setTimeout(() => {
            setEditingHref(href)
            setEditingValue('New Module')
          }, 50)
        },
      },
      {
        label: 'Move to Unused',
        icon: EyeSlash,
        onClick: () => {
          const cfg = getSidebarConfig()
          const c = cfg.categories.find(cc => cc.id === catId)
          if (!c) return
          setSidebarConfig({
            ...cfg,
            categories: cfg.categories.filter(cc => cc.id !== catId),
            unusedCategories: [...(cfg.unusedCategories || []), c],
          })
        },
      },
    ]

    // Theme override options for category
    const hasCatOverride = !!(themeState.categoryOverrides?.[catId])
    items.push({
      label: hasCatOverride ? 'Change Category Theme' : 'Set Category Theme',
      icon: Palette,
      onClick: () => {
        setThemeOverrideMenu({ x: e.clientX, y: e.clientY, type: 'category', id: catId })
      },
    })
    if (hasCatOverride) {
      items.push({
        label: 'Clear Category Theme',
        icon: X,
        onClick: () => clearCategoryOverride(catId),
      })
    }

    items.push({
      label: 'Delete Category',
      icon: Trash,
      onClick: () => {
        const cfg = getSidebarConfig()
        const c = cfg.categories.find(cc => cc.id === catId)
        if (!c) return
        if (c.items.length > 0) {
          // Move items to first remaining category
          const remaining = cfg.categories.filter(cc => cc.id !== catId)
          if (remaining.length > 0) {
            remaining[0].items = [...remaining[0].items, ...c.items]
          }
          setSidebarConfig({ ...cfg, categories: remaining })
        } else {
          setSidebarConfig({ ...cfg, categories: cfg.categories.filter(cc => cc.id !== catId) })
        }
      },
      danger: true,
      disabled: config.categories.length <= 1,
    })

    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [navigate, themeState.categoryOverrides])

  /* ── Inline editing handlers ─────────────────────────────────────────── */

  const handleEditComplete = useCallback((val?: string) => {
    const name = val ?? editingValue
    if (editingHref && name.trim()) {
      renameItem(editingHref, name.trim())
    }
    setEditingHref(null)
  }, [editingHref, editingValue])

  const handleEditCancel = useCallback(() => {
    setEditingHref(null)
  }, [])

  const handleCatEditComplete = useCallback((val?: string) => {
    const name = val ?? editingCatValue
    if (editingCatId && name.trim()) {
      renameCategory(editingCatId, name.trim())
    }
    setEditingCatId(null)
  }, [editingCatId, editingCatValue])

  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  /* ── Resize handle ─────────────────────────────────────────────────────── */

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.max(64, Math.min(320, startWidth + delta))
      onWidthChange(newWidth)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', function handleUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      const delta = ev.clientX - startX
      const finalWidth = Math.max(64, Math.min(320, startWidth + delta))
      const snapWidth = finalWidth < 100 ? (finalWidth < 82 ? 64 : 100) : finalWidth
      const needsSnap = snapWidth !== finalWidth

      if (needsSnap) {
        draggingRef.current = false
        setIsDragging(false)
        requestAnimationFrame(() => onWidthChange(snapWidth))
      } else {
        onWidthChange(snapWidth)
        draggingRef.current = false
        setTimeout(() => setIsDragging(false), 100)
      }
      // Save as default width (unless collapsed)
      if (snapWidth > 64) setSidebarDefaultWidth(snapWidth)
    })
  }, [width, onWidthChange, draggingRef])

  /* ── Prefetch on hover ─────────────────────────────────────────────────── */

  const handleHoverItem = useCallback((href: string) => {
    const config = PREFETCH_ROUTES[href]
    if (config) {
      queryClient.prefetchQuery({
        queryKey: config.key,
        queryFn: () => api.get(config.path),
        staleTime: 30_000,
      })
    }
  }, [queryClient])

  /* ── Collapse toggle ───────────────────────────────────────────────────── */

  const defaultWidth = useSyncExternalStore(subscribeSidebarSettings, getSidebarDefaultWidth)

  const toggleCollapse = useCallback(() => {
    onWidthChange(collapsed ? defaultWidth : 64)
  }, [collapsed, defaultWidth, onWidthChange])

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <nav aria-label="Main navigation" data-testid="sidebar" data-tour="sidebar" style={{
      width: `${width}px`,
      minWidth: `${width}px`,
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      display: 'flex',
      flexDirection: 'column',
      transition: draggingRef.current ? 'none' : `width 0.2s var(--ease-spring), min-width 0.2s var(--ease-spring)`,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
      pointerEvents: isDragging ? 'none' : 'auto',
    }}>

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && <ContextMenu {...ctxMenu} onClose={closeCtxMenu} />}

      {/* Theme override submenu */}
      {themeOverrideMenu && (
        <ThemeOverrideMenu
          x={themeOverrideMenu.x}
          y={themeOverrideMenu.y}
          type={themeOverrideMenu.type}
          targetId={themeOverrideMenu.id}
          currentOverrideId={
            themeOverrideMenu.type === 'page'
              ? themeState.pageOverrides?.[themeOverrideMenu.id]
              : themeState.categoryOverrides?.[themeOverrideMenu.id]
          }
          onClose={() => setThemeOverrideMenu(null)}
        />
      )}

      {/* ── Logo header — slides up like search when hidden ────────────── */}
      <div style={{
        height: `${headerLayout.headerHeight}px`,
        opacity: headerLayout.headerOpacity,
        overflow: 'hidden',
        transition: 'height 0.25s ease, opacity 0.2s ease',
        flexShrink: 0,
      }}>
        <header style={{
          padding: '0 8px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: logoVisible ? 'flex-start' : 'center',
        }}>
          {logoVisible && (
            <div role="img" aria-label="ClawControl" style={logoStyle} />
          )}
          <div style={{
            overflow: 'hidden',
            minWidth: 0,
            flex: logoVisible ? 1 : undefined,
            width: logoVisible ? undefined : '100%',
            display: 'flex',
            justifyContent: logoVisible ? 'flex-start' : 'center',
          }}>
            <TypewriterTitle availableWidth={headerLayout.titleWidth} />
          </div>
        </header>
      </div>

      {/* ── Search — full size when on, animates away below 140px ── */}
      <div style={{
        height: searchLayout.show ? '46px' : '0px',
        opacity: searchLayout.show ? 1 : 0,
        overflow: 'hidden',
        transition: 'height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
        flexShrink: 0,
        paddingTop: searchLayout.show && !headerVisible ? '8px' : 0,
        pointerEvents: searchLayout.show ? 'auto' : 'none',
      }}>
        <GlobalSearch compact collapsed={collapsed} sidebarWidth={width} />
      </div>

      {/* ── Divider between header/search and nav items ────────────────── */}
      <div style={fixedDividerStyle} />

      {/* ── Scrollable nav items ─────────────────────────────────────────── */}
      <div
        onContextMenu={(e) => {
          // Only fire if right-clicking empty space (not items/categories)
          if (e.target === e.currentTarget) {
            e.preventDefault()
            setCtxMenu({
              x: e.clientX, y: e.clientY,
              items: [
                {
                  label: 'Create Category',
                  icon: FolderPlus,
                  onClick: () => {
                    const config = getSidebarConfig()
                    const id = `custom-${Date.now()}`
                    setSidebarConfig({ ...config, categories: [...config.categories, { id, name: 'New Category', items: [] }] })
                    setEditingCatId(id)
                    setEditingCatValue('New Category')
                  },
                },
                {
                  label: 'Create Module',
                  icon: FileText,
                  onClick: () => {
                    const href = createCustomModule('New Module')
                    navigate(href)
                    setTimeout(() => { setEditingHref(href); setEditingValue('New Module') }, 50)
                  },
                },
                {
                  label: 'Edit Sidebar',
                  icon: Gear,
                  onClick: () => navigate('/settings?section=modules'),
                },
              ],
            })
          }
        }}
        data-tour="module-list"
        style={{
          flex: 1,
          minHeight: 0,
          padding: collapsed ? '4px 8px' : '12px 8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: draggingRef.current ? 'none' : 'padding 0.25s var(--ease-spring)',
        }}
      >
        {resolvedCategories.map((cat, idx) => {
          const isEditingThisCat = editingCatId === cat.id
          return (
            <React.Fragment key={cat.id}>
              {idx > 0 && cat.name && <SectionDivider />}
              {isEditingThisCat ? (
                /* Inline category rename */
                <div style={{ marginBottom: collapsed ? '2px' : '4px', padding: '8px 12px' }}>
                  <input
                    autoFocus
                    aria-label="Rename sidebar category"
                    defaultValue={editingCatValue}
                    onBlur={e => handleCatEditComplete(e.currentTarget.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCatEditComplete(e.currentTarget.value)
                      if (e.key === 'Escape') setEditingCatId(null)
                    }}
                    style={catRenameInputStyle}
                  />
                </div>
              ) : (
                <>
                  <NavSection
                    label={cat.name}
                    items={cat.items}
                    pathname={pathname}
                    collapsed={collapsed}
                    width={width}
                    open={!(collapsedCats[cat.id] ?? false)}
                    onToggle={categoryToggleCallbacks.get(cat.id)!}
                    onHoverItem={handleHoverItem}
                    isDragging={isDragging}
                    delayOffset={categoryDelayOffsets[idx]}
                    categoryId={cat.id}
                    onItemContextMenu={handleItemContextMenu}
                    onCategoryContextMenu={handleCategoryContextMenu}
                    editingHref={editingHref}
                    editingValue={editingValue}
                    onEditingComplete={handleEditComplete}
                    onEditingCancel={handleEditCancel}
                    onDragStart={handleSbDragStart}
                    onDragOver={handleSbDragOver}
                    onDrop={handleSbDrop}
                    onDragEnd={handleSbDragEnd}
                    dragOverIdx={sbDropCat === cat.id ? sbDropIdx : null}
                    dragHref={sbDragHref}
                    overrideColors={pageOverrideColors}
                    categoryOverrideColor={categoryOverrideColors[cat.id]}
                    unreadCounts={unreadCounts}
                  />
                  {/* Dashboard page sub-items -- only when category contains /dashboard, multiple pages, expanded sidebar, and category is open */}
                  {cat.items.some(i => i.href === '/dashboard') &&
                    dashboardState.pages.length > 1 &&
                    width > 120 &&
                    !collapsed &&
                    !(collapsedCats[cat.id] ?? false) && (
                    <div style={{ paddingLeft: 28, marginBottom: 4 }}>
                      {dashboardState.pages.map(page => (
                        <button
                          key={page.id}
                          onClick={() => {
                            setActivePage(page.id)
                            if (pathname !== '/dashboard') navigate('/dashboard')
                          }}
                          aria-label={`Dashboard page: ${page.name}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 12px',
                            fontSize: '11px',
                            color: page.id === dashboardState.activePageId ? 'var(--accent)' : 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            borderRadius: 6,
                            textAlign: 'left',
                            fontFamily: 'inherit',
                            fontWeight: page.id === dashboardState.activePageId ? 600 : 400,
                          }}
                          className="hover-bg"
                        >
                          <span style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: page.id === dashboardState.activePageId ? 'var(--accent)' : 'var(--text-muted)',
                            flexShrink: 0,
                            opacity: 0.6,
                          }} />
                          {page.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── Divider before bottom section ──────────────────────────────── */}
      <div style={fixedDividerStyle} />

      {/* ── Bottom section (non-scrollable) ──────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '8px 8px 0',
      }}>
        {/* Icon bar — row when expanded, column when collapsed, smooth transition */}
        <div style={{
          display: 'flex',
          flexDirection: collapsed ? 'column-reverse' : 'row',
          gap: collapsed ? '0px' : '4px',
          marginBottom: '4px',
        }}>
          {!captureOpen && (
            <Link
              to="/settings"
              title="Gear"
              className="hover-bg"
              data-tour="settings"
              onMouseEnter={() => handleHoverItem('/settings')}
              style={{
                flex: collapsed ? undefined : 1,
                display: 'flex',
                alignItems: 'center',
                padding: '10px 0',
                borderRadius: '10px',
                color: 'var(--text-secondary)',
                background: 'transparent',
                textDecoration: 'none',
                justifyContent: 'center',
              }}
            >
              <Gear size={16} style={settingsIconStyle} />
            </Link>
          )}
          {!captureOpen && <NotificationBell collapsed={true} textOpacity={0} />}
          <SidebarQuickCapture collapsed={true} textOpacity={0} onOpenChange={setCaptureOpen} />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: '100%',
            margin: '4px 0 12px',
            padding: '8px',
            background: 'var(--bg-white-04)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)`,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--hover-bg-bright)'
            e.currentTarget.style.borderColor = 'var(--border-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-white-04)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <span style={{
            display: 'flex',
            transition: `transform 0.3s var(--ease-spring)`,
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          }}>
            <CaretRight size={14} />
          </span>
        </button>
      </div>

      {/* ── Status bar (Discord-style, always visible at bottom) ────────── */}
      <StatusBar collapsed={collapsed} />

      {/* ── Resize handle (right edge) — invisible until hover ─────────── */}
      <div
        onMouseDown={handleResizeStart}
        className="sidebar-resize-handle"
        style={resizeHandleStyle}
      />
    </nav>
  )
}
