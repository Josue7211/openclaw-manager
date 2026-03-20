/**
 * WidgetWrapper -- per-widget error boundary + Suspense wrapper with lazy loading
 * and edit-mode chrome (remove X, gear icon, optional title header, wobble).
 *
 * Each widget on the dashboard grid is wrapped in this component, which provides:
 *   1. Lazy loading via React.lazy (deferred code-splitting per widget type)
 *   2. Suspense fallback with a skeleton shimmer while loading
 *   3. Error boundary via PageErrorBoundary (crash isolation per widget)
 *   4. ARIA article semantics for screen readers
 *   5. Edit-mode chrome: remove X button, config gear, optional title, wobble
 *
 * The lazy component cache is module-scoped so the same widget type is only
 * ever created as a single React.lazy instance, regardless of how many
 * instances of that widget exist on the grid.
 */

import React, { Suspense, useState, useRef, useCallback } from 'react'
import { X, GearSix } from '@phosphor-icons/react'
import { getWidget } from '@/lib/widget-registry'
import { WidgetConfigPanel } from './WidgetConfigPanel'
import PageErrorBoundary from '@/components/PageErrorBoundary'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetWrapperProps {
  widgetId: string       // Instance ID on the grid
  pluginId: string       // Widget type ID from registry
  config: Record<string, unknown>
  isEditMode: boolean
  size: { w: number; h: number }
  pageId: string
  onRemove?: () => void
}

// ---------------------------------------------------------------------------
// Lazy component cache (module-scoped singleton)
// ---------------------------------------------------------------------------

const _lazyCache = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>()

function getOrCreateLazy(pluginId: string): React.LazyExoticComponent<React.ComponentType<any>> | null {
  const cached = _lazyCache.get(pluginId)
  if (cached) return cached

  const def = getWidget(pluginId)
  if (!def) return null

  const lazy = React.lazy(def.component)
  _lazyCache.set(pluginId, lazy)
  return lazy
}

// ---------------------------------------------------------------------------
// Skeleton fallback
// ---------------------------------------------------------------------------

function WidgetSkeleton() {
  return (
    <div
      className="skeleton"
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 'var(--radius-lg)',
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// WidgetWrapper
// ---------------------------------------------------------------------------

export const WidgetWrapper = React.memo(function WidgetWrapper({
  widgetId,
  pluginId,
  config,
  isEditMode,
  size,
  pageId,
  onRemove,
}: WidgetWrapperProps) {
  // Hooks must be called before any conditional returns (Rules of Hooks)
  const [configOpen, setConfigOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)

  const handleGearClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setConfigOpen(prev => !prev)
  }, [])

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove?.()
  }, [onRemove])

  const def = getWidget(pluginId)
  if (!def) return null

  const LazyWidget = getOrCreateLazy(pluginId)
  if (!LazyWidget) return null

  const showTitle = Boolean(config.showTitle)

  return (
    <div
      className="widget-card"
      data-editing={isEditMode ? 'true' : undefined}
      role="article"
      aria-label={def.name}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: isEditMode ? 'visible' : 'hidden',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-card-solid)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Remove X button (edit mode only) */}
      {isEditMode && onRemove && (
        <button
          className="widget-remove-btn"
          onClick={handleRemoveClick}
          aria-label="Remove widget"
        >
          <X size={14} weight="bold" />
        </button>
      )}

      {/* Config gear icon (edit mode: always visible, view mode: visible on card hover via CSS) */}
      <button
        ref={gearRef}
        className="widget-gear-btn"
        onClick={handleGearClick}
        aria-label="Widget settings"
      >
        <GearSix size={20} />
      </button>

      {/* Optional title header */}
      {showTitle && (
        <div className="widget-title-header">
          {def.name}
        </div>
      )}

      {/* Widget content */}
      <div style={{
        width: '100%',
        height: showTitle ? 'calc(100% - 37px)' : '100%',
        overflow: 'hidden',
      }}>
        <PageErrorBoundary>
          <Suspense fallback={<WidgetSkeleton />}>
            <LazyWidget
              widgetId={widgetId}
              config={config}
              isEditMode={isEditMode}
              size={size}
            />
          </Suspense>
        </PageErrorBoundary>
      </div>

      {/* Config panel popover */}
      {configOpen && (
        <WidgetConfigPanel
          widgetId={widgetId}
          pluginId={pluginId}
          pageId={pageId}
          config={config}
          anchorRef={gearRef as React.RefObject<HTMLElement>}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
})
