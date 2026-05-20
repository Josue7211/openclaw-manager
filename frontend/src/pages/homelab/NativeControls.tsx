import { useEffect, useMemo, useState } from 'react'
import type React from 'react'

import type {
  DockerContainerInfo,
  HomelabControlInput,
  HomelabData,
  NodeInfo,
  PortainerConfigAssetInfo,
  PortainerEndpointInfo,
  PortainerImageInfo,
  PortainerInstanceInfo,
  PortainerNetworkInfo,
  PortainerRegistryInfo,
  PortainerSecretInfo,
  PortainerStackInfo,
  PortainerVolumeInfo,
  ProxmoxBackupInfo,
  ProxmoxHaResourceInfo,
  ProxmoxServiceInfo,
  ProxmoxStorageInfo,
  ProxmoxTaskInfo,
  VMInfo,
} from './types'
import {
  configValue,
  firstFirewallRulePos,
  firstSnapshotName,
  formatBytes,
  formatUptime,
  matchesQuery,
  normalizeFilter,
  proxmoxGuestMeta,
  shortId,
} from './helpers'
import { CpuBar, MemBar, StatusDot, card, editorInputStyle, editorTextareaStyle, label, smallButtonStyle } from './components'

type FieldKind = 'text' | 'number' | 'textarea' | 'checkbox' | 'select'

interface ActionField {
  key: string
  label: string
  kind?: FieldKind
  required?: boolean
  defaultValue?: string | number | boolean
  options?: string[]
}

interface NativeAction {
  label: string
  input: HomelabControlInput
  target: string
  fields?: ActionField[]
  danger?: boolean
  typed?: boolean
  confirm?: boolean
}

interface PendingAction extends NativeAction {
  values: Record<string, string | number | boolean>
  confirmation: string
}

interface NativeControlProps {
  busyAction: string | null
  filter: string
  onRun: (input: HomelabControlInput, targetLabel: string) => Promise<void>
  onOpenStackEditor?: (targetLabel: string, input: HomelabControlInput) => Promise<void> | void
}

interface PortainerConsoleProps extends NativeControlProps {
  instances: PortainerInstanceInfo[]
}

interface ProxmoxConsoleProps extends NativeControlProps {
  data: HomelabData
}

type PortainerResource =
  | { kind: 'endpoint'; instance: PortainerInstanceInfo; item: PortainerEndpointInfo }
  | { kind: 'stack'; instance: PortainerInstanceInfo; item: PortainerStackInfo }
  | { kind: 'container'; instance: PortainerInstanceInfo; item: DockerContainerInfo }
  | { kind: 'image'; instance: PortainerInstanceInfo; item: PortainerImageInfo }
  | { kind: 'volume'; instance: PortainerInstanceInfo; item: PortainerVolumeInfo }
  | { kind: 'network'; instance: PortainerInstanceInfo; item: PortainerNetworkInfo }
  | { kind: 'secret'; instance: PortainerInstanceInfo; item: PortainerSecretInfo }
  | { kind: 'config'; instance: PortainerInstanceInfo; item: PortainerConfigAssetInfo }
  | { kind: 'registry'; instance: PortainerInstanceInfo; item: PortainerRegistryInfo }

type PortainerResourceKind = PortainerResource['kind']

type ProxmoxResource =
  | { kind: 'node'; item: NodeInfo }
  | { kind: 'guest'; item: VMInfo }
  | { kind: 'storage'; item: ProxmoxStorageInfo }
  | { kind: 'backup'; item: ProxmoxBackupInfo }
  | { kind: 'ha'; item: ProxmoxHaResourceInfo }
  | { kind: 'service'; item: ProxmoxServiceInfo }
  | { kind: 'task'; item: ProxmoxTaskInfo }

const shellStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
  gap: '14px',
  alignItems: 'start',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'center',
}

const pillStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  borderRadius: '999px',
  padding: '5px 9px',
  fontSize: '11px',
  fontFamily: 'monospace',
}

const compactTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
}

const compactCellStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderTop: '1px solid var(--border)',
  verticalAlign: 'middle',
  fontSize: '12px',
  color: 'var(--text-secondary)',
}

const kindOrder: PortainerResourceKind[] = [
  'endpoint',
  'stack',
  'container',
  'image',
  'volume',
  'network',
  'secret',
  'config',
  'registry',
]

const kindNames: Record<PortainerResourceKind, string> = {
  endpoint: 'Environments',
  stack: 'Stacks',
  container: 'Containers',
  image: 'Images',
  volume: 'Volumes',
  network: 'Networks',
  secret: 'Secrets',
  config: 'Configs',
  registry: 'Registries',
}

function actionKey(input: HomelabControlInput): string {
  return `${input.provider}:${input.resourceType}:${input.resourceId}:${input.action}`
}

function isDestructive(action: string): boolean {
  return (
    action === 'delete' ||
    action === 'remove' ||
    action === 'update-stack' ||
    action === 'recreate' ||
    action === 'restore' ||
    action === 'rollback-snapshot' ||
    action.startsWith('remove-') ||
    action.startsWith('delete-') ||
    action.startsWith('prune')
  )
}

function fieldDefaults(fields: ActionField[] = []): Record<string, string | number | boolean> {
  return Object.fromEntries(fields.map(field => [field.key, field.defaultValue ?? (field.kind === 'checkbox' ? false : '')]))
}

function toArgs(values: Record<string, string | number | boolean>): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'boolean') {
      args[key] = value
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) args[key] = value
    } else if (value.trim()) {
      args[key] = value
    }
  }
  return args
}

function resourceId(resource: PortainerResource | ProxmoxResource): string {
  if ('instance' in resource) {
    const item = resource.item as { id?: string | number; name?: string; endpoint_id?: number }
    return `${resource.kind}:${resource.instance.id}:${item.endpoint_id ?? 'global'}:${item.id ?? item.name ?? 'item'}`
  }
  const item = resource.item as { name?: string; vmid?: number; volid?: string; sid?: string; id?: string; upid?: string }
  return `${resource.kind}:${item.vmid ?? item.name ?? item.volid ?? item.sid ?? item.upid ?? item.id ?? 'item'}`
}

function portainerResourceName(resource: PortainerResource): string {
  const item = resource.item as { name?: string; id?: string | number }
  return item.name || shortId(String(item.id ?? resource.kind))
}

function portainerEndpointId(resource: PortainerResource): number | undefined {
  if (resource.kind === 'endpoint') return resource.item.id
  if (resource.kind === 'registry') return undefined
  return (resource.item as { endpoint_id?: number }).endpoint_id
}

function portainerStatus(resource: PortainerResource): string {
  if (resource.kind === 'endpoint') return resource.item.status === 1 ? 'online' : 'offline'
  const item = resource.item as { status?: string; state?: string }
  return item.state ?? item.status ?? 'online'
}

