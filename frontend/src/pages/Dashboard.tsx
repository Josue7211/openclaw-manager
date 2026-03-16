


import { BackendErrorBanner } from '@/components/BackendErrorBanner'

import { AgentStatusCard } from './dashboard/AgentStatusCard'
import { HeartbeatCard } from './dashboard/HeartbeatCard'
import { AgentsCard } from './dashboard/AgentsCard'
import { MissionsCard } from './dashboard/MissionsCard'
import { MemoryCard } from './dashboard/MemoryCard'
import { IdeaBriefingCard } from './dashboard/IdeaBriefingCard'
import { NetworkCard } from './dashboard/NetworkCard'
import { SessionsCard } from './dashboard/SessionsCard'
import { IdeaDetailPanel } from './dashboard/IdeaDetailPanel'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { useDashboardData } from './dashboard/useDashboardData'

export default function Dashboard() {
  const {
    _demo,
    mounted,
    backendError,
    status,
    heartbeat,
    sessions,
    subagents,
    agentsData,
    activeSubagents,
    subagentsError,
    missions,
    memory,
    pendingIdeas,
    lastRefreshMs,
    panelIdea, setPanelIdea,
    sortedAgents,
    fastTick,
    slowTick,
    handleIdeaAction,
    updateMissionStatus,
    deleteMission,
  } = useDashboardData()

  return (
    <div>
      {backendError && <BackendErrorBanner label={backendError} />}

      <DashboardHeader
        isDemo={_demo}
        subagentsError={subagentsError}
        lastRefreshMs={lastRefreshMs}
        onRefresh={() => { fastTick(); slowTick() }}
      />

      {/* Grid: responsive cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'min-content', gap: '16px' }}>
        <AgentStatusCard mounted={mounted} status={status} />
        <HeartbeatCard mounted={mounted} heartbeat={heartbeat} />
        <AgentsCard mounted={mounted} sortedAgents={sortedAgents} agentsData={agentsData} subagents={subagents} activeSubagents={activeSubagents} />
        <MissionsCard mounted={mounted} missions={missions} updateMissionStatus={updateMissionStatus} deleteMission={deleteMission} />
        <MemoryCard mounted={mounted} memory={memory} />
        <IdeaBriefingCard pendingIdeas={pendingIdeas} onIdeaAction={handleIdeaAction} onOpenDetail={setPanelIdea} />
        <NetworkCard />
        <SessionsCard mounted={mounted} sessions={sessions} />
      </div>

      {/* Idea Detail Side Panel */}
      {panelIdea && (
        <IdeaDetailPanel idea={panelIdea} onClose={() => setPanelIdea(null)} onIdeaAction={handleIdeaAction} />
      )}
    </div>
  )
}
