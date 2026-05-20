/*
 * Copied/adapted from T3 Code's provider snapshot and instance projection.
 * ClawControl translates its backend readiness payload into T3-shaped
 * ServerProvider records so chat picker/settings UI share one provider model.
 */

import type { ChatProviderOption, ModelOption } from '@/features/chat/types'
import {
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from '@/vendor/t3/providers/providerInstances'
import type {
  ServerProvider,
} from '@/vendor/t3/providers/providerTypes'

type LegacyProvider = {
  id: string
  name?: string
  description?: string
  local?: boolean
  modelBacked?: boolean
  ready?: boolean
  selectable?: boolean
  detail?: string
}

const nowIso = () => new Date(0).toISOString()

export function hermesProviderSnapshot(
  models: ModelOption[] = [],
  input: { ready?: boolean; detail?: string } = {},
): ServerProvider {
  const ready = input.ready ?? true
  return {
    instanceId: 'hermes',
    driver: 'hermes',
    displayName: 'Hermes',
    enabled: ready,
    installed: ready,
    version: null,
    status: ready ? 'ready' : 'warning',
    auth: { status: 'not-required', label: 'Codex LB', message: input.detail },
    checkedAt: nowIso(),
    message: input.detail,
    availability: ready ? 'available' : 'unavailable',
    unavailableReason: ready ? undefined : input.detail || 'Hermes/Codex LB is not configured.',
    models: models.map(model => ({
      slug: model.id,
      name: model.name,
      isCustom: false,
      capabilities: null,
      subProvider: model.provider,
    })),
    slashCommands: [],
    skills: [],
  }
}

export function claudeProviderSnapshot(input: {
  ready?: boolean
  detail?: string
} = {}): ServerProvider {
  const ready = Boolean(input.ready)
  return {
    instanceId: 'claudeAgent',
    driver: 'claudeAgent',
    displayName: 'Claude Code',
    enabled: ready,
    installed: ready,
    version: null,
    status: ready ? 'ready' : 'warning',
    auth: {
      status: ready ? 'authenticated' : 'unknown',
      label: 'Claude Code',
      message: input.detail,
    },
    checkedAt: nowIso(),
    message: input.detail,
    availability: ready ? 'available' : 'unavailable',
    unavailableReason: ready ? undefined : input.detail || 'Claude Code is not configured.',
    models: [],
    slashCommands: [],
    skills: [],
  }
}

export function codexCliProviderSnapshot(input: {
  ready?: boolean
  detail?: string
} = {}): ServerProvider {
  const ready = Boolean(input.ready)
  return {
    instanceId: 'codex-cli',
    driver: 'codex-cli',
    displayName: 'Codex CLI',
    enabled: ready,
    installed: ready,
    version: null,
    status: ready ? 'ready' : 'warning',
    auth: {
      status: ready ? 'authenticated' : 'unknown',
      label: 'Codex CLI',
      message: input.detail,
    },
    checkedAt: nowIso(),
    message: input.detail,
    availability: ready ? 'available' : 'unavailable',
    unavailableReason: ready ? undefined : input.detail || 'Codex CLI is not configured.',
    models: [],
    slashCommands: [],
    skills: [],
  }
}

export function normalizeChatProviderSnapshots(input: {
  providers?: LegacyProvider[]
  models?: ModelOption[]
}): ServerProvider[] {
  const models = input.models ?? []
  const legacy = input.providers ?? []
  const hermes = legacy.find(provider => provider.id === 'hermes')
  const claude = legacy.find(provider => (
    provider.id === 'claudeAgent' || provider.id === 'claude-code'
  ))
  const codexCli = legacy.find(provider => provider.id === 'codex-cli')
  return [
    hermesProviderSnapshot(models, {
      ready: hermes ? Boolean(hermes.ready ?? hermes.selectable ?? true) : true,
      detail: hermes?.detail || hermes?.description,
    }),
    claudeProviderSnapshot({
      ready: Boolean(claude && (claude.ready ?? claude.selectable ?? true)),
      detail: claude?.detail || claude?.description,
    }),
    codexCliProviderSnapshot({
      ready: Boolean(codexCli && (codexCli.ready ?? codexCli.selectable ?? true)),
      detail: codexCli?.detail || codexCli?.description,
    }),
  ]
}

export function selectableChatProviderOptions(input: {
  providers?: LegacyProvider[]
  models?: ModelOption[]
}): ChatProviderOption[] {
  return sortProviderInstanceEntries(
    deriveProviderInstanceEntries(normalizeChatProviderSnapshots(input)),
  )
    .filter(entry => entry.enabled && entry.isAvailable)
    .map(entry => ({
      id: entry.instanceId,
      name: entry.displayName,
      description: entry.snapshot.message
        || entry.snapshot.auth.message
        || entry.snapshot.auth.label
        || entry.displayName,
      local: entry.driverKind === 'claudeAgent' || entry.driverKind === 'codex-cli',
      modelBacked: entry.driverKind === 'hermes',
    } satisfies ChatProviderOption))
}
