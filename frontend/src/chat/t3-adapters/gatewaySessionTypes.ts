/*
 * Copied/adapted from T3 Code's thread/sidebar summary contract and Codex's
 * app-server thread metadata shape. This keeps chat thread identity under the
 * copy-first chat adapter layer instead of importing the legacy Sessions page.
 */

export interface HermesSession {
  key: string
  label: string
  agentKey: string
  messageCount: number
  lastActivity: string
  project?: string
  workingDir?: string
  branch?: string
  runtime?: string
  environmentId?: string
  pinned?: boolean
  favorite?: boolean
  [key: string]: unknown
}

export interface ClaudeSession extends HermesSession {}

export interface GatewaySessionsResponse {
  ok: boolean
  sessions: HermesSession[]
}
