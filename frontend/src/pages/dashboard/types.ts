export interface StatusData {
  name: string; emoji: string; model: string; status: string; lastActive: string; host: string; ip: string;
}
export interface HeartbeatData { lastCheck: string | null; status: string; tasks: string[]; }
export interface MemoryEntry { date: string; preview: string; path: string; }
export interface Session { id: string; label?: string; kind?: string; lastActive?: string; }
export interface AgentInfo { id: string; display_name: string; emoji: string; model: string; role: string; status: string; current_task: string | null; sort_order?: number; }
export interface AgentsData { agents: AgentInfo[]; activeSessions: string[]; }
export interface SubagentData { count: number; agents: unknown[]; }
export interface ActiveSubagentTask { id: string; label: string; agentId: string; startedAt: string; }
export interface ActiveSubagentData { active: boolean; count: number; tasks: ActiveSubagentTask[]; }
export interface Idea { id: string; title: string; description: string | null; why: string | null; effort: string | null; impact: string | null; category: string | null; status: string; created_at: string; }

// Pill color per mission status
export function missionStatusStyle(status: string): React.CSSProperties {
  if (status === 'done')   return { background: 'var(--secondary-a15)', color: 'var(--secondary-bright)', border: '1px solid var(--secondary-a25)' }
  if (status === 'active') return { background: 'var(--blue-a25)', color: 'var(--tertiary-bright)', border: '1px solid var(--blue-a25)' }
  return { background: 'var(--hover-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
}

// Shared effort/impact color helper
export function effortColor(v: string | null): string {
  return v === 'low' ? 'var(--secondary)' : v === 'medium' ? 'var(--amber)' : v === 'high' ? 'var(--red-bright)' : 'var(--text-muted)'
}

// Shared pill style for effort/impact badges
export function pillStyle(v: string | null): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px',
    fontWeight: 600, background: `${effortColor(v)}22`, color: effortColor(v),
    border: `1px solid ${effortColor(v)}44`, textTransform: 'capitalize',
  }
}
