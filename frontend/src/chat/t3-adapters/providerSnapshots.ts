/*
 * Copied/adapted from T3 Code's provider snapshot and instance projection.
 * clawctrl translates its backend readiness payload into T3-shaped
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
const HERMES_NOT_CONFIGURED_MESSAGE = 'Hermes Agent is not configured. Open Settings > Connections to connect it.'
const LEGACY_NOT_CONFIGURED_RE = /\b(?:harness_not_configured|harness\s+not\s+configured)\b/i
const LEGACY_HARNESS_URL_RE = /\bHarness(?:\s+Agent)?\s+URL\s+is\s+not\s+configured\b/i
const LEGACY_PROVIDER_RE = /\b(?:codex-cli|codex cli|claudeagent|claude code|openclaw)\b/i

function normalizeHermesProviderDetail(detail?: string): string | undefined {
  const trimmed = detail?.trim()
  if (!trimmed) return undefined
  if (LEGACY_NOT_CONFIGURED_RE.test(trimmed) || LEGACY_HARNESS_URL_RE.test(trimmed)) {
    return HERMES_NOT_CONFIGURED_MESSAGE
  }
  if (LEGACY_PROVIDER_RE.test(trimmed)) {
    return 'Hermes Agent is the active agent right now.'
  }
  return trimmed
}

export function hermesProviderSnapshot(
  models: ModelOption[] = [],
  input: { ready?: boolean; detail?: string } = {},
): ServerProvider {
  const ready = input.ready ?? true
  const detail = normalizeHermesProviderDetail(input.detail)
  return {
    instanceId: 'hermes',
    driver: 'hermes',
    displayName: 'Hermes Agent',
    enabled: ready,
    installed: ready,
    version: null,
    status: ready ? 'ready' : 'warning',
    auth: { status: 'not-required', label: 'Hermes Agent', message: detail },
    checkedAt: nowIso(),
    message: detail,
    availability: ready ? 'available' : 'unavailable',
    unavailableReason: ready ? undefined : detail || 'Hermes Agent is not configured.',
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

export function normalizeChatProviderSnapshots(input: {
  providers?: LegacyProvider[]
  models?: ModelOption[]
}): ServerProvider[] {
  const models = input.models ?? []
  const legacy = input.providers ?? []
  const hermes = legacy.find(provider => provider.id === 'hermes')
  return [
    hermesProviderSnapshot(models, {
      ready: hermes ? Boolean(hermes.ready ?? hermes.selectable ?? true) : true,
      detail: hermes?.detail || hermes?.description,
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
    .map(entry => ({
      id: entry.instanceId,
      name: entry.displayName,
      description: entry.snapshot.message
        || entry.snapshot.auth.message
        || entry.snapshot.auth.label
        || entry.displayName,
      local: false,
      modelBacked: entry.driverKind === 'hermes',
      available: entry.enabled && entry.isAvailable,
      unavailableReason: entry.enabled && entry.isAvailable
        ? undefined
        : entry.snapshot.unavailableReason
          || entry.snapshot.message
          || entry.snapshot.auth.message
          || `${entry.displayName} is not available.`,
    } satisfies ChatProviderOption))
}
