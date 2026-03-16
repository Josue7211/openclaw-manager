export interface Agent {
  id: string
  display_name: string
  emoji: string
  role: string
  status: string
  current_task: string | null
  color: string | null
  model: string | null
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
