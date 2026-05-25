/*
 * Copied/adapted from T3 Code provider-instance contracts (MIT License).
 * Localized to ClawControl's frontend so copied T3 provider logic can run
 * without importing the full @t3tools/contracts workspace package.
 */

export type ProviderDriverKind = string
export type ProviderInstanceId = string
export type ServerProviderState = 'ready' | 'warning' | 'error' | 'disabled'
export type ServerProviderAuthStatus =
  | 'authenticated'
  | 'unauthenticated'
  | 'not-required'
  | 'unknown'
export type ServerProviderAvailability = 'available' | 'unavailable'

export interface ServerProviderAuth {
  status: ServerProviderAuthStatus
  label?: string
  type?: string
  message?: string
}

export interface ModelCapabilities {
  optionDescriptors?: unknown[]
}

export interface ServerProviderModel {
  slug: string
  name: string
  isCustom?: boolean
  capabilities?: ModelCapabilities | null
  subProvider?: string
}

export interface ServerProviderContinuation {
  groupKey?: string
}

export interface ServerProvider {
  instanceId: ProviderInstanceId
  driver: ProviderDriverKind
  displayName?: string
  accentColor?: string
  badgeLabel?: string
  continuation?: ServerProviderContinuation
  showInteractionModeToggle?: boolean
  enabled: boolean
  installed: boolean
  version: string | null
  status: ServerProviderState
  auth: ServerProviderAuth
  checkedAt: string
  message?: string
  availability?: ServerProviderAvailability
  unavailableReason?: string
  models: ServerProviderModel[]
  slashCommands?: unknown[]
  skills?: unknown[]
}

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  hermes: 'Hermes Agent',
}

export const defaultInstanceIdForDriver = (driver: ProviderDriverKind): ProviderInstanceId => driver

export const isProviderAvailable = (snapshot: ServerProvider): boolean => (
  snapshot.availability !== 'unavailable'
)
