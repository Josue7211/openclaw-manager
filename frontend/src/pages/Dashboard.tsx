import React, { useState, useEffect, useMemo } from 'react'
import { Plus } from '@phosphor-icons/react'
import { BackendErrorBanner } from '@/components/BackendErrorBanner'
import { DashboardGrid } from './dashboard/DashboardGrid'
import { DashboardEditBar } from '@/components/dashboard/DashboardEditBar'
import { DashboardTabs } from '@/components/dashboard/DashboardTabs'
import { IdeaDetailPanel } from './dashboard/IdeaDetailPanel'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { useDashboardData } from './dashboard/useDashboardData'
import {
  useDashboardStore,
  getDashboardState,
  setDashboardState,
} from '@/lib/dashboard-store'
import { generateDefaultLayout } from '@/lib/dashboard-defaults'
import { getEnabledModules } from '@/lib/modules'

const WidgetPicker = React.lazy(() =>
  import('@/components/dashboard/WidgetPicker').then(m => ({ default: m.WidgetPicker }))
)
const RecycleBin = React.lazy(() =>
  import('@/components/dashboard/RecycleBin').then(m => ({ default: m.RecycleBin }))
)

// Re-export context from shared file (avoids circular imports when cards import it)
export { DashboardDataContext, useDashboardDataContext } from './dashboard/dashboard-context'
import { DashboardDataContext } from './dashboard/dashboard-context'

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const dashboardData = useDashboardData()
  const dashState = useDashboardStore()
  const [pickerOpen, setPickerOpen] = useState(false)

  const {
    _demo,
    backendError,
    subagentsError,
    lastRefreshMs,
    panelIdea,
    setPanelIdea,
    fastTick,
    slowTick,
    handleIdeaAction,
  } = dashboardData

  const activePage = useMemo(
    () => dashState.pages.find(p => p.id === dashState.activePageId) || dashState.pages[0],
    [dashState.pages, dashState.activePageId],
  )

  // First-use: populate default layout if active page has no widgets
  useEffect(() => {
    if (activePage && Object.keys(activePage.layouts).length === 0) {
      const defaults = generateDefaultLayout(getEnabledModules())
      const state = getDashboardState()
      const updated = {
        ...state,
        pages: state.pages.map(p =>
          p.id === activePage.id
            ? { ...p, layouts: defaults.layouts }
            : p
        ),
      }
      setDashboardState(updated)
    }
  }, [activePage])

  // Collect placed widget plugin IDs for the picker's "already added" check.
  // Must use _pluginId from widgetConfigs (not instance IDs) since instance IDs
  // contain a UUID suffix (e.g. "agent-status-a1b2c3d4") that won't match registry IDs.
  // Also gathers from ALL breakpoints, not just the first.
  const placedWidgetIds = useMemo(() => {
    if (!activePage?.layouts) return []
    const ids = new Set<string>()
    for (const items of Object.values(activePage.layouts)) {
      for (const item of items as Array<{ i: string }>) {
        const pluginId = String(activePage.widgetConfigs[item.i]?._pluginId ?? item.i)
        ids.add(pluginId)
      }
    }
    return Array.from(ids)
  }, [activePage?.layouts, activePage?.widgetConfigs])

  return (
    <DashboardDataContext.Provider value={dashboardData}>
      <div>
        {backendError && <BackendErrorBanner label={backendError} />}

        {/* Dashboard header: existing header + edit bar */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}>
          <DashboardHeader
            isDemo={_demo}
            subagentsError={subagentsError}
            lastRefreshMs={lastRefreshMs}
            onRefresh={() => { fastTick(); slowTick() }}
          />
          <div style={{ paddingTop: '8px' }}>
            <DashboardEditBar
              editMode={dashState.editMode}
              onOpenPicker={() => setPickerOpen(true)}
            />
          </div>
        </div>

        {/* Dashboard tabs */}
        <div style={{ padding: '0 24px', marginBottom: '16px' }}>
          <DashboardTabs
            pages={dashState.pages}
            activePageId={dashState.activePageId}
            editMode={dashState.editMode}
            dotIndicatorsEnabled={dashState.dotIndicatorsEnabled}
          />
        </div>

        {/* Main grid */}
        <div style={{ padding: '0 24px 24px', position: 'relative' }}>
          <DashboardGrid
            pageId={activePage?.id || ''}
            editMode={dashState.editMode}
            wobbleEnabled={dashState.wobbleEnabled}
          />
        </div>

        {/* Floating "+" FAB (edit mode only) */}
        {dashState.editMode && (
          <button
            className="dashboard-fab"
            onClick={() => setPickerOpen(true)}
            aria-label="Add widget"
          >
            <Plus size={24} weight="bold" />
          </button>
        )}

        {/* Widget Picker panel (lazy-loaded) */}
        <React.Suspense fallback={null}>
          <WidgetPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            pageId={activePage?.id || ''}
            placedWidgetIds={placedWidgetIds}
          />
        </React.Suspense>

        {/* Recycle Bin drawer (lazy-loaded) */}
        <React.Suspense fallback={null}>
          <RecycleBin
            items={dashState.recycleBin}
            visible={dashState.editMode}
          />
        </React.Suspense>

        {/* Idea Detail Side Panel */}
        {panelIdea && (
          <IdeaDetailPanel
            idea={panelIdea}
            onClose={() => setPanelIdea(null)}
            onIdeaAction={handleIdeaAction}
          />
        )}
      </div>
    </DashboardDataContext.Provider>
  )
}
