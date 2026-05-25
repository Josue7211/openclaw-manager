/*
 * Copied/adapted from T3 Code apps/web/src/components/settings/ProviderInstanceCard.tsx
 * and ProviderModelsSection.tsx (MIT License).
 *
 * ClawControl uses this read-only card in chat parity settings. Editing remains
 * out of scope for this adapter, but model display/status/auth/setup/config
 * presentation follows the T3 card layer.
 */

import type { CSSProperties } from 'react'
import { ProviderInstanceIcon } from './ProviderInstanceIcon'
import type { ProviderInstanceEntry } from './providerInstances'
import type { ServerProviderModel } from './providerTypes'

export function deriveProviderModelsForDisplay(input: {
  readonly liveModels: ReadonlyArray<ServerProviderModel> | undefined
  readonly customModels: ReadonlyArray<string>
}): ReadonlyArray<ServerProviderModel> {
  const liveCustomModelsBySlug = new Map(
    (input.liveModels ?? [])
      .filter(model => model.isCustom)
      .map(model => [model.slug, model] as const),
  )
  const serverModels = input.liveModels?.filter(model => !model.isCustom) ?? []
  const customModels = input.customModels.map(
    slug => liveCustomModelsBySlug.get(slug) ?? {
      slug,
      name: slug,
      isCustom: true,
      capabilities: null,
    },
  )
  return [...serverModels, ...customModels]
}

export function providerStatusLabel(entry: ProviderInstanceEntry): string {
  if (!entry.enabled || !entry.isAvailable) return 'Needs setup'
  if (entry.status === 'error') return 'Error'
  if (entry.status === 'warning') return 'Needs setup'
  return 'Ready'
}

export function providerDetail(entry: ProviderInstanceEntry): string {
  return entry.snapshot.message
    || entry.snapshot.auth.message
    || entry.snapshot.unavailableReason
    || entry.snapshot.auth.label
    || entry.displayName
}

export function providerAuthLabel(entry: ProviderInstanceEntry): string {
  if (entry.snapshot.auth.status === 'not-required') return entry.snapshot.auth.label || 'Not required'
  if (entry.snapshot.auth.status === 'authenticated') return entry.snapshot.auth.label || 'Authenticated'
  if (entry.snapshot.auth.status === 'unauthenticated') return 'Sign in required'
  return entry.snapshot.auth.label || 'Unknown'
}

export function providerSetupLabel(entry: ProviderInstanceEntry): string {
  if (entry.driverKind === 'hermes') return 'Hermes Agent runtime config'
  return 'Unsupported provider'
}

export function providerConfigurationRows(entry: ProviderInstanceEntry): Array<{ label: string; value: string }> {
  if (entry.driverKind === 'hermes') {
    return [
      { label: 'Route', value: 'Hermes Agent' },
      { label: 'HTTP', value: 'HERMES_API_URL' },
      { label: 'WebSocket', value: 'HERMES_WS' },
      { label: 'Auth', value: 'HERMES_API_KEY/PASSWORD' },
    ]
  }
  return [{ label: 'Driver', value: entry.driverKind }]
}

export default function ProviderInstanceCard({
  entry,
  customModels = [],
}: {
  entry: ProviderInstanceEntry
  customModels?: ReadonlyArray<string>
}) {
  const ready = entry.enabled && entry.isAvailable && entry.status === 'ready'
  const modelsForDisplay = deriveProviderModelsForDisplay({
    liveModels: entry.models,
    customModels,
  })
  const configRows = providerConfigurationRows(entry)

  return (
    <article
      aria-label={`${entry.displayName} status`}
      data-provider-instance-card={entry.instanceId}
      style={cardStyle}
    >
      <div style={headerStyle}>
        <div style={identityStyle}>
          <ProviderInstanceIcon
            driverKind={entry.driverKind}
            displayName={entry.displayName}
            accentColor={entry.accentColor}
            showBadge={!entry.isDefault}
            size={28}
          />
          <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <div style={titleRowStyle}>
              <span style={titleStyle}>{entry.displayName}</span>
              {entry.snapshot.badgeLabel && (
                <span style={badgeStyle}>{entry.snapshot.badgeLabel}</span>
              )}
            </div>
            <span style={detailStyle}>{providerDetail(entry)}</span>
          </div>
        </div>
        <span
          style={{
            ...badgeStyle,
            color: ready ? 'var(--secondary)' : 'var(--text-muted)',
            borderColor: ready
              ? 'color-mix(in srgb, var(--secondary) 45%, var(--border))'
              : 'var(--border)',
          }}
        >
          {providerStatusLabel(entry)}
        </span>
      </div>

      <dl style={metaGridStyle}>
        <ProviderMeta label="Driver" value={entry.driverKind} />
        <ProviderMeta label="Auth" value={providerAuthLabel(entry)} />
        <ProviderMeta label="Setup" value={providerSetupLabel(entry)} />
        <ProviderMeta label="Chat access" value={entry.enabled && entry.isAvailable ? 'Available in chat' : 'Hidden from chat'} />
      </dl>

      <div style={configSectionStyle}>
        <div style={modelsHeaderStyle}>
          <span>Configuration</span>
          <span>Read-only</span>
        </div>
        <dl style={configGridStyle}>
          {configRows.map(row => (
            <ProviderMeta key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      </div>

      <div style={modelsSectionStyle}>
        <div style={modelsHeaderStyle}>
          <span>Models</span>
          <span>{modelsForDisplay.length > 0 ? `${modelsForDisplay.length} available` : 'Direct'}</span>
        </div>
        {modelsForDisplay.length > 0 ? (
          <div style={modelListStyle} aria-label={`${entry.displayName} models`}>
            {modelsForDisplay.slice(0, 8).map(model => (
              <span
                key={model.slug}
                style={modelPillStyle}
                title={model.slug}
              >
                {model.name || model.slug}
                {model.isCustom ? ' custom' : ''}
              </span>
            ))}
            {modelsForDisplay.length > 8 && (
              <span style={modelPillStyle}>+{modelsForDisplay.length - 8} more</span>
            )}
          </div>
        ) : (
          <div style={directModelStyle}>No models reported</div>
        )}
      </div>
    </article>
  )
}

function ProviderMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd style={{
        margin: 0,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </dd>
    </div>
  )
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  display: 'grid',
  gap: 12,
  padding: 12,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const identityStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  minWidth: 0,
}

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const titleStyle: CSSProperties = {
  fontWeight: 800,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const detailStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const metaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '8px 12px',
  margin: 0,
  fontSize: 12,
}

const modelsSectionStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  borderTop: '1px solid var(--border)',
  paddingTop: 10,
}

const configSectionStyle: CSSProperties = {
  ...modelsSectionStyle,
}

const configGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '8px 12px',
  margin: 0,
  fontSize: 12,
}

const modelsHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 700,
}

const modelListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const badgeStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

const modelPillStyle: CSSProperties = {
  ...badgeStyle,
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const directModelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
}
