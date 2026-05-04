export interface RemoteViewerStatus {
  configured: boolean
  reachable: boolean
  available: boolean
  active: number
  max: number
  host?: string
  reason?: string | null
  message: string
}

export type RemoteViewerRepairTarget = 'tunnel' | 'vnc' | 'all'

export interface RemoteViewerRepairResult {
  ok: boolean
  target: RemoteViewerRepairTarget
  steps: Array<{
    target: 'tunnel' | 'vnc'
    ok: boolean
    error?: string
    result?: {
      program: string
      status: number
      stdout: string
    }
  }>
}
