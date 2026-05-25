/*
 * Copied/adapted from T3 Code apps/web/src/providerInstances.ts (MIT License).
 * This preserves T3's instance-aware provider projection so clawctrl does
 * not collapse providers into a flat hardcoded dropdown.
 */

import {
  defaultInstanceIdForDriver,
  isProviderAvailable,
  PROVIDER_DISPLAY_NAMES,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
  type ServerProviderState,
} from './providerTypes'
import { formatProviderDriverKindLabel } from './providerModels'

export interface ProviderInstanceEntry {
  readonly instanceId: ProviderInstanceId
  readonly driverKind: ProviderDriverKind
  readonly displayName: string
  readonly accentColor?: string | undefined
  readonly continuationGroupKey?: string | undefined
  readonly enabled: boolean
  readonly installed: boolean
  readonly status: ServerProviderState
  readonly isDefault: boolean
  readonly isAvailable: boolean
  readonly snapshot: ServerProvider
  readonly models: ReadonlyArray<ServerProviderModel>
}

function humanizeInstanceId(instanceId: ProviderInstanceId): string {
  return instanceId
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(token => token.length > 0)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

function driverKindLabel(driverKind: ProviderDriverKind): string {
  return PROVIDER_DISPLAY_NAMES[driverKind] ?? formatProviderDriverKindLabel(driverKind)
}

export function normalizeProviderAccentColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return /^#[0-9a-fA-F]{6}$/u.test(trimmed) ? trimmed : undefined
}

function resolveInstanceDisplayName(
  snapshot: ServerProvider,
  instanceId: ProviderInstanceId,
  driverKind: ProviderDriverKind,
  isDefault: boolean,
): string {
  const trimmedSnapshotName = snapshot.displayName?.trim()
  const kindLabel = driverKindLabel(driverKind)
  if (trimmedSnapshotName && trimmedSnapshotName !== kindLabel) return trimmedSnapshotName
  if (!isDefault) {
    const humanized = humanizeInstanceId(instanceId)
    if (humanized.length > 0) return humanized
  }
  return trimmedSnapshotName || kindLabel
}

export function deriveProviderInstanceEntries(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ProviderInstanceEntry> {
  return providers.map(snapshot => {
    const instanceId = snapshot.instanceId
    const driverKind = snapshot.driver
    const defaultId = defaultInstanceIdForDriver(driverKind)
    const isDefault = instanceId === defaultId
    const displayName = resolveInstanceDisplayName(snapshot, instanceId, driverKind, isDefault)
    return {
      instanceId,
      driverKind,
      displayName,
      accentColor: normalizeProviderAccentColor(snapshot.accentColor),
      continuationGroupKey: snapshot.continuation?.groupKey,
      enabled: snapshot.enabled,
      installed: snapshot.installed,
      status: snapshot.status,
      isDefault,
      isAvailable: isProviderAvailable(snapshot),
      snapshot,
      models: snapshot.models,
    }
  })
}

export function sortProviderInstanceEntries(
  entries: ReadonlyArray<ProviderInstanceEntry>,
): ReadonlyArray<ProviderInstanceEntry> {
  const byKind = new Map<ProviderDriverKind, ProviderInstanceEntry[]>()
  for (const entry of entries) {
    const bucket = byKind.get(entry.driverKind)
    if (bucket) bucket.push(entry)
    else byKind.set(entry.driverKind, [entry])
  }
  const sorted: ProviderInstanceEntry[] = []
  for (const bucket of byKind.values()) {
    sorted.push(...bucket.filter(entry => entry.isDefault))
    sorted.push(...bucket.filter(entry => !entry.isDefault))
  }
  return sorted
}

export function getProviderInstanceEntry(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
): ProviderInstanceEntry | undefined {
  return deriveProviderInstanceEntries(providers).find(entry => entry.instanceId === instanceId)
}

export function getProviderInstanceModels(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
): ReadonlyArray<ServerProviderModel> {
  return getProviderInstanceEntry(providers, instanceId)?.models ?? []
}

export function resolveSelectableProviderInstance(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId | undefined,
): ProviderInstanceId | undefined {
  const entries = deriveProviderInstanceEntries(providers)
  if (instanceId === undefined) {
    return entries.find(entry => entry.enabled && entry.isAvailable)?.instanceId
  }
  const requested = entries.find(entry => entry.instanceId === instanceId)
  if (requested && requested.enabled && requested.isAvailable) return instanceId
  return entries.find(entry => entry.enabled && entry.isAvailable)?.instanceId
}

export function resolveProviderDriverKindForInstanceSelection(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  _providers: ReadonlyArray<ServerProvider>,
  selection: ProviderInstanceId | ProviderDriverKind | null | undefined,
): ProviderDriverKind | undefined {
  return entries.find(entry => entry.instanceId === selection)?.driverKind
}
