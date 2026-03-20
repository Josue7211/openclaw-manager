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
import type { LayoutItem } from '@/lib/dashboard-store'
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DashboardGrid = React.memo(function DashboardGrid({
  pageId,
  editMode,
  wobbleEnabled,
}: DashboardGridProps) {
  const dashState = useDashboardStore()
  const page = dashState.pages.find(p => p.id === pageId)
  const { width, mounted: widthMounted, containerRef } = useContainerWidth({ initialWidth: 1280 })

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long-press: enter edit mode on any widget
  const longPressHandlers = useLongPress(() => {
    if (!editMode) setEditMode(true)
  })

  // Collect all unique widget IDs across all breakpoints
  const widgetItems = useMemo(() => {
    if (!page) return []

    const seen = new Set<string>()
    const items: LayoutItem[] = []

    // Gather unique widgets from all breakpoint layouts
    for (const layoutItems of Object.values(page.layouts)) {
      for (const item of layoutItems as LayoutItem[]) {
        if (!seen.has(item.i)) {
          seen.add(item.i)
          items.push(item)
        }
      }
    }

    return items
  }, [page])

  // Debounced layout change handler
  const handleLayoutChange = useCallback(
    (_layout: unknown, allLayouts: Record<string, LayoutItem[]>) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        updatePageLayouts(pageId, allLayouts)
      }, DEBOUNCE_MS)
    },
    [pageId],
  )

  // Remove widget callback factory
  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      removeWidget(pageId, widgetId)
    },
    [pageId],
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
          isDraggable={editMode}
          isResizable={editMode}
          onLayoutChange={handleLayoutChange}
          compactType="vertical"
          containerPadding={[0, 0]}
        >
          {widgetItems.map(item => (
            <div
              key={item.i}
              className={editMode && wobbleEnabled ? 'widget-wobble' : ''}
              {...longPressHandlers}
            >
              <WidgetWrapper
                widgetId={item.i}
                pluginId={item.i}
                config={page.widgetConfigs[item.i] || {}}
                isEditMode={editMode}
                size={{ w: item.w, h: item.h }}
                pageId={pageId}
                onRemove={() => handleRemoveWidget(item.i)}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  )
})
