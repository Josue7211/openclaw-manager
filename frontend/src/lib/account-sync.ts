import { api } from './api'

export interface AccountSyncStatus {
  authenticated: boolean
  mfa_verified: boolean
  has_cached_key: boolean
  has_synced_services: boolean
  synced_service_count: number
  hydrated_service_count?: number
  services: string[]
  service_details?: AccountSyncServiceDetail[]
  requires_unlock: boolean
  ready: boolean
  recovery_key_configured?: boolean
  needs_recovery_key?: boolean
  setup_doctor_required: boolean
}

export interface AccountSyncServiceDetail {
  service: string
  label: string
  status: 'locked' | 'unknown' | 'needs_repair' | 'partial' | 'ready' | 'synced' | 'local_only'
  synced: boolean
  hydrated: boolean
  decryptable: boolean
  configured_fields: string[]
  hydrated_fields: string[]
  missing_fields: string[]
  updated_at?: string | null
  created_at?: string | null
}

export interface HandoffRequest {
  id: string
  requesting_device_name: string
  verification_code: string
  approver_device_name?: string | null
  status: 'pending' | 'approved' | 'claimed' | 'expired' | 'rejected'
  expires_at: string
  created_at: string
}

export interface HandoffRequestCreated {
  ok: boolean
  request_id: string
  code: string
  expires_at: string
}

export interface HandoffClaimResult {
  ok: boolean
  claimed: boolean
  status: string
  sync?: AccountSyncStatus
}

export interface RecoveryStatus {
  ok: boolean
  configured: boolean
  latest?: {
    id: string
    created_at: string
    last_used_at?: string | null
  } | null
}

export interface RecoveryGenerated {
  ok: boolean
  recovery_key: string
  record?: unknown
}

export interface RecoveryUnlockResult {
  ok: boolean
  sync: AccountSyncStatus
}

export async function getAccountSyncStatus(): Promise<AccountSyncStatus> {
  return api.get<AccountSyncStatus>('/api/auth/sync/status')
}

export async function hydrateAccountSync(): Promise<AccountSyncStatus> {
  return api.post<AccountSyncStatus>('/api/auth/sync/hydrate')
}

export async function unlockAccountSync(password: string): Promise<AccountSyncStatus> {
  return api.post<AccountSyncStatus>('/api/auth/sync/unlock', { password })
}

export async function recoverAccountSyncFromLocal(): Promise<AccountSyncStatus> {
  return api.post<AccountSyncStatus>('/api/auth/sync/recover-local')
}

export async function requestTrustedDeviceHandoff(deviceName?: string): Promise<HandoffRequestCreated> {
  return api.post<HandoffRequestCreated>('/api/auth/sync/handoff/request', { device_name: deviceName })
}

export async function listTrustedDeviceHandoffs(): Promise<{ ok: boolean; requests: HandoffRequest[] }> {
  return api.get<{ ok: boolean; requests: HandoffRequest[] }>('/api/auth/sync/handoff/requests')
}

export async function approveTrustedDeviceHandoff(requestId: string): Promise<{ ok: boolean; request_id: string }> {
  return api.post<{ ok: boolean; request_id: string }>('/api/auth/sync/handoff/approve', { request_id: requestId })
}

export async function claimTrustedDeviceHandoff(requestId: string): Promise<HandoffClaimResult> {
  return api.post<HandoffClaimResult>('/api/auth/sync/handoff/claim', { request_id: requestId })
}

export async function getRecoveryKeyStatus(): Promise<RecoveryStatus> {
  return api.get<RecoveryStatus>('/api/auth/sync/recovery/status')
}

export async function generateRecoveryKey(): Promise<RecoveryGenerated> {
  return api.post<RecoveryGenerated>('/api/auth/sync/recovery/generate')
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<RecoveryUnlockResult> {
  return api.post<RecoveryUnlockResult>('/api/auth/sync/recovery/unlock', { recovery_key: recoveryKey })
}
