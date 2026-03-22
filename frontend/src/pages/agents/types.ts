export interface Agent {
  id: string
  name: string
  display_name: string
  emoji: string
  role: string
  status: string
  current_task: string | null
  color: string | null
  model: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateAgentPayload {
  display_name: string
  emoji?: string
  role?: string
  model?: string
}

export type AgentAction = 'start' | 'stop' | 'restart'

export interface AgentActionPayload {
  id: string
  action: AgentAction
}

export interface Process {
  pid: string
  cmd: string
  cpu: string
  mem: string
  elapsed: string
  logFile: string | null
  agentName: string | null
  agentEmoji: string | null
  lastLogLine: string | null
  mission_id: string | null
  mission_title: string | null
  started_at: string | null
}