function portainerMeta(resource: PortainerResource): string {
  if (resource.kind === 'container') return `${resource.item.image} · ${resource.item.ports || 'no published ports'}`
  if (resource.kind === 'stack') return `stack ${resource.item.id} · endpoint ${resource.item.endpoint_id ?? '-'}`
  if (resource.kind === 'image') return `${formatBytes(resource.item.size)} · ${resource.item.tags?.join(', ') || resource.item.id}`
  if (resource.kind === 'volume') return `${resource.item.driver ?? 'local'} · ${resource.item.mountpoint ?? 'no mountpoint'}`
  if (resource.kind === 'network') return `${resource.item.driver ?? 'network'} · ${resource.item.scope ?? 'scope unknown'}`
  if (resource.kind === 'registry') return resource.item.url ?? 'registry'
  if (resource.kind === 'endpoint') return resource.item.url ?? `endpoint ${resource.item.id}`
  return (resource.item as { created_at?: string }).created_at ?? resource.kind
}

function portainerEndpointName(resource: PortainerResource): string {
  if (resource.kind === 'endpoint') return resource.item.name
  if (resource.kind === 'registry') return 'global'
  return (resource.item as { endpoint_name?: string; endpoint_id?: number }).endpoint_name ?? `endpoint ${(resource.item as { endpoint_id?: number }).endpoint_id ?? '-'}`
}

function portainerPrimaryActions(resource: PortainerResource): string[] {
  if (resource.kind === 'container') return ['logs', 'stats', 'inspect', 'duplicate', 'recreate', 'restart', 'start', 'stop', 'remove']
  if (resource.kind === 'stack') return ['inspect-stack', 'stack-file', 'stack-logs', 'start-stack', 'stop-stack', 'update-stack', 'redeploy', 'delete']
  return []
}

function nativeButton(action: NativeAction, busyAction: string | null, open: (action: NativeAction) => void) {
  const busy = busyAction === actionKey(action.input)
  return (
    <button
      key={`${action.label}-${action.input.resourceType}-${action.input.resourceId}`}
      onClick={() => open(action)}
      disabled={busyAction !== null}
      style={{
        ...smallButtonStyle,
        padding: '6px 9px',
        borderRadius: '7px',
        background: action.danger ? 'var(--red-500-a12)' : 'var(--bg-elevated)',
        borderColor: action.danger ? 'var(--red-500-a25)' : 'var(--border)',
        color: action.danger ? 'var(--red-bright)' : 'var(--text-secondary)',
        opacity: busyAction !== null && !busy ? 0.5 : 1,
      }}
    >
      {busy ? '...' : action.label}
    </button>
  )
}

