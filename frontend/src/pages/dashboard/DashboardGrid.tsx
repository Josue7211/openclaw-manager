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

import React, { useCallback, useRef, useMemo } from 'react'
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
const ROW_HEIGHT = 80
const MARGIN: [number, number] = [16, 16]
const DEBOUNCE_MS = 300

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

  // Debounced layout change handler
  const layoutUpdater = onLayoutChangeProp ?? updatePageLayouts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      {widthMounted && (
        <ResponsiveGridLayout
          layouts={page.layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          width={width}
          dragConfig={{ enabled: editMode, bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: editMode, handles: ['se'] }}
          onLayoutChange={handleLayoutChange}
          containerPadding={[0, 0]}
        >
          {widgetItems.map(item => (
            <div key={item.i} {...longPressHandlers}>
              <div className={editMode && wobbleEnabled ? 'widget-wobble' : ''} style={{ width: '100%', height: '100%' }}>
                <WidgetWrapper
                  widgetId={item.i}
                  pluginId={String(page.widgetConfigs[item.i]?._pluginId ?? item.i)}
                  config={page.widgetConfigs[item.i] || {}}
                  isEditMode={editMode}
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
