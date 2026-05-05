import { api } from './api'

export interface AccountSyncStatus {
  authenticated: boolean
  mfa_verified: boolean
  has_cached_key: boolean
  has_synced_services: boolean
  synced_service_count: number
  services: string[]
  requires_unlock: boolean
  ready: boolean
  setup_doctor_required: boolean
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
