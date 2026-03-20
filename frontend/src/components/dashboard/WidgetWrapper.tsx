/**
 * WidgetWrapper — per-widget error boundary + Suspense wrapper with lazy loading.
 *
 * Each widget on the dashboard grid is wrapped in this component, which provides:
 *   1. Lazy loading via React.lazy (deferred code-splitting per widget type)
 *   2. Suspense fallback with a skeleton shimmer while loading
 *   3. Error boundary via PageErrorBoundary (crash isolation per widget)
 *   4. ARIA article semantics for screen readers
 *
 * The lazy component cache is module-scoped so the same widget type is only
 * ever created as a single React.lazy instance, regardless of how many
 * instances of that widget exist on the grid.
 */

import React, { Suspense } from 'react'
import { getWidget } from '@/lib/widget-registry'
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
}: WidgetWrapperProps) {
  const def = getWidget(pluginId)
  if (!def) return null

  const LazyWidget = getOrCreateLazy(pluginId)
  if (!LazyWidget) return null

  return (
    <div
      role="article"
      aria-label={def.name}
      style={{ width: '100%', height: '100%' }}
    >
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
  )
})
