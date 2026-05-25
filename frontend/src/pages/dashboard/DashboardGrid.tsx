/**
 * DashboardGrid — the reactive grid engine powering the dashboard.
 *
 * Renders widgets from the dashboard store in a react-grid-layout Responsive
 * grid with drag/resize/snap behavior. Layout changes are debounced and
 * persisted back to the store.
 *
 * Breakpoints: xl:1400 / lg:900 / md:600 / sm:0
 * Columns:     xl:12   / lg:12  / md:8   / sm:4
 */

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { useDashboardStore, updatePageLayouts, removeWidget, setEditMode } from '@/lib/dashboard-store'
import type { LayoutItem, DashboardPage } from '@/lib/dashboard-store'
import { WidgetWrapper } from '@/components/dashboard/WidgetWrapper'
import { useLongPress } from '@/components/dashboard/DashboardEditBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { SquaresFour } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREAKPOINTS = { xl: 1400, lg: 900, md: 600, sm: 0 }
const COLS = { xl: 12, lg: 12, md: 8, sm: 4 }
const DEFAULT_ROW_HEIGHT = 80
const MIN_ROW_HEIGHT = 64
const MAX_ROW_HEIGHT = 180
const MARGIN: [number, number] = [16, 16]
const GRID_BOTTOM_GUTTER = 24
const DEBOUNCE_MS = 300

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getBreakpoint(width: number): keyof typeof BREAKPOINTS {
  if (width >= BREAKPOINTS.xl) return 'xl'
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  return 'sm'
}

function sortLayoutForView(layout: LayoutItem[]): LayoutItem[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
}

function canPlace(
  occupied: boolean[][],
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
): boolean {
  if (x + w > cols) return false
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (occupied[yy]?.[xx]) return false
    }
  }
  return true
}

function markPlaced(occupied: boolean[][], x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy += 1) {
    occupied[yy] ??= []
    for (let xx = x; xx < x + w; xx += 1) {
      occupied[yy][xx] = true
    }
  }
}

function getAutoPackedRows(layout: LayoutItem[], cols: number): number {
  const occupied: boolean[][] = []
  let maxRows = 1

  for (const item of sortLayoutForView(layout)) {
    const w = clamp(item.w, 1, cols)
    const h = Math.max(1, item.h)
    let placed = false

    for (let y = 0; !placed; y += 1) {
      for (let x = 0; x <= cols - w; x += 1) {
        if (!canPlace(occupied, x, y, w, h, cols)) continue
        markPlaced(occupied, x, y, w, h)
        maxRows = Math.max(maxRows, y + h)
        placed = true
        break
      }
    }
  }

  return maxRows
}

function autoPackLayout(layout: LayoutItem[], cols: number): LayoutItem[] {
  const occupied: boolean[][] = []
  const packed: LayoutItem[] = []

  for (const item of sortLayoutForView(layout)) {
    const w = clamp(item.w, 1, cols)
    const h = Math.max(1, item.h)
    let placed = false

    for (let y = 0; !placed; y += 1) {
      for (let x = 0; x <= cols - w; x += 1) {
        if (!canPlace(occupied, x, y, w, h, cols)) continue
        markPlaced(occupied, x, y, w, h)
        packed.push({ ...item, x, y, w, h })
        placed = true
        break
      }
    }
  }

  return packed
}

