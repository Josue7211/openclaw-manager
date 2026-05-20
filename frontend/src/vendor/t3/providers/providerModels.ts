/*
 * Copied/adapted from T3 Code apps/web/src/providerModels.ts (MIT License).
 * The selection and display helpers are kept behaviorally aligned with T3,
 * with local provider contract types replacing @t3tools/contracts imports.
 */

import {
  defaultInstanceIdForDriver,
  PROVIDER_DISPLAY_NAMES,
  type ModelCapabilities,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from './providerTypes'

const EMPTY_CAPABILITIES: ModelCapabilities = { optionDescriptors: [] }
const DEFAULT_DRIVER_KIND = 'hermes'
const DEFAULT_MODEL = 'gpt-5.5'
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  hermes: DEFAULT_MODEL,
}

function normalizeModelSlug(model: string | null | undefined): string {
  return model?.trim() ?? ''
}

export function formatProviderDriverKindLabel(provider: ProviderDriverKind): string {
  return provider
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function getProviderSnapshot(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): ServerProvider | undefined {
  const defaultInstanceId = defaultInstanceIdForDriver(provider)
  return providers.find(candidate => candidate.instanceId === defaultInstanceId)
}

export function getProviderModels(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): ReadonlyArray<ServerProviderModel> {
  return getProviderSnapshot(providers, provider)?.models ?? []
}

export function getProviderDisplayName(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): string {
  const snapshot = getProviderSnapshot(providers, provider)
  return snapshot?.displayName?.trim() || PROVIDER_DISPLAY_NAMES[provider] || formatProviderDriverKindLabel(provider)
}

export function getProviderInteractionModeToggle(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): boolean {
  return getProviderSnapshot(providers, provider)?.showInteractionModeToggle ?? true
}

export function isProviderEnabled(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): boolean {
  if (providers.length === 0) return true
  return getProviderSnapshot(providers, provider)?.enabled ?? false
}

export function resolveSelectableProvider(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind | ProviderInstanceId | null | undefined,
): ProviderDriverKind {
  const requestedEntry = providers.find(candidate => candidate.instanceId === provider)
  if (requestedEntry?.enabled) return requestedEntry.driver
  return providers.find(candidate => candidate.enabled)?.driver ?? DEFAULT_DRIVER_KIND
}

export function getProviderModelCapabilities(
  models: ReadonlyArray<ServerProviderModel>,
  model: string | null | undefined,
): ModelCapabilities {
  const slug = normalizeModelSlug(model)
  return models.find(candidate => candidate.slug === slug)?.capabilities ?? EMPTY_CAPABILITIES
}

export function getDefaultServerModel(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): string {
  const models = getProviderModels(providers, provider)
  if (models.length === 0 && provider !== DEFAULT_DRIVER_KIND) return ''
  return (
    models.find(model => !model.isCustom)?.slug
    ?? models[0]?.slug
    ?? DEFAULT_MODEL_BY_PROVIDER[provider]
    ?? DEFAULT_MODEL
  )
}
