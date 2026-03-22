import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus } from '@phosphor-icons/react'
import { DashboardGrid } from './dashboard/DashboardGrid'
import { DashboardEditBar } from '@/components/dashboard/DashboardEditBar'
import {
  useHomeStore,
  getHomeState,
  setHomeState,
  setHomeEditMode,
  updateHomePageLayouts,
  removeHomeWidget,
  updateHomeWidgetConfig,
  addHomeWidgetToPage,
  undoHome,
  restoreHomeWidget,
  clearHomeRecycleBin,
} from '@/lib/home-store'
import { generateHomeDefaultLayout } from '@/lib/home-defaults'

const WidgetPicker = React.lazy(() =>
  import('@/components/dashboard/WidgetPicker').then(m => ({ default: m.WidgetPicker }))
)
const RecycleBin = React.lazy(() =>
  import('@/components/dashboard/RecycleBin').then(m => ({ default: m.RecycleBin }))
)

// ---------------------------------------------------------------------------
// Greeting helper
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ---------------------------------------------------------------------------
// Personal (Home) Dashboard
// ---------------------------------------------------------------------------

export default function Personal() {
  const homeState = useHomeStore()
  const [pickerOpen, setPickerOpen] = useState(false)

  const activePage = useMemo(
    () => homeState.pages.find(p => p.id === homeState.activePageId) || homeState.pages[0],
    [homeState.pages, homeState.activePageId],
  )

  // First-use: populate default layout if active page has no widgets
  useEffect(() => {
    if (activePage && Object.keys(activePage.layouts).length === 0) {
      const defaults = generateHomeDefaultLayout()
      const state = getHomeState()
      setHomeState({
        ...state,
        pages: state.pages.map(p =>
          p.id === activePage.id
            ? { ...p, layouts: defaults.layouts, widgetConfigs: defaults.widgetConfigs }
            : p
        ),
      })
    }
  }, [activePage])

  // Collect placed widget plugin IDs for the picker's "already added" check.
  const placedWidgetIds = useMemo(() => {
    if (!activePage?.layouts) return []
    const ids = new Set<string>()
    for (const items of Object.values(activePage.layouts)) {
      for (const item of items as Array<{ i: string }>) {
        const pluginId = String(activePage.widgetConfigs?.[item.i]?._pluginId ?? item.i)
        ids.add(pluginId)
      }
    }
    return Array.from(ids)
  }, [activePage?.layouts, activePage?.widgetConfigs])

  // Stable callbacks that delegate to the home store
  const handleUndo = useCallback(() => { undoHome() }, [])

  return (
    <div>
      {/* Header with greeting + edit bar */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '0 24px',
        marginBottom: '16px',
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {getGreeting()}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ paddingTop: '8px' }}>
          <DashboardEditBar
            editMode={homeState.editMode}
            onOpenPicker={() => setPickerOpen(true)}
            onToggleEdit={setHomeEditMode}
            onUndo={handleUndo}
          />
        </div>
      </div>

      {/* Widget Grid */}
      <div style={{ padding: '0 24px 24px', position: 'relative' }}>
        <DashboardGrid
          pageId={activePage?.id || ''}
          editMode={homeState.editMode}
          wobbleEnabled={homeState.wobbleEnabled}
          page={activePage}
          onLayoutChange={updateHomePageLayouts}
          onRemoveWidget={removeHomeWidget}
          onSetEditMode={setHomeEditMode}
          onUpdateConfig={updateHomeWidgetConfig}
        />
      </div>

      {/* Floating "+" FAB (edit mode only) */}
      {homeState.editMode && (
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
          onAddWidget={addHomeWidgetToPage}
        />
      </React.Suspense>

      {/* Recycle Bin drawer (lazy-loaded) */}
      <React.Suspense fallback={null}>
        <RecycleBin
          items={homeState.recycleBin}
          visible={homeState.editMode}
          onRestore={restoreHomeWidget}
          onClearAll={clearHomeRecycleBin}
        />
      </React.Suspense>
    </div>
  )
}
