import React from 'react'
import { BackendErrorBanner } from '@/components/BackendErrorBanner'
import { IdeaDetailPanel } from './dashboard/IdeaDetailPanel'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { DashboardGrid } from './dashboard/DashboardGrid'
import { useDashboardData } from './dashboard/useDashboardData'
import { useDashboardStore } from '@/lib/dashboard-store'

// ---------------------------------------------------------------------------
// Context — shares useDashboardData return value with widget components
// ---------------------------------------------------------------------------

export const DashboardDataContext = React.createContext<ReturnType<typeof useDashboardData> | null>(null)

export function useDashboardDataContext() {
  const ctx = React.useContext(DashboardDataContext)
  if (!ctx) throw new Error('useDashboardDataContext must be used within Dashboard')
  return ctx
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const dashboardData = useDashboardData()
  const dashState = useDashboardStore()

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

  return (
    <DashboardDataContext.Provider value={dashboardData}>
      <div>
        {backendError && <BackendErrorBanner label={backendError} />}

        <DashboardHeader
          isDemo={_demo}
          subagentsError={subagentsError}
          lastRefreshMs={lastRefreshMs}
          onRefresh={() => { fastTick(); slowTick() }}
        />

        <DashboardGrid
          pageId={dashState.activePageId}
          editMode={dashState.editMode}
          wobbleEnabled={dashState.wobbleEnabled}
        />

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
