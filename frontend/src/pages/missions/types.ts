/* ─── Data types ────────────────────────────────────────────────────────── */

export interface Mission {
  id: string
  title: string
  assignee: string
  status: string
  progress: number
  created_at: string
  updated_at?: string
  log_path?: string | null
  complexity?: number | null
  task_type?: string | null
  review_status?: string | null
  review_notes?: string | null
  retry_count?: number
  routed_agent?: string | null
}

export interface Agent {
  id: string
  display_name: string
  emoji: string
}

export interface MissionEvent {
  id: string
  mission_id: string
  event_type: 'write' | 'edit' | 'bash' | 'read' | 'think' | 'result' | 'glob' | 'grep' | 'user'
  content: string
  file_path: string | null
  seq: number
  elapsed_seconds: number | null
  created_at: string
  tool_input?: string | null
  model_name?: string | null
}

export type Tab = 'all' | 'active' | 'pending' | 'done' | 'review'
