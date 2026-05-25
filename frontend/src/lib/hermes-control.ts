import { api } from '@/lib/api'

const BASE = '/api/hermes/control'

export type HermesControlStatus = {
  version?: string
  release_date?: string
  gateway_running?: boolean
  gateway_pid?: number
  gateway_state?: string
  gateway_platforms?: Record<string, unknown>
  active_sessions?: number
}

export type HermesInfraNode = {
  id: string
  label: string
  url: string
  configured: boolean
  peer_hostname?: string | null
  peer_verified?: boolean | null
}

export type HermesInfra = {
  nodes: HermesInfraNode[]
  matrix?: { status?: string }
  discord?: { server?: string }
}

export type HermesDiscordDiscover = {
  guildName: string
  env: Record<string, unknown>
  config: Record<string, unknown> | null
  defaults: {
    requireMention: boolean
    replyToMode: string
    allowAllUsers: boolean
  }
}

export type HermesBlueBubblesDiscover = {
  macBridge: { host: string; configured: boolean }
  bluebubbles: { host: string; configured: boolean; passwordConfigured: boolean }
  hermesMapping: Record<string, unknown>
}

export type HermesMatrixAudit = {
  status: string
  activeKeys: string[]
  message: string
}

export type HermesCertifyResult = {
  ok: boolean
  restart_required?: boolean
  gateway_running?: boolean
  gateway_platforms?: Record<string, unknown>
  manualStep?: string
  evidence?: Record<string, unknown>
}

export const hermesControl = {
  status: () => api.get<HermesControlStatus>(`${BASE}/status`),
  infra: () => api.get<HermesInfra>(`${BASE}/infra`),
  discordDiscover: () => api.get<HermesDiscordDiscover>(`${BASE}/setup/discord/discover`),
  discordTestToken: (payload: { token?: string; guildName?: string }) =>
    api.post<Record<string, unknown>>(`${BASE}/setup/discord/test-token`, payload),
  discordSave: (payload: {
    token?: string
    allowedUsers: string[]
    allowedChannels: string[]
    replyToMode: string
    requireMention: boolean
    autoThread: boolean
    reactions: boolean
    channelPrompts?: Record<string, string>
  }) => api.post<HermesCertifyResult>(`${BASE}/setup/discord/save`, payload),
  discordCertify: () => api.post<HermesCertifyResult>(`${BASE}/setup/discord/certify`, {}),
  bluebubblesDiscover: () => api.get<HermesBlueBubblesDiscover>(`${BASE}/setup/bluebubbles/discover`),
  bluebubblesTest: (payload: { host?: string; password?: string }) =>
    api.post<Record<string, unknown>>(`${BASE}/setup/bluebubbles/test`, payload),
  bluebubblesSave: (payload: { host?: string; password?: string; allowedUsers: string[] }) =>
    api.post<HermesCertifyResult>(`${BASE}/setup/bluebubbles/save`, payload),
  bluebubblesCertify: () => api.post<HermesCertifyResult>(`${BASE}/setup/bluebubbles/certify`, {}),
  matrixAudit: () => api.get<HermesMatrixAudit>(`${BASE}/setup/matrix/audit`),
  matrixDisable: () => api.post<HermesCertifyResult>(`${BASE}/setup/matrix/disable`, {}),
}