function getViewportFittedRowHeight(container: HTMLElement | null, layout: LayoutItem[], cols: number): number {
  if (!container || layout.length === 0 || typeof window === 'undefined') return DEFAULT_ROW_HEIGHT

  const rect = container.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const availableHeight = viewportHeight - rect.top - GRID_BOTTOM_GUTTER
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return DEFAULT_ROW_HEIGHT

  const rows = getAutoPackedRows(layout, cols)
  const totalRowGaps = Math.max(0, rows - 1) * MARGIN[1]
  const fittedHeight = Math.floor((availableHeight - totalRowGaps) / rows)
  return clamp(fittedHeight, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardGridProps {
  pageId: string
  editMode: boolean
  wobbleEnabled: boolean
  /** Override: provide page data directly instead of reading from dashboard-store */
  page?: DashboardPage
  /** Override: custom layout change handler instead of dashboard-store updatePageLayouts */
  onLayoutChange?: (pageId: string, layouts: Record<string, LayoutItem[]>) => void
  /** Override: custom remove widget handler instead of dashboard-store removeWidget */
  onRemoveWidget?: (pageId: string, widgetId: string) => void
  /** Override: custom edit mode setter instead of dashboard-store setEditMode */
  onSetEditMode?: (editing: boolean) => void
  /** Override: custom config update handler instead of dashboard-store updateWidgetConfig */
  onUpdateConfig?: (pageId: string, widgetId: string, config: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DashboardGrid = React.memo(function DashboardGrid({
  pageId,
  editMode,
  wobbleEnabled,
  page: pageProp,
  onLayoutChange: onLayoutChangeProp,
  onRemoveWidget: onRemoveWidgetProp,
  onSetEditMode,
  onUpdateConfig,
}: DashboardGridProps) {
  const dashState = useDashboardStore()
  // Use provided page prop or fall back to reading from dashboard-store
  const page = pageProp ?? dashState.pages.find(p => p.id === pageId)
  const { width, mounted: widthMounted, containerRef } = useContainerWidth({ initialWidth: 1280 })
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT)

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long-press: enter edit mode on any widget
  const enterEditMode = onSetEditMode ?? setEditMode
  const longPressHandlers = useLongPress(() => {
    if (!editMode) enterEditMode(true)
  })

  // Collect all unique widget IDs across all breakpoints.
  // Depend on page.id + page.layouts (not the page object reference) so the
  // memo recomputes reliably when switching between dashboard tabs.
  const pageId_ = page?.id
  const pageLayouts = page?.layouts
  const activeBreakpoint = getBreakpoint(width)
  const activeCols = COLS[activeBreakpoint]
  const displayLayouts = useMemo(() => {
    if (!pageLayouts) return {}
    const packedLayouts: Record<string, LayoutItem[]> = {}
    for (const [breakpoint, layout] of Object.entries(pageLayouts)) {
      const cols = COLS[breakpoint as keyof typeof COLS] ?? COLS.lg
      packedLayouts[breakpoint] = autoPackLayout(layout as LayoutItem[], cols)
    }
    return packedLayouts
  }, [pageLayouts])
  const activeLayout = useMemo(() => {
    if (!displayLayouts) return []
    return displayLayouts[activeBreakpoint] ?? displayLayouts.lg ?? Object.values(displayLayouts)[0] ?? []
  }, [activeBreakpoint, displayLayouts])
  const viewItems = useMemo(() => sortLayoutForView(activeLayout), [activeLayout])
  const widgetItems = useMemo(() => {
    if (!pageId_ || !pageLayouts) return []

    const seen = new Set<string>()
    const items: LayoutItem[] = []

    // Gather unique widgets from all breakpoint layouts
    for (const layoutItems of Object.values(pageLayouts)) {
      for (const item of layoutItems as LayoutItem[]) {
        if (!seen.has(item.i)) {
          seen.add(item.i)
          items.push(item)
        }
      }
    }

    return items
  }, [pageId_, pageLayouts])

  useEffect(() => {
    if (!widthMounted) return

    const updateRowHeight = () => {
      setRowHeight(getViewportFittedRowHeight(containerRef.current, activeLayout, activeCols))
    }

    updateRowHeight()
    window.addEventListener('resize', updateRowHeight)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateRowHeight)
      : null
    if (resizeObserver) {
      if (containerRef.current) resizeObserver.observe(containerRef.current)
      if (containerRef.current?.parentElement) resizeObserver.observe(containerRef.current.parentElement)
    }

    return () => {
      window.removeEventListener('resize', updateRowHeight)
      resizeObserver?.disconnect()
    }
  }, [activeCols, activeLayout, containerRef, widthMounted])

  // Debounced layout change handler
  const layoutUpdater = onLayoutChangeProp ?? updatePageLayouts
  const handleLayoutChange = useCallback(
    (_layout: any, allLayouts: any) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        layoutUpdater(pageId, allLayouts as Record<string, LayoutItem[]>)
      }, DEBOUNCE_MS)
    },
    [pageId, layoutUpdater],
  )

  // Remove widget callback factory
  const widgetRemover = onRemoveWidgetProp ?? removeWidget
  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      widgetRemover(pageId, widgetId)
    },
    [pageId, widgetRemover],
  )

  // Empty state
  if (!page || widgetItems.length === 0) {
    return (
      <EmptyState
        icon={SquaresFour}
        title="No widgets yet"
        description="Add widgets to build your dashboard."
      />
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Grid dot overlay for edit mode */}
      {editMode && (
        <div className="dashboard-grid-lines visible" />
      )}

      {widthMounted && !editMode && (
        <div
          className="dashboard-smart-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
            gridAutoRows: `${rowHeight}px`,
            gridAutoFlow: 'row dense',
            gap: `${MARGIN[1]}px ${MARGIN[0]}px`,
            alignItems: 'stretch',
          }}
        >
          {viewItems.map(item => (
            <div
              key={item.i}
              style={{
                gridColumn: `span ${clamp(item.w, 1, activeCols)}`,
                gridRow: `span ${Math.max(1, item.h)}`,
                minWidth: 0,
                minHeight: 0,
              }}
              {...longPressHandlers}
            >
              <div className="dashboard-widget-shell">
                <WidgetWrapper
                  widgetId={item.i}
                  pluginId={String(page.widgetConfigs[item.i]?._pluginId ?? item.i)}
                  config={page.widgetConfigs[item.i] || {}}
                  isEditMode={false}
                  size={{ w: item.w, h: item.h }}
                  pageId={pageId}
                  onRemove={() => handleRemoveWidget(item.i)}
                  onUpdateConfig={onUpdateConfig}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {widthMounted && editMode && (
        <ResponsiveGridLayout
          layouts={displayLayouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={rowHeight}
          margin={MARGIN}
          width={width}
          dragConfig={{ enabled: editMode, bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: editMode, handles: ['se'] }}
          onLayoutChange={handleLayoutChange}
          containerPadding={[0, 0]}
        >
          {widgetItems.map(item => (
            <div key={item.i} {...longPressHandlers}>
              <div className={`dashboard-widget-shell${editMode && wobbleEnabled ? ' widget-wobble' : ''}`}>
                <WidgetWrapper
                  widgetId={item.i}
                  pluginId={String(page.widgetConfigs[item.i]?._pluginId ?? item.i)}
                  config={page.widgetConfigs[item.i] || {}}
                  isEditMode={true}
                  size={{ w: item.w, h: item.h }}
                  pageId={pageId}
                  onRemove={() => handleRemoveWidget(item.i)}
                  onUpdateConfig={onUpdateConfig}
                />
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  )
})