function ActionModal({
  pending,
  busyAction,
  onClose,
  onSubmit,
}: {
  pending: PendingAction | null
  busyAction: string | null
  onClose: () => void
  onSubmit: (pending: PendingAction) => void
}) {
  if (!pending) return null
  const busy = busyAction === actionKey(pending.input)
  const fields = pending.fields ?? []
  const needsTyped = pending.typed || (pending.danger && isDestructive(pending.input.action))
  const disabled =
    busy ||
    fields.some(field => field.required && !String(pending.values[field.key] ?? '').trim()) ||
    (needsTyped && pending.confirmation !== pending.target)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.48)',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(680px, 94vw)',
          height: '100%',
          overflow: 'auto',
          background: 'var(--bg-card-solid)',
          borderLeft: '1px solid var(--border)',
          padding: '22px',
        }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{pending.label}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>{pending.target}</div>
          </div>
          <button onClick={onClose} style={smallButtonStyle}>
            Close
          </button>
        </div>
        {fields.map(field => {
          const common = {
            value: String(pending.values[field.key] ?? ''),
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
              const raw = event.currentTarget.value
              pending.values[field.key] = field.kind === 'number' ? (raw.trim() ? Number(raw) : '') : raw
              onSubmit({ ...pending })
            },
          }
          return (
            <label key={field.key} style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ ...label, display: 'block', marginBottom: '6px' }}>{field.label}</span>
              {field.kind === 'textarea' ? (
                <textarea {...common} style={{ ...editorTextareaStyle, minHeight: '180px' }} />
              ) : field.kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(pending.values[field.key])}
                  onChange={event => {
                    pending.values[field.key] = event.currentTarget.checked
                    onSubmit({ ...pending })
                  }}
                />
              ) : field.kind === 'select' ? (
                <select {...common} style={editorInputStyle}>
                  {(field.options ?? []).map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={field.kind === 'number' ? 'number' : 'text'} {...common} style={editorInputStyle} />
              )}
            </label>
          )
        })}
        {needsTyped && (
          <label style={{ display: 'block', marginBottom: '14px' }}>
            <span style={{ ...label, display: 'block', marginBottom: '6px' }}>Type target to confirm</span>
            <input
              value={pending.confirmation}
              onChange={event => onSubmit({ ...pending, confirmation: event.currentTarget.value })}
              placeholder={pending.target}
              style={{
                ...editorInputStyle,
                borderColor: pending.confirmation && pending.confirmation !== pending.target ? 'var(--red-500-a25)' : 'var(--border)',
              }}
            />
          </label>
        )}
        {pending.confirm && !needsTyped && (
          <div style={{ ...card, padding: '12px', marginBottom: '14px', background: 'var(--gold-a12)' }}>
            <div style={{ color: 'var(--gold)', fontWeight: 800, fontSize: '12px' }}>Confirm action</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
              This will run {pending.input.action} on {pending.target}.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={smallButtonStyle}>
            Cancel
          </button>
          <button
            disabled={disabled}
            onClick={() => onSubmit({ ...pending, input: { ...pending.input, args: { ...(pending.input.args ?? {}), ...toArgs(pending.values) }, confirmation: needsTyped ? pending.confirmation : undefined } })}
            style={{
              ...smallButtonStyle,
              background: pending.danger ? 'var(--red-500)' : 'var(--accent)',
              color: 'var(--text-on-color)',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {busy ? 'Running...' : pending.label}
          </button>
        </div>
      </div>
    </div>
  )
}

function useNativeActions(onRun: NativeControlProps['onRun'], busyAction: string | null) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const open = (action: NativeAction) => {
    if (!action.fields?.length && !action.danger && !action.confirm && !isDestructive(action.input.action)) {
      void onRun(action.input, action.target)
      return
    }
    setPending({ ...action, values: fieldDefaults(action.fields), confirmation: '' })
  }
  const submit = (next: PendingAction) => {
    if (next.input.args !== pending?.input.args || next.input.confirmation !== pending?.input.confirmation) {
      void onRun(next.input, next.target).then(() => setPending(null))
      return
    }
    setPending(next)
  }
  const modal = <ActionModal pending={pending} busyAction={busyAction} onClose={() => setPending(null)} onSubmit={submit} />
  return { open, modal }
}

function SidebarList({
  title,
  groups,
  selectedId,
  onSelect,
}: {
  title: string
  groups: Array<{ label: string; rows: Array<{ id: string; name: string; meta: string; status: string }> }>
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ ...card, padding: '12px', position: 'sticky', top: '12px' }}>
      <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px' }}>{title}</div>
      {groups.map(group => (
        <div key={group.label} style={{ marginBottom: '14px' }}>
          <div style={{ ...label, marginBottom: '7px' }}>{group.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {group.rows.map(row => (
              <button
                key={row.id}
                onClick={() => onSelect(row.id)}
                style={{
                  textAlign: 'left',
                  border: '1px solid',
                  borderColor: row.id === selectedId ? 'var(--accent-a40)' : 'transparent',
                  background: row.id === selectedId ? 'var(--accent-a10)' : 'transparent',
                  color: 'var(--text-primary)',
                  borderRadius: '7px',
                  padding: '8px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <StatusDot status={row.status} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                    {row.name}
                  </span>
                </span>
                <span
                  style={{
                    display: 'block',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '3px',
                  }}
                >
                  {row.meta}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailHeader({ title, meta, children }: { title: string; meta: string; children?: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 900 }}>{title}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '5px', fontFamily: 'monospace' }}>{meta}</div>
        </div>
        <div style={toolbarStyle}>{children}</div>
      </div>
    </div>
  )
}

function PortainerJumpBar({
  resources,
  selectedEndpointId,
  onSelectKind,
}: {
  resources: PortainerResource[]
  selectedEndpointId?: number
  onSelectKind: (kind: PortainerResourceKind) => void
}) {
  return (
    <div style={{ ...card, padding: '10px 12px', marginBottom: '12px' }}>
      <div style={{ ...label, marginBottom: '8px' }}>Jump to resource type</div>
      <div style={toolbarStyle}>
        {kindOrder.map(kind => {
          const count = resources.filter(resource => {
            if (resource.kind !== kind) return false
            if (selectedEndpointId === undefined || resource.kind === 'endpoint' || resource.kind === 'registry') return true
            return portainerEndpointId(resource) === selectedEndpointId
          }).length
          return (
            <button
              key={kind}
              onClick={() => onSelectKind(kind)}
              disabled={!count}
              style={{
                ...smallButtonStyle,
                opacity: count ? 1 : 0.45,
                padding: '6px 9px',
              }}
            >
              {kindNames[kind]} {count}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PortainerResourceTable({
  title,
  rows,
  selectedId,
  busyAction,
  empty,
  onSelect,
  open,
  onOpenStackEditor,
}: {
  title: string
  rows: PortainerResource[]
  selectedId: string
  busyAction: string | null
  empty: string
  onSelect: (id: string) => void
  open: (action: NativeAction) => void
  onOpenStackEditor?: NativeControlProps['onOpenStackEditor']
}) {
  return (
    <div style={{ ...card, padding: '12px', marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
        <span style={pillStyle}>{rows.length}</span>
      </div>
      {!rows.length ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{empty}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={compactTableStyle}>
            <tbody>
              {rows.map(row => {
                const id = resourceId(row)
                const actions = portainerActions(row).filter(action => portainerPrimaryActions(row).includes(action.label))
                return (
                  <tr key={id} style={{ background: id === selectedId ? 'var(--accent-a10)' : 'transparent' }}>
                    <td style={{ ...compactCellStyle, width: '28%' }}>
                      <button
                        onClick={() => onSelect(id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          fontWeight: 800,
                          padding: 0,
                          cursor: 'pointer',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {portainerResourceName(row)}
                      </button>
                      <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px', marginTop: '3px' }}>
                        {portainerEndpointName(row)}
                      </div>
                    </td>
                    <td style={{ ...compactCellStyle, width: '12%' }}>
                      <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <StatusDot status={portainerStatus(row)} />
                        {portainerStatus(row)}
                      </span>
                    </td>
                    <td style={{ ...compactCellStyle, width: '26%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {portainerMeta(row)}
                    </td>
                    <td style={compactCellStyle}>
                      <div style={toolbarStyle}>
                        {actions.map(action =>
                          action.label === 'update-stack' && row.kind === 'stack' && onOpenStackEditor
                            ? nativeButton(action, busyAction, pending => void onOpenStackEditor(pending.target, pending.input))
                            : nativeButton(action, busyAction, open),
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KV({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={label}>{name}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function InfoGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
      {rows.map(([name, value]) => (
        <KV key={name} name={name} value={value} />
      ))}
    </div>
  )
}

function endpointBase(instance: PortainerInstanceInfo, endpoint: PortainerEndpointInfo): HomelabControlInput {
  return {
    provider: 'portainer',
    instanceId: instance.id,
    resourceType: 'endpoint',
    resourceId: String(endpoint.id),
    args: { name: endpoint.name },
    action: 'inspect-endpoint',
  }
}

function portainerActions(resource: PortainerResource): NativeAction[] {
  const instanceId = resource.instance.id
  if (resource.kind === 'endpoint') {
    const endpoint = resource.item
    const base = endpointBase(resource.instance, endpoint)
    return [
      { label: 'inspect-endpoint', target: endpoint.name, input: { ...base, action: 'inspect-endpoint' } },
      { label: 'pull-image', target: endpoint.name, input: { ...base, action: 'pull-image' }, fields: [{ key: 'image', label: 'Image', required: true }, { key: 'tag', label: 'Tag', defaultValue: 'latest' }] },
      {
        label: 'create-container',
        target: endpoint.name,
        input: { ...base, action: 'create-container' },
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'image', label: 'Image', required: true },
          { key: 'restart_policy', label: 'Restart policy', defaultValue: 'unless-stopped', kind: 'select', options: ['no', 'always', 'unless-stopped', 'on-failure'] },
          { key: 'ports', label: 'Ports', defaultValue: '8080:80/tcp' },
          { key: 'env', label: 'Environment', defaultValue: 'KEY=value' },
          { key: 'binds', label: 'Bind mounts' },
          { key: 'network', label: 'Network mode' },
          { key: 'memory_mb', label: 'Memory MiB', kind: 'number' },
          { key: 'cpu_shares', label: 'CPU shares', kind: 'number', defaultValue: 1024 },
          { key: 'privileged', label: 'Privileged', kind: 'checkbox' },
        ],
      },
      {
        label: 'create-stack',
        target: endpoint.name,
        input: { ...base, action: 'create-stack' },
        fields: [
          { key: 'name', label: 'Stack name', required: true },
          { key: 'stack_file_content', label: 'Compose YAML', kind: 'textarea', required: true },
          { key: 'env', label: 'Environment' },
        ],
      },
      { label: 'create-volume', target: endpoint.name, input: { ...base, action: 'create-volume' }, fields: [{ key: 'name', label: 'Volume name', required: true }, { key: 'driver', label: 'Driver', defaultValue: 'local' }] },
      { label: 'create-network', target: endpoint.name, input: { ...base, action: 'create-network' }, fields: [{ key: 'name', label: 'Network name', required: true }, { key: 'driver', label: 'Driver', defaultValue: 'bridge' }] },
      { label: 'create-secret', target: endpoint.name, input: { ...base, action: 'create-secret' }, fields: [{ key: 'name', label: 'Secret name', required: true }, { key: 'data', label: 'Secret value', kind: 'textarea', required: true }, { key: 'labels', label: 'Labels' }] },
      { label: 'create-config', target: endpoint.name, input: { ...base, action: 'create-config' }, fields: [{ key: 'name', label: 'Config name', required: true }, { key: 'data', label: 'Config content', kind: 'textarea', required: true }, { key: 'labels', label: 'Labels' }] },
      ...['prune-images', 'prune-containers', 'prune-volumes', 'prune-networks'].map(action => ({ label: action, target: endpoint.name, input: { ...base, action }, danger: true, confirm: true })),
    ]
  }
  if (resource.kind === 'container') {
    const item = resource.item
    const target = item.name || shortId(item.id)
    const base = {
      provider: 'portainer' as const,
      instanceId,
      resourceType: 'container',
      resourceId: item.id,
      args: { endpoint_id: item.endpoint_id, name: target },
    }
    return [
      { label: 'logs', target, input: { ...base, action: 'logs' } },
      { label: 'inspect', target, input: { ...base, action: 'inspect' } },
      { label: 'stats', target, input: { ...base, action: 'stats' } },
      { label: 'exec', target, input: { ...base, action: 'exec' }, fields: [{ key: 'command', label: 'Command', defaultValue: 'id', required: true }] },
      { label: 'rename', target, input: { ...base, action: 'rename' }, fields: [{ key: 'new_name', label: 'New name', defaultValue: target, required: true }] },
      { label: 'duplicate', target, input: { ...base, action: 'duplicate' }, fields: [{ key: 'new_name', label: 'Duplicate name', defaultValue: `${target}-copy`, required: true }, { key: 'start', label: 'Start after duplicate', kind: 'checkbox', defaultValue: item.state === 'running' }] },
      { label: 'recreate', target, input: { ...base, action: 'recreate' }, danger: true, typed: true, fields: [{ key: 'start', label: 'Start after recreate', kind: 'checkbox', defaultValue: item.state === 'running' }] },
      { label: 'update-restart-policy', target, input: { ...base, action: 'update-restart-policy' }, fields: [{ key: 'restart_policy', label: 'Restart policy', kind: 'select', options: ['no', 'always', 'unless-stopped', 'on-failure'], defaultValue: 'unless-stopped' }] },
      { label: 'update-resources', target, input: { ...base, action: 'update-resources' }, fields: [{ key: 'memory_mb', label: 'Memory MiB', kind: 'number' }, { key: 'cpu_shares', label: 'CPU shares', kind: 'number', defaultValue: 1024 }] },
      item.state === 'running' ? { label: 'restart', target, input: { ...base, action: 'restart' }, danger: true, confirm: true } : { label: 'start', target, input: { ...base, action: 'start' } },
      item.state === 'running' ? { label: 'stop', target, input: { ...base, action: 'stop' }, danger: true, confirm: true } : { label: 'unpause', target, input: { ...base, action: 'unpause' } },
      { label: item.state === 'running' ? 'pause' : 'unpause', target, input: { ...base, action: item.state === 'running' ? 'pause' : 'unpause' }, confirm: item.state === 'running' },
      { label: 'kill', target, input: { ...base, action: 'kill' }, danger: true, confirm: true },
      { label: 'remove', target, input: { ...base, action: 'remove' }, danger: true, typed: true },
    ]
  }
  if (resource.kind === 'stack') {
    const item = resource.item
    const target = item.name
    const base = { provider: 'portainer' as const, instanceId, resourceType: 'stack', resourceId: String(item.id), args: { endpoint_id: item.endpoint_id, name: target } }
    return [
      { label: 'inspect-stack', target, input: { ...base, action: 'inspect-stack' } },
      { label: 'stack-file', target, input: { ...base, action: 'stack-file' } },
      { label: 'stack-logs', target, input: { ...base, action: 'stack-logs' } },
      { label: 'start-stack', target, input: { ...base, action: 'start-stack' } },
      { label: 'stop-stack', target, input: { ...base, action: 'stop-stack' }, danger: true, confirm: true },
      { label: 'update-stack', target, input: { ...base, action: 'update-stack' }, danger: true, typed: true },
      { label: 'redeploy', target, input: { ...base, action: 'redeploy' }, danger: true, confirm: true },
      { label: 'delete', target, input: { ...base, action: 'delete' }, danger: true, typed: true },
    ]
  }
  const item = resource.item as { id?: string | number; name: string; endpoint_id?: number; instance_id?: string; url?: string; type?: number; authentication?: boolean }
  const target = item.name
  const base = { provider: 'portainer' as const, instanceId: item.instance_id ?? instanceId, resourceType: resource.kind, resourceId: String(item.id ?? item.name), args: { endpoint_id: item.endpoint_id, name: item.name } }
  if (resource.kind === 'image') return [
    { label: 'inspect-image', target, input: { ...base, action: 'inspect-image' } },
    { label: 'history-image', target, input: { ...base, action: 'history-image' } },
    { label: 'tag-image', target, input: { ...base, action: 'tag-image' }, fields: [{ key: 'repo', label: 'Repository', defaultValue: target, required: true }, { key: 'tag', label: 'Tag', defaultValue: 'latest', required: true }] },
    { label: 'remove-image', target, input: { ...base, action: 'remove-image' }, danger: true, typed: true },
  ]
  if (resource.kind === 'network') return [
    { label: 'inspect-network', target, input: { ...base, action: 'inspect-network' } },
    { label: 'connect-container', target, input: { ...base, action: 'connect-container' }, fields: [{ key: 'container', label: 'Container id/name', required: true }] },
    { label: 'disconnect-container', target, input: { ...base, action: 'disconnect-container' }, danger: true, confirm: true, fields: [{ key: 'container', label: 'Container id/name', required: true }] },
    { label: 'remove-network', target, input: { ...base, action: 'remove-network' }, danger: true, typed: true },
  ]
  if (resource.kind === 'registry') return [
    { label: 'inspect-registry', target, input: { ...base, action: 'inspect-registry' } },
    { label: 'update-registry', target, input: { ...base, action: 'update-registry' }, fields: [{ key: 'name', label: 'Name', defaultValue: target, required: true }, { key: 'url', label: 'URL', defaultValue: item.url ?? '', required: true }, { key: 'type', label: 'Type', kind: 'number', defaultValue: item.type ?? 1 }, { key: 'authentication', label: 'Authentication', kind: 'checkbox', defaultValue: item.authentication ?? false }, { key: 'username', label: 'Username' }, { key: 'password', label: 'Password/token' }] },
    { label: 'remove-registry', target, input: { ...base, action: 'remove-registry' }, danger: true, typed: true },
  ]
  return [
    { label: `inspect-${resource.kind}`, target, input: { ...base, action: `inspect-${resource.kind}` } },
    { label: `remove-${resource.kind}`, target, input: { ...base, action: `remove-${resource.kind}` }, danger: true, typed: true },
  ]
}

function createRegistryAction(instance: PortainerInstanceInfo): NativeAction {
  return {
    label: 'create-registry',
    target: instance.name,
    input: {
      provider: 'portainer',
      instanceId: instance.id,
      resourceType: 'registry',
      resourceId: instance.id,
      action: 'create-registry',
      args: { name: `${instance.name}-registry`, type: 1 },
    },
    fields: [
      { key: 'name', label: 'Name', defaultValue: `${instance.name}-registry`, required: true },
      { key: 'url', label: 'URL', required: true },
      { key: 'type', label: 'Type', kind: 'number', defaultValue: 1 },
      { key: 'authentication', label: 'Authentication', kind: 'checkbox' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password/token' },
    ],
  }
}

export function NativePortainerConsole({ instances, filter, busyAction, onRun, onOpenStackEditor }: PortainerConsoleProps) {
  const query = normalizeFilter(filter)
  const { open, modal } = useNativeActions(onRun, busyAction)
  const resources = useMemo<PortainerResource[]>(() => {
    const rows: PortainerResource[] = []
    for (const instance of instances) {
      for (const item of instance.endpoints) if (matchesQuery(query, item.name, item.id)) rows.push({ kind: 'endpoint', instance, item })
      for (const item of instance.stacks) if (matchesQuery(query, item.name, item.endpoint_id)) rows.push({ kind: 'stack', instance, item })
      for (const item of instance.containers) if (matchesQuery(query, item.name, item.image, item.status, item.endpoint_name)) rows.push({ kind: 'container', instance, item })
      for (const item of instance.images ?? []) if (matchesQuery(query, item.name, item.tags?.join(' '), item.endpoint_name)) rows.push({ kind: 'image', instance, item })
      for (const item of instance.volumes ?? []) if (matchesQuery(query, item.name, item.driver, item.endpoint_name)) rows.push({ kind: 'volume', instance, item })
      for (const item of instance.networks ?? []) if (matchesQuery(query, item.name, item.driver, item.endpoint_name)) rows.push({ kind: 'network', instance, item })
      for (const item of instance.secrets ?? []) if (matchesQuery(query, item.name, item.endpoint_name)) rows.push({ kind: 'secret', instance, item })
      for (const item of instance.configs ?? []) if (matchesQuery(query, item.name, item.endpoint_name)) rows.push({ kind: 'config', instance, item })
      for (const item of instance.registries ?? []) if (matchesQuery(query, item.name, item.url)) rows.push({ kind: 'registry', instance, item })
    }
    return rows
  }, [instances, query])
  const [selectedId, setSelectedId] = useState('')
  useEffect(() => {
    if (!resources.some(resource => resourceId(resource) === selectedId)) setSelectedId(resources[0] ? resourceId(resources[0]) : '')
  }, [resources, selectedId])
  const selected = resources.find(resource => resourceId(resource) === selectedId) ?? resources[0]
  if (!instances.length) return <div style={card}>No Portainer providers configured.</div>

  const groups = kindOrder.map(kind => ({
    label: kindNames[kind],
    rows: resources
      .filter(resource => resource.kind === kind)
      .map(resource => {
        return {
          id: resourceId(resource),
          name: portainerResourceName(resource),
          meta: `${resource.instance.name} · ${portainerEndpointName(resource)}`,
          status: portainerStatus(resource),
        }
      }),
  })).filter(group => group.rows.length)

  const actions = selected ? portainerActions(selected) : []
  const createRegistry = selected ? createRegistryAction(selected.instance) : null
  const title = selected ? ((selected.item as { name?: string; id?: string | number }).name || String((selected.item as { id?: string | number }).id)) : 'Portainer'
  const meta = selected ? `${selected.kind} · ${selected.instance.name}` : 'No resource selected'
  const focusedEndpointId =
    selected && selected.kind !== 'registry'
      ? portainerEndpointId(selected)
      : instances.find(instance => instance.endpoints.length)?.endpoints[0]?.id
  const focusedEndpointResources = resources.filter(resource => {
    if (resource.kind === 'endpoint' || resource.kind === 'registry') return false
    return focusedEndpointId === undefined || portainerEndpointId(resource) === focusedEndpointId
  })
  const focusedStacks = focusedEndpointResources.filter((resource): resource is Extract<PortainerResource, { kind: 'stack' }> => resource.kind === 'stack')
  const focusedContainers = focusedEndpointResources.filter((resource): resource is Extract<PortainerResource, { kind: 'container' }> => resource.kind === 'container')
  const selectFirstKind = (kind: PortainerResourceKind) => {
    const next =
      resources.find(resource => resource.kind === kind && (focusedEndpointId === undefined || resource.kind === 'endpoint' || resource.kind === 'registry' || portainerEndpointId(resource) === focusedEndpointId)) ??
      resources.find(resource => resource.kind === kind)
    if (next) setSelectedId(resourceId(next))
  }
  return (
    <div style={shellStyle}>
      <SidebarList title="Portainer" groups={groups} selectedId={selected ? resourceId(selected) : ''} onSelect={setSelectedId} />
      <div>
        {selected && (
          <>
            <PortainerJumpBar resources={resources} selectedEndpointId={focusedEndpointId} onSelectKind={selectFirstKind} />
            <DetailHeader title={title} meta={meta}>
              {createRegistry ? nativeButton(createRegistry, busyAction, open) : null}
              {actions.map(action =>
                action.label === 'update-stack' && selected.kind === 'stack' && onOpenStackEditor
                  ? nativeButton(action, busyAction, pending => void onOpenStackEditor(pending.target, pending.input))
                  : nativeButton(action, busyAction, open),
              )}
            </DetailHeader>
            <InfoGrid
              rows={[
                ['Kind', selected.kind],
                ['Instance', selected.instance.name],
                ['Endpoint', 'endpoint_name' in selected.item ? selected.item.endpoint_name || selected.item.endpoint_id || '-' : 'endpoint_id' in selected.item ? selected.item.endpoint_id || '-' : '-'],
                ['Status', 'state' in selected.item ? selected.item.state : 'status' in selected.item ? String(selected.item.status ?? '-') : '-'],
                ['ID', String(('id' in selected.item && selected.item.id) || ('resourceId' in selected.item && selected.item.resourceId) || '-')],
              ]}
            />
            {selected.kind === 'container' && (
              <InfoGrid rows={[['Image', selected.item.image], ['Ports', selected.item.ports || 'none'], ['Provider', selected.item.provider || 'portainer']]} />
            )}
            {selected.kind === 'stack' && <InfoGrid rows={[['Stack id', selected.item.id], ['Endpoint id', selected.item.endpoint_id ?? '-'], ['Type', selected.item.type ?? '-']]} />}
            {selected.kind === 'endpoint' && (
              <div style={{ ...card, marginTop: '12px' }}>
                <div style={{ ...label, marginBottom: '8px' }}>Environment inventory</div>
                <div style={toolbarStyle}>
                  <span style={pillStyle}>{selected.instance.containers.filter(item => item.endpoint_id === selected.item.id).length} containers</span>
                  <span style={pillStyle}>{selected.instance.stacks.filter(item => item.endpoint_id === selected.item.id).length} stacks</span>
                  <span style={pillStyle}>{(selected.instance.volumes ?? []).filter(item => item.endpoint_id === selected.item.id).length} volumes</span>
                  <span style={pillStyle}>{(selected.instance.networks ?? []).filter(item => item.endpoint_id === selected.item.id).length} networks</span>
                </div>
              </div>
            )}
            <PortainerResourceTable
              title="Stacks"
              rows={focusedStacks}
              selectedId={resourceId(selected)}
              busyAction={busyAction}
              empty="No stacks found in this environment."
              onSelect={setSelectedId}
              open={open}
              onOpenStackEditor={onOpenStackEditor}
            />
            <PortainerResourceTable
              title="Containers"
              rows={focusedContainers}
              selectedId={resourceId(selected)}
              busyAction={busyAction}
              empty="No containers found in this environment."
              onSelect={setSelectedId}
              open={open}
            />
          </>
        )}
        {!selected && <div style={card}>No Portainer resources match the current filter.</div>}
      </div>
      {modal}
    </div>
  )
}

function proxmoxActions(resource: ProxmoxResource): NativeAction[] {
  if (resource.kind === 'node') {
    const node = resource.item
    const base = { provider: 'proxmox' as const, resourceType: 'node', resourceId: node.name, args: { node: node.name, name: node.name } }
    return [
      { label: 'create-vm', target: node.name, input: { ...base, action: 'create-vm' }, fields: [{ key: 'vmid', label: 'VMID', kind: 'number', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'memory_mb', label: 'Memory MiB', kind: 'number', defaultValue: 2048 }, { key: 'cores', label: 'CPU cores', kind: 'number', defaultValue: 2 }, { key: 'storage', label: 'Storage', defaultValue: 'local-lvm' }, { key: 'disk_size', label: 'Disk size', defaultValue: '32G' }, { key: 'net0', label: 'Network config', defaultValue: 'virtio,bridge=vmbr0,firewall=1' }, { key: 'start', label: 'Start after create', kind: 'checkbox' }] },
      { label: 'create-lxc', target: node.name, input: { ...base, action: 'create-lxc' }, fields: [{ key: 'vmid', label: 'VMID', kind: 'number', required: true }, { key: 'hostname', label: 'Hostname', required: true }, { key: 'ostemplate', label: 'OS template', defaultValue: 'local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst', required: true }, { key: 'memory_mb', label: 'Memory MiB', kind: 'number', defaultValue: 1024 }, { key: 'cores', label: 'CPU cores', kind: 'number', defaultValue: 1 }, { key: 'storage', label: 'Storage', defaultValue: 'local-lvm' }, { key: 'disk_size', label: 'Root disk size', defaultValue: '8G' }, { key: 'net0', label: 'Network config', defaultValue: 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1' }, { key: 'start', label: 'Start after create', kind: 'checkbox' }] },
      { label: 'reboot', target: node.name, input: { ...base, action: 'reboot' }, danger: true, confirm: true },
      { label: 'shutdown', target: node.name, input: { ...base, action: 'shutdown' }, danger: true, confirm: true },
    ]
  }
  if (resource.kind === 'guest') {
    const vm = resource.item
    const target = vm.name
    const kind = vm.kind === 'lxc' ? 'lxc' : 'vm'
    const base = {
      provider: 'proxmox' as const,
      resourceType: kind,
      resourceId: String(vm.vmid ?? ''),
      args: {
        node: vm.node,
        kind: vm.kind || 'qemu',
        name: vm.name,
        memory_mb: configValue(vm.config, 'memory') ?? (vm.maxmem ? Math.round(vm.maxmem / 1_048_576) : undefined),
        cores: configValue(vm.config, 'cores'),
        disk: vm.disks?.[0]?.key ?? (vm.kind === 'lxc' ? 'rootfs' : 'scsi0'),
        storage: vm.disks?.[0]?.storage ?? 'local-lvm',
        net: vm.networks?.[0]?.key ?? 'net0',
        value: vm.networks?.[0]?.value ?? 'virtio,bridge=vmbr0,firewall=1',
      },
    }
    const firstSnap = firstSnapshotName(vm)
    const firewallPos = firstFirewallRulePos(vm)
    const actions: NativeAction[] = [
      vm.status === 'running' ? { label: 'shutdown', target, input: { ...base, action: 'shutdown' }, danger: true, confirm: true } : { label: 'start', target, input: { ...base, action: 'start' } },
      { label: 'console', target, input: { ...base, action: 'console' } },
      { label: 'set-name', target, input: { ...base, action: 'set-name' }, fields: [{ key: 'name', label: 'Name', defaultValue: vm.name, required: true }] },
      { label: 'set-description', target, input: { ...base, action: 'set-description' }, fields: [{ key: 'description', label: 'Description', kind: 'textarea', required: true }] },
      { label: 'set-tags', target, input: { ...base, action: 'set-tags' }, fields: [{ key: 'tags', label: 'Tags', required: true }] },
      { label: 'set-onboot', target, input: { ...base, action: 'set-onboot' }, fields: [{ key: 'onboot', label: 'Start at boot', kind: 'checkbox', defaultValue: Boolean(vm.config?.onboot) }] },
      { label: 'set-protection', target, input: { ...base, action: 'set-protection' }, fields: [{ key: 'protection', label: 'Protection', kind: 'checkbox', defaultValue: Boolean(vm.config?.protection) }] },
      { label: 'set-memory', target, input: { ...base, action: 'set-memory' }, fields: [{ key: 'memory_mb', label: 'Memory MiB', kind: 'number', defaultValue: Number(base.args.memory_mb ?? 2048), required: true }] },
      { label: 'set-cpu', target, input: { ...base, action: 'set-cpu' }, fields: [{ key: 'cores', label: 'CPU cores', kind: 'number', defaultValue: Number(base.args.cores ?? 2), required: true }] },
      { label: 'set-network', target, input: { ...base, action: 'set-network' }, fields: [{ key: 'net', label: 'Network key', defaultValue: base.args.net, required: true }, { key: 'value', label: 'Network config', defaultValue: base.args.value, required: true }] },
      { label: 'add-network', target, input: { ...base, action: 'add-network' }, fields: [{ key: 'net', label: 'Network key', defaultValue: 'net1', required: true }, { key: 'value', label: 'Network config', defaultValue: 'virtio,bridge=vmbr0,firewall=1', required: true }] },
      { label: 'remove-network', target, input: { ...base, action: 'remove-network' }, danger: true, typed: true, fields: [{ key: 'net', label: 'Network key', defaultValue: base.args.net, required: true }] },
      { label: 'resize-disk', target, input: { ...base, action: 'resize-disk' }, fields: [{ key: 'disk', label: 'Disk key', defaultValue: base.args.disk, required: true }, { key: 'size', label: 'New size or delta', defaultValue: '+10G', required: true }] },
      { label: 'add-disk', target, input: { ...base, action: 'add-disk' }, fields: [{ key: 'disk', label: 'Disk key', defaultValue: vm.kind === 'lxc' ? 'mp0' : 'scsi1', required: true }, { key: 'value', label: 'Disk config', defaultValue: vm.kind === 'lxc' ? 'local-lvm:8G,mp=/mnt/data' : 'local-lvm:32G,discard=on', required: true }] },
      { label: 'remove-disk', target, input: { ...base, action: 'remove-disk' }, danger: true, typed: true, fields: [{ key: 'disk', label: 'Disk key', defaultValue: base.args.disk, required: true }] },
      { label: 'snapshot', target, input: { ...base, action: 'snapshot' }, fields: [{ key: 'snapname', label: 'Snapshot name', defaultValue: `snap-${Date.now()}`, required: true }, { key: 'description', label: 'Description' }] },
      ...(firstSnap ? [
        { label: 'rollback-snapshot', target, input: { ...base, action: 'rollback-snapshot', args: { ...base.args, snapname: firstSnap } }, danger: true, typed: true },
        { label: 'delete-snapshot', target, input: { ...base, action: 'delete-snapshot', args: { ...base.args, snapname: firstSnap } }, danger: true, typed: true },
      ] satisfies NativeAction[] : []),
      { label: 'backup', target, input: { ...base, action: 'backup' }, fields: [{ key: 'mode', label: 'Mode', kind: 'select', options: ['snapshot', 'suspend', 'stop'], defaultValue: 'snapshot' }, { key: 'storage', label: 'Storage' }, { key: 'compress', label: 'Compression', defaultValue: 'zstd' }] },
      { label: 'migrate', target, input: { ...base, action: 'migrate' }, danger: true, confirm: true, fields: [{ key: 'target', label: 'Target node', required: true }, { key: 'online', label: 'Online migrate', kind: 'checkbox' }] },
      { label: 'clone', target, input: { ...base, action: 'clone' }, fields: [{ key: 'newid', label: 'New VMID', kind: 'number', required: true }, { key: 'name', label: 'Clone name', defaultValue: `${target}-clone` }] },
      { label: 'set-firewall', target, input: { ...base, action: 'set-firewall' }, fields: [{ key: 'enable', label: 'Enable firewall', kind: 'checkbox', defaultValue: true }, { key: 'policy_in', label: 'Inbound policy', kind: 'select', options: ['DROP', 'ACCEPT', 'REJECT'], defaultValue: 'DROP' }, { key: 'policy_out', label: 'Outbound policy', kind: 'select', options: ['ACCEPT', 'DROP', 'REJECT'], defaultValue: 'ACCEPT' }] },
      { label: 'add-firewall-rule', target, input: { ...base, action: 'add-firewall-rule' }, fields: [{ key: 'type', label: 'Direction', kind: 'select', options: ['in', 'out'], defaultValue: 'in' }, { key: 'action', label: 'Action', kind: 'select', options: ['ACCEPT', 'DROP', 'REJECT'], defaultValue: 'ACCEPT' }, { key: 'proto', label: 'Protocol', defaultValue: 'tcp' }, { key: 'dport', label: 'Destination port' }, { key: 'source', label: 'Source' }, { key: 'dest', label: 'Destination' }, { key: 'comment', label: 'Comment', defaultValue: 'Managed from HomeLab' }, { key: 'enable', label: 'Enable rule', kind: 'checkbox', defaultValue: true }] },
      ...(firewallPos !== undefined ? [
        { label: 'update-firewall-rule', target, input: { ...base, action: 'update-firewall-rule', args: { ...base.args, pos: firewallPos } }, fields: [{ key: 'pos', label: 'Position', kind: 'number', defaultValue: firewallPos }, { key: 'type', label: 'Direction', kind: 'select', options: ['in', 'out'], defaultValue: 'in' }, { key: 'action', label: 'Action', kind: 'select', options: ['ACCEPT', 'DROP', 'REJECT'], defaultValue: 'ACCEPT' }] },
        { label: 'delete-firewall-rule', target, input: { ...base, action: 'delete-firewall-rule', args: { ...base.args, pos: firewallPos } }, danger: true, typed: true },
      ] satisfies NativeAction[] : []),
      { label: 'add-ha', target, input: { ...base, action: 'add-ha' }, fields: [{ key: 'state', label: 'State', kind: 'select', options: ['started', 'stopped', 'enabled', 'disabled', 'ignored'], defaultValue: 'started' }, { key: 'group', label: 'Group' }] },
      { label: 'set-ha-state', target, input: { ...base, action: 'set-ha-state' }, fields: [{ key: 'state', label: 'State', kind: 'select', options: ['started', 'stopped', 'enabled', 'disabled', 'ignored'], defaultValue: 'started' }] },
      { label: 'remove-ha', target, input: { ...base, action: 'remove-ha' }, danger: true, typed: true },
      { label: 'reboot', target, input: { ...base, action: 'reboot' }, danger: true, confirm: true },
      { label: 'stop', target, input: { ...base, action: 'stop' }, danger: true, confirm: true },
      { label: 'delete', target, input: { ...base, action: 'delete' }, danger: true, typed: true },
    ]
    return actions
  }
  if (resource.kind === 'storage') {
    const item = resource.item
    const target = `${item.name} (${item.node})`
    const base = { provider: 'proxmox' as const, resourceType: 'storage', resourceId: item.name, args: { node: item.node, name: item.name, storage: item.name } }
    return [{ label: item.enabled ? 'disable-storage' : 'enable-storage', target, input: { ...base, action: item.enabled ? 'disable-storage' : 'enable-storage' }, danger: item.enabled, confirm: item.enabled }]
  }
  if (resource.kind === 'backup') {
    const item = resource.item
    const target = item.name || item.volid
    const base = { provider: 'proxmox' as const, resourceType: 'backup', resourceId: item.volid, args: { node: item.node, name: target, archive: item.volid, kind: item.kind, vmid: item.vmid, storage: item.storage } }
    return [{ label: 'restore', target, input: { ...base, action: 'restore' }, danger: true, typed: true, fields: [{ key: 'vmid', label: 'Target VMID', kind: 'number', defaultValue: item.vmid, required: true }, { key: 'storage', label: 'Target storage', defaultValue: item.storage }, { key: 'force', label: 'Overwrite existing VMID', kind: 'checkbox' }] }, { label: 'delete-backup', target, input: { ...base, action: 'delete-backup' }, danger: true, typed: true }]
  }
  if (resource.kind === 'ha') {
    const item = resource.item
    const base = { provider: 'proxmox' as const, resourceType: 'ha', resourceId: item.sid, args: { name: item.sid, sid: item.sid, state: item.state || 'started' } }
    return [{ label: 'set-ha-state', target: item.sid, input: { ...base, action: 'set-ha-state' }, fields: [{ key: 'state', label: 'State', kind: 'select', options: ['started', 'stopped', 'enabled', 'disabled', 'ignored'], defaultValue: item.state || 'started' }] }, { label: 'remove-ha', target: item.sid, input: { ...base, action: 'remove-ha' }, danger: true, typed: true }]
  }
  if (resource.kind === 'service') {
    const item = resource.item
    const target = item.name || item.id
    const base = { provider: 'proxmox' as const, resourceType: 'service', resourceId: item.id, args: { node: item.node, name: target } }
    return item.state === 'running' ? [{ label: 'restart', target, input: { ...base, action: 'restart' }, danger: true, confirm: true }, { label: 'reload', target, input: { ...base, action: 'reload' } }, { label: 'stop', target, input: { ...base, action: 'stop' }, danger: true, confirm: true }] : [{ label: 'start', target, input: { ...base, action: 'start' } }]
  }
  const task = resource.item
  const target = task.id || task.upid
  const base = { provider: 'proxmox' as const, resourceType: 'task', resourceId: task.upid, args: { node: task.node, name: target } }
  return [{ label: 'task-status', target, input: { ...base, action: 'task-status' } }, { label: 'task-log', target, input: { ...base, action: 'task-log' } }, ...(!task.endtime ? [{ label: 'stop-task', target, input: { ...base, action: 'stop-task' }, danger: true, confirm: true }] : [])]
}

export function NativeProxmoxConsole({ data, filter, busyAction, onRun }: ProxmoxConsoleProps) {
  const query = normalizeFilter(filter)
  const { open, modal } = useNativeActions(onRun, busyAction)
  const resources = useMemo<ProxmoxResource[]>(() => {
    const rows: ProxmoxResource[] = []
    for (const item of data.proxmox.nodes) if (matchesQuery(query, item.name, item.status)) rows.push({ kind: 'node', item })
    for (const item of data.proxmox.vms) if (matchesQuery(query, item.name, item.status, item.node, item.kind, item.vmid)) rows.push({ kind: 'guest', item })
    for (const item of data.proxmox.storage ?? []) if (matchesQuery(query, item.name, item.node, item.storage_type, item.content)) rows.push({ kind: 'storage', item })
    for (const item of data.proxmox.backups ?? []) if (matchesQuery(query, item.name, item.volid, item.node, item.storage, item.kind, item.vmid)) rows.push({ kind: 'backup', item })
    for (const item of data.proxmox.ha_resources ?? []) if (matchesQuery(query, item.sid, item.state, item.group)) rows.push({ kind: 'ha', item })
    for (const item of data.proxmox.services ?? []) if (matchesQuery(query, item.name, item.id, item.node, item.state)) rows.push({ kind: 'service', item })
    for (const item of data.proxmox.tasks ?? []) if (matchesQuery(query, item.task_type, item.status, item.node, item.id)) rows.push({ kind: 'task', item })
    return rows
  }, [data, query])
  const [selectedId, setSelectedId] = useState('')
  useEffect(() => {
    if (!resources.some(resource => resourceId(resource) === selectedId)) setSelectedId(resources[0] ? resourceId(resources[0]) : '')
  }, [resources, selectedId])
  const selected = resources.find(resource => resourceId(resource) === selectedId) ?? resources[0]
  const nodeChildren =
    selected?.kind === 'node'
      ? resources.filter(resource => {
          if (resource.kind === 'node') return false
          const item = resource.item as { node?: string }
          return item.node === selected.item.name || resource.kind === 'ha'
        })
      : []
  const groups = ['node', 'guest', 'storage', 'backup', 'ha', 'service', 'task'].map(kind => ({
    label: kind === 'guest' ? 'VMs and LXCs' : kind,
    rows: resources
      .filter(resource => resource.kind === kind)
      .map(resource => {
        const item = resource.item as { name?: string; vmid?: number; status?: string; state?: string; node?: string; sid?: string; id?: string; upid?: string; volid?: string }
        return {
          id: resourceId(resource),
          name: item.name || item.sid || item.id || item.volid || item.upid || String(item.vmid ?? resource.kind),
          meta: item.node ? `${item.node} · ${item.vmid ?? resource.kind}` : resource.kind,
          status: item.status ?? item.state ?? 'online',
        }
      }),
  })).filter(group => group.rows.length)
  const actions = selected ? proxmoxActions(selected) : []
  const title = selected ? ((selected.item as { name?: string; sid?: string; id?: string; volid?: string; upid?: string }).name || (selected.item as { sid?: string }).sid || (selected.item as { id?: string }).id || (selected.item as { volid?: string }).volid || (selected.item as { upid?: string }).upid || selected.kind) : 'Proxmox'
  return (
    <div style={shellStyle}>
      <SidebarList title="Proxmox" groups={groups} selectedId={selected ? resourceId(selected) : ''} onSelect={setSelectedId} />
      <div>
        {selected && (
          <>
            <DetailHeader title={title} meta={`${selected.kind} · ${data.proxmox.source ?? 'api'}`}>
              {actions.map(action => nativeButton(action, busyAction, open))}
            </DetailHeader>
            {selected.kind === 'node' && (
              <div style={{ ...card, display: 'grid', gap: '14px' }}>
                <KV name="Status" value={selected.item.status} />
                <div><div style={label}>CPU</div><CpuBar value={selected.item.cpu} /></div>
                <div><div style={label}>Memory</div><MemBar used={selected.item.mem_used} total={selected.item.mem_total} /></div>
                <KV name="Uptime" value={formatUptime(selected.item.uptime)} />
              </div>
            )}
            {selected.kind === 'node' && nodeChildren.length > 0 && (
              <div style={{ ...card, marginTop: '12px' }}>
                <div style={{ ...label, marginBottom: '10px' }}>Node resource controls</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {nodeChildren.map(child => {
                    const childTitle =
                      (child.item as { name?: string; sid?: string; id?: string; volid?: string; upid?: string }).name ||
                      (child.item as { sid?: string }).sid ||
                      (child.item as { id?: string }).id ||
                      (child.item as { volid?: string }).volid ||
                      (child.item as { upid?: string }).upid ||
                      child.kind
                    return (
                      <div
                        key={resourceId(child)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)',
                          gap: '10px',
                          alignItems: 'start',
                          padding: '10px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg-elevated)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {child.kind} {childTitle}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace', marginTop: '3px' }}>
                            {child.kind}
                          </div>
                        </div>
                        <div style={toolbarStyle}>{proxmoxActions(child).map(action => nativeButton(action, busyAction, open))}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {selected.kind === 'guest' && (
              <>
                <InfoGrid rows={[['Guest', proxmoxGuestMeta(selected.item)], ['Memory', `${formatBytes(selected.item.mem)} / ${formatBytes(selected.item.maxmem ?? 0)}`], ['CPU', `${Math.round(selected.item.cpu * 100)}%`], ['Kind', selected.item.kind ?? 'qemu']]} />
                <InfoGrid rows={[['Disks', (selected.item.disks ?? []).map(item => `${item.key}: ${item.value}`).join('\n') || 'none'], ['Networks', (selected.item.networks ?? []).map(item => `${item.key}: ${item.value}`).join('\n') || 'none'], ['Snapshots', (selected.item.snapshots ?? []).map(item => item.name).join(', ') || 'none'], ['Firewall rules', `${selected.item.firewall_rules?.length ?? 0}`]]} />
              </>
            )}
            {selected.kind === 'storage' && <InfoGrid rows={[['Node', selected.item.node], ['Content', selected.item.content], ['Used', `${formatBytes(selected.item.used)} / ${formatBytes(selected.item.total)}`], ['Available', formatBytes(selected.item.avail)], ['Shared', selected.item.shared ? 'yes' : 'no']]} />}
            {selected.kind === 'backup' && <InfoGrid rows={[['Archive', selected.item.volid], ['VMID', selected.item.vmid ?? '-'], ['Size', formatBytes(selected.item.size)], ['Protected', selected.item.protected ? 'yes' : 'no'], ['Notes', selected.item.notes || '-']]} />}
            {selected.kind === 'ha' && <InfoGrid rows={[['SID', selected.item.sid], ['State', selected.item.state], ['Group', selected.item.group || '-'], ['Comment', selected.item.comment || '-']]} />}
            {selected.kind === 'service' && <InfoGrid rows={[['Node', selected.item.node], ['Service', selected.item.id], ['State', selected.item.state], ['Description', selected.item.description || '-']]} />}
            {selected.kind === 'task' && <InfoGrid rows={[['Node', selected.item.node], ['UPID', selected.item.upid], ['Status', selected.item.status], ['User', selected.item.user], ['Started', selected.item.starttime ? new Date(selected.item.starttime * 1000).toLocaleString() : '-']]} />}
          </>
        )}
      </div>
      {modal}
    </div>
  )
}
