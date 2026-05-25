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

const DEFAULT_HOME_WIDGET_IDS = new Set([
  'todos-home',
  'calendar-home',
  'pomodoro-home',
  'knowledge-home',
  'missions-home',
  'memory-home',
])

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

  // First-use: populate default layout if active page has no/too-few widgets
  useEffect(() => {
    const uniqueWidgets = activePage
      ? new Set(Object.values(activePage.layouts).flat().map((item: { i: string }) => item.i)).size
      : 0
    if (activePage && (Object.keys(activePage.layouts).length === 0 || uniqueWidgets < 3)) {
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

  // Merge legacy Reminders home card into Tasks. This removes persisted
  // reminders widget instances so Home presents one task surface.
  useEffect(() => {
    if (!activePage) return

    const reminderWidgetIds = new Set(
      Object.entries(activePage.widgetConfigs)
        .filter(([, config]) => String(config?._pluginId ?? '') === 'reminders')
        .map(([widgetId]) => widgetId),
    )
    if (reminderWidgetIds.size === 0) return

    const state = getHomeState()
    setHomeState({
      ...state,
      pages: state.pages.map(page => {
        if (page.id !== activePage.id) return page
        const widgetConfigs = { ...page.widgetConfigs }
        for (const widgetId of reminderWidgetIds) delete widgetConfigs[widgetId]
        const layouts = Object.fromEntries(
          Object.entries(page.layouts).map(([breakpoint, items]) => [
            breakpoint,
            items.filter(item => !reminderWidgetIds.has(item.i)),
          ]),
        )
        return { ...page, layouts, widgetConfigs }
      }),
    })
  }, [activePage])

  // Clean up the oversized interim layout used while Todos and Reminders were
  // being merged. Only reset the stock Home dashboard, not custom layouts.
  useEffect(() => {
    if (!activePage) return

    const widgetIds = Object.keys(activePage.widgetConfigs)
    const isStockHome =
      widgetIds.length > 0 &&
      widgetIds.every(widgetId => DEFAULT_HOME_WIDGET_IDS.has(widgetId))
    if (!isStockHome) return

    const lgLayout = activePage.layouts.lg ?? activePage.layouts.xl ?? []
    const todos = lgLayout.find(item => item.i === 'todos-home')
    const calendar = lgLayout.find(item => item.i === 'calendar-home')
    const pomodoro = lgLayout.find(item => item.i === 'pomodoro-home')
    const needsCompactDefault =
      (todos && todos.w > 4) ||
      (calendar && calendar.w > 4) ||
      (pomodoro && pomodoro.w < 4)
    if (!needsCompactDefault) return

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
          >
            <React.Suspense fallback={null}>
              <RecycleBin
                items={homeState.recycleBin}
                visible={homeState.editMode}
                placement="toolbar"
                onRestore={restoreHomeWidget}
                onClearAll={clearHomeRecycleBin}
              />
            </React.Suspense>
          </DashboardEditBar>
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

    </div>
  )
}
