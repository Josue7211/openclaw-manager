import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  ClockCounterClockwise,
  ClipboardText,
  CornersOut,
  Database,
  Desktop,
  Eraser,
  FileText,
  Gear,
  Keyboard,
  MagnifyingGlass,
  Monitor,
  Play,
  Plus,
  Pulse,
  ShieldCheck,
  Stop,
  Terminal,
  UserCircle,
  Warning,
} from '@phosphor-icons/react'

import { useTauriQuery } from '@/hooks/useTauriQuery'
import { api, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import '@xterm/xterm/css/xterm.css'
import type {
  ApiSuccess,
  HomelabCapabilityStatus,
  HomelabControlInput,
  HomelabControlResult,
  HomelabControlCapability,
  HomelabData,
  NodeInfo,
  ProxmoxFirewallInfo,
  ProxmoxHaGroupInfo,
  ProxmoxPermissionsInfo,
  ProxmoxPoolInfo,
  ProxmoxLogsInfo,
  ProxmoxReplicationJobInfo,
  ProxmoxBackupInfo,
  ProxmoxBackupJobInfo,
  ProxmoxHaResourceInfo,
  ProxmoxSdnInfo,
  ProxmoxServiceInfo,
  ProxmoxStorageContentInfo,
  ProxmoxStorageInfo,
  ProxmoxTaskInfo,
  VMInfo,
} from '../types'
import { configValue, firstFirewallRulePos, firstSnapshotName, formatBytes, formatUptime } from '../helpers'

type PveResourceKind =
  | 'datacenter'
  | 'folder'
  | 'node'
  | 'qemu'
  | 'lxc'
  | 'storage'
  | 'backup'
  | 'ha'
  | 'service'
  | 'task'
  | 'firewall'
  | 'permissions'

type PveResource =
  | { id: string; kind: 'datacenter'; name: string; item: null }
  | { id: string; kind: 'node'; name: string; item: NodeInfo }
  | { id: string; kind: 'qemu' | 'lxc'; name: string; item: VMInfo }
  | { id: string; kind: 'storage'; name: string; item: ProxmoxStorageInfo }
  | { id: string; kind: 'backup'; name: string; item: ProxmoxBackupInfo }
  | { id: string; kind: 'ha'; name: string; item: ProxmoxHaResourceInfo }
  | { id: string; kind: 'service'; name: string; item: ProxmoxServiceInfo }
  | { id: string; kind: 'task'; name: string; item: ProxmoxTaskInfo }
  | { id: string; kind: 'firewall' | 'permissions'; name: string; item: null }

interface PveTreeNode {
  id: string
  label: string
  kind: PveResourceKind
  status?: string
  meta?: string
  children?: PveTreeNode[]
}

type FieldKind = 'text' | 'number' | 'textarea' | 'checkbox' | 'select'

interface ActionField {
  key: string
  label: string
  kind?: FieldKind
  required?: boolean
  defaultValue?: string | number | boolean
  options?: string[]
}

interface PveAction {
  label: string
  input: HomelabControlInput
  target: string
  fields?: ActionField[]
  danger?: boolean
  confirm?: boolean
  primary?: boolean
  capability?: PveCapability
}

interface PendingAction extends PveAction {
  values: Record<string, string | number | boolean>
  confirmation: string
}

interface LogEntry {
  title: string
  body: string
}

interface TaskActivity extends LogEntry {
  upid: string
  node: string
  status: string
  updatedAt: number
}

interface PveCapability {
  status: HomelabCapabilityStatus
  reason?: string
  mode?: string
  next?: string
  surface?: string
  backend?: string
}

interface PveCoverageStats {
  implemented: number
  readOnly: number
  blocked: number
  total: number
}

interface ProxmoxSessionResponse {
  sessionId: string
  websocketUrl: string
  password?: string
  expiresInSeconds?: number
}

type ProxmoxSessionStatus = 'connecting' | 'connected' | 'closed' | 'error'

interface NoVncRfb {
  disconnect: () => void
  sendCtrlAltDel?: () => void
  focus?: () => void
  clipboardPasteFrom?: (text: string) => void
  scaleViewport: boolean
  resizeSession: boolean
  viewOnly: boolean
  addEventListener?: (name: string, listener: (event: Event) => void) => void
}

type NoVncCtor = new (
  target: HTMLElement,
  url: string,
  options?: { credentials?: { password?: string } },
) => NoVncRfb

type PveViewMode = 'native' | 'classic'
type QuickView = 'all' | 'running' | 'stopped' | 'errors' | 'backups' | 'storage'

interface InfraGraphSummary {
  nodes: number
  guests: number
  runningGuests: number
  containers: number
  services: number
  backups: number
  protectedBackups: number
  firewallRules: number
  storagePressure: number
  failedTasks: number
  relationships: string[]
}

const DATACENTER_ID = 'datacenter:root'
const FIREWALL_ID = 'firewall:datacenter'
const PERMISSIONS_ID = 'permissions:datacenter'
const VIEW_MODE_KEY = 'proxmox-console-view-mode'
const TASK_ACTIVITY_KEY = 'proxmox-console-task-activity'
const TASK_POLL_INTERVAL_MS = 2500
const TASK_POLL_ATTEMPTS = 12

const pveOrange = 'var(--pve-brand)'
const pveBlue = 'var(--pve-accent)'
const border = 'var(--pve-border)'
const panel = 'var(--pve-panel)'
const panelDark = 'var(--pve-panel-strong)'
const rowHover = 'var(--pve-row-hover)'
const text = 'var(--pve-text)'
const muted = 'var(--pve-muted)'
const rowBg = 'var(--pve-row)'
const rowAlt = 'var(--pve-row-alt)'
const selectedRow = 'var(--pve-row-selected)'
const panelHeader = 'var(--pve-panel-header)'
const iconMuted = 'var(--pve-icon-muted)'
const danger = 'var(--pve-danger)'
const warning = 'var(--pve-warning)'
const ok = 'var(--pve-ok)'

const LOCAL_PROXMOX_CAPABILITIES: HomelabControlCapability[] = [
  { provider: 'proxmox', resource_type: 'node', action: 'shell', status: 'implemented', mode: 'termproxy-vncwebsocket' },
  { provider: 'proxmox', resource_type: 'vm', action: 'console', status: 'implemented', mode: 'vncproxy-vncwebsocket' },
  { provider: 'proxmox', resource_type: 'lxc', action: 'console', status: 'implemented', mode: 'vncproxy-vncwebsocket' },
  { provider: 'proxmox', resource_type: 'storage', action: 'reload-storage', status: 'blocked', reason: 'No backend handler exists for reload-storage.' },
]

type CssVars = React.CSSProperties & Record<`--${string}`, string | number>

function loadViewMode(): PveViewMode {
  try {
    if (typeof window === 'undefined') return 'native'
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'classic' ? 'classic' : 'native'
  } catch {
    return 'native'
  }
}

function loadTaskActivities(): TaskActivity[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(TASK_ACTIVITY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is TaskActivity =>
        isRecord(item)
        && typeof item.upid === 'string'
        && typeof item.node === 'string'
        && typeof item.title === 'string'
        && typeof item.body === 'string'
        && typeof item.status === 'string'
        && typeof item.updatedAt === 'number',
      )
      .slice(0, 20)
  } catch {
    return []
  }
}

function saveTaskActivities(items: TaskActivity[]) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TASK_ACTIVITY_KEY, JSON.stringify(items.slice(0, 20)))
  } catch {
    // Task history is a UI convenience; ignore storage failures.
  }
}

function proxmoxThemeVars(mode: PveViewMode): CssVars {
  if (mode === 'classic') {
    return {
      '--pve-shell-bg': '#e8ebef',
      '--pve-panel': '#ffffff',
      '--pve-panel-strong': '#eef1f5',
      '--pve-panel-header': 'linear-gradient(#fbfbfb, #dfe3e8)',
      '--pve-row': '#ffffff',
      '--pve-row-alt': '#f8fafc',
      '--pve-row-hover': '#e9f3ff',
      '--pve-row-selected': '#cfe4fb',
      '--pve-border': '#b7c0c9',
      '--pve-grid-line': '#e2e5e8',
      '--pve-text': '#202832',
      '--pve-muted': '#53606d',
      '--pve-icon-muted': '#53606d',
      '--pve-accent': '#2563a8',
      '--pve-brand': '#d97817',
      '--pve-ok': '#1d8a45',
      '--pve-danger': '#b42318',
      '--pve-warning': '#b7791f',
      '--pve-radius': '2px',
      '--pve-button-bg': 'linear-gradient(#ffffff, #e5e9ee)',
      '--pve-button-primary-bg': 'linear-gradient(#fff8ec, #efd7b7)',
      '--pve-button-danger-bg': 'linear-gradient(#fff6f5, #efd6d3)',
      '--pve-input-bg': '#ffffff',
      '--pve-grid-header-bg': 'linear-gradient(#f7f8f9, #e0e4e9)',
      '--pve-chip-bg': '#ffffff',
      '--pve-chip-active-bg': '#d7e8fa',
      '--pve-chip-active-text': '#153d65',
      '--pve-modal-overlay': 'rgba(0,0,0,0.36)',
      '--pve-shadow': '0 18px 50px rgba(0,0,0,0.28)',
      '--pve-risk-bg': '#fff7df',
      '--pve-risk-border': '#d9a441',
      '--pve-risk-text': '#6d4c08',
    }
  }

  return {
    '--pve-shell-bg': 'var(--bg-base)',
    '--pve-panel': 'var(--bg-panel)',
    '--pve-panel-strong': 'var(--bg-card-solid, var(--bg-card))',
    '--pve-panel-header': 'linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, var(--accent) 8%), var(--bg-panel))',
    '--pve-row': 'color-mix(in srgb, var(--bg-card-solid, var(--bg-card)) 88%, transparent)',
    '--pve-row-alt': 'color-mix(in srgb, var(--bg-elevated) 86%, transparent)',
    '--pve-row-hover': 'var(--hover-bg-bright, color-mix(in srgb, var(--accent) 14%, transparent))',
    '--pve-row-selected': 'var(--accent-a10, color-mix(in srgb, var(--accent) 18%, transparent))',
    '--pve-border': 'var(--border)',
    '--pve-grid-line': 'var(--border-subtle, var(--border))',
    '--pve-text': 'var(--text-primary)',
    '--pve-muted': 'var(--text-secondary)',
    '--pve-icon-muted': 'var(--text-tertiary, var(--text-secondary))',
    '--pve-accent': 'var(--accent)',
    '--pve-brand': '#e57000',
    '--pve-ok': 'var(--green)',
    '--pve-danger': 'var(--red)',
    '--pve-warning': 'var(--warning)',
    '--pve-radius': 'var(--radius-md, 8px)',
    '--pve-button-bg': 'var(--button-secondary-bg, var(--bg-elevated))',
    '--pve-button-primary-bg': 'color-mix(in srgb, var(--accent) 18%, var(--bg-elevated))',
    '--pve-button-danger-bg': 'color-mix(in srgb, var(--red) 14%, var(--bg-elevated))',
    '--pve-input-bg': 'var(--input-bg, var(--bg-elevated))',
    '--pve-grid-header-bg': 'color-mix(in srgb, var(--bg-elevated) 92%, var(--accent) 8%)',
    '--pve-chip-bg': 'color-mix(in srgb, var(--bg-elevated) 88%, transparent)',
    '--pve-chip-active-bg': 'var(--accent-a10, color-mix(in srgb, var(--accent) 18%, transparent))',
    '--pve-chip-active-text': 'var(--accent)',
    '--pve-modal-overlay': 'rgba(0,0,0,0.58)',
    '--pve-shadow': '0 24px 70px rgba(0,0,0,0.38)',
    '--pve-risk-bg': 'color-mix(in srgb, var(--warning) 12%, var(--bg-elevated))',
    '--pve-risk-border': 'color-mix(in srgb, var(--warning) 58%, var(--border))',
    '--pve-risk-text': 'var(--text-primary)',
  }
}

const shellStyle: React.CSSProperties = {
  margin: '-20px -28px',
  height: 'calc(100dvh - 40px)',
  minHeight: '720px',
  background: 'var(--pve-shell-bg)',
  color: text,
  fontFamily: 'var(--font-ui, "Segoe UI", Tahoma, sans-serif)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  border: `1px solid ${border}`,
  overflow: 'hidden',
}

const toolbarButtonStyle: React.CSSProperties = {
  height: '26px',
  border: `1px solid ${border}`,
  background: 'var(--pve-button-bg)',
  color: text,
  borderRadius: 'var(--pve-radius)',
  padding: '0 8px',
  fontSize: '12px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inputStyle: React.CSSProperties = {
  height: '26px',
  border: `1px solid ${border}`,
  background: 'var(--pve-input-bg)',
  color: text,
  borderRadius: 'var(--pve-radius)',
  padding: '0 8px',
  fontSize: '12px',
  outline: 'none',
}

const gridHeaderStyle: React.CSSProperties = {
  background: 'var(--pve-grid-header-bg)',
  borderBottom: `1px solid ${border}`,
  color: text,
  fontSize: '12px',
  fontWeight: 700,
  textAlign: 'left',
  height: '29px',
  padding: '0 8px',
  whiteSpace: 'nowrap',
}

const gridCellStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--pve-grid-line)',
  color: text,
  fontSize: '12px',
  height: '28px',
  padding: '0 8px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function isDemoMode(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('demo-mode') === 'true'
  } catch {
    return false
  }
}

function unwrapData(response?: ApiSuccess<HomelabData> | HomelabData): HomelabData | undefined {
  return response && 'data' in response ? response.data : response
}

function normalizeHomelabData(data: HomelabData): HomelabData {
  const singleNode = data.proxmox.nodes.length === 1 ? data.proxmox.nodes[0]?.name?.trim() : ''
  if (!singleNode || data.proxmox.vms.every(vm => String(vm.node ?? '').trim())) return data
  return {
    ...data,
    proxmox: {
      ...data.proxmox,
      vms: data.proxmox.vms.map(vm => String(vm.node ?? '').trim() ? vm : { ...vm, node: singleNode }),
    },
  }
}

function unwrapApiData<T>(response: ApiSuccess<T> | T): T {
  return response && typeof response === 'object' && 'data' in response ? response.data : response
}

function proxmoxWsUrl(relativeUrl: string): string {
  const [path, rawQuery = ''] = relativeUrl.split('?')
  const params = new URLSearchParams(rawQuery)
  const apiKey = getRequestApiKeyForPath(path)
  if (apiKey) params.set('apiKey', apiKey)
  const query = params.toString()
  return `${getRequestBaseForPath(path).replace(/^http/, 'ws')}${path}${query ? `?${query}` : ''}`
}

function proxmoxTermFrame(data: string): string {
  return `0:${new TextEncoder().encode(data).length}:${data}`
}

function proxmoxTermResizeFrame(cols: number, rows: number): string {
  return `1:${cols}:${rows}:`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function fieldText(value: unknown, key: string): string {
  return isRecord(value) && value[key] !== undefined && value[key] !== null ? String(value[key]) : ''
}

function compactJson(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function taskStatusLabel(status: unknown): string {
  if (typeof status === 'string') return status
  if (!isRecord(status)) return ''
  return fieldText(status, 'status') || fieldText(status, 'exitstatus') || fieldText(status, 'state')
}

function formatTaskResultLog(responseData: HomelabControlResult, input: HomelabControlInput): string | null {
  if (!isRecord(responseData.task)) return null
  const task = responseData.task
  const upid = fieldText(task, 'upid')
  if (!upid) return null
  const status = task.status
  const lines = [
    `Action: ${responseData.action || input.action}`,
    `Mode: ${responseData.mode || 'proxmox-api'}`,
    `Task UPID: ${upid}`,
    `Task node: ${fieldText(task, 'node') || fieldText(responseData.target, 'node') || '-'}`,
  ]
  const statusText = taskStatusLabel(status)
  if (statusText) lines.push(`Task status: ${statusText}`)
  if (isRecord(status)) {
    const taskType = fieldText(status, 'type')
    const taskId = fieldText(status, 'id')
    const exitStatus = fieldText(status, 'exitstatus')
    if (taskType) lines.push(`Task type: ${taskType}`)
    if (taskId) lines.push(`Task ID: ${taskId}`)
    if (exitStatus) lines.push(`Exit status: ${exitStatus}`)
  }
  const httpStatus = fieldText(task, 'httpStatus')
  const taskError = fieldText(task, 'error')
  if (httpStatus || taskError) {
    lines.push(`Task status fetch: ${httpStatus ? `HTTP ${httpStatus}` : 'failed'}${taskError ? ` - ${taskError}` : ''}`)
  }
  const rawResponse = compactJson(responseData.response)
  if (rawResponse) lines.push('', 'Proxmox response:', rawResponse)
  return lines.join('\n')
}

function proxmoxTaskDescriptor(responseData: HomelabControlResult): { upid: string; node: string } | null {
  if (!isRecord(responseData.task)) return null
  const upid = fieldText(responseData.task, 'upid')
  const node = fieldText(responseData.task, 'node') || fieldText(responseData.target, 'node')
  return upid && node ? { upid, node } : null
}

function proxmoxTaskStatusPayload(result: HomelabControlResult): unknown {
  return isRecord(result.response) && 'data' in result.response ? result.response.data : result.response
}

function proxmoxTaskStatusIsFinal(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  const status = fieldText(payload, 'status').toLowerCase()
  const exitStatus = fieldText(payload, 'exitstatus')
  return Boolean(exitStatus) || ['stopped', 'ok', 'error', 'warning'].includes(status)
}

function formatPolledTaskStatus(result: HomelabControlResult, attempt: number): string {
  const payload = proxmoxTaskStatusPayload(result)
  const status = taskStatusLabel(payload) || 'unknown'
  const lines = [
    `Poll ${attempt}: ${status}`,
  ]
  if (isRecord(payload)) {
    const type = fieldText(payload, 'type')
    const id = fieldText(payload, 'id')
    const exitStatus = fieldText(payload, 'exitstatus')
    if (type) lines.push(`Task type: ${type}`)
    if (id) lines.push(`Task ID: ${id}`)
    if (exitStatus) lines.push(`Exit status: ${exitStatus}`)
  }
  return lines.join('\n')
}

function formatProxmoxTaskLogPayload(payload: unknown): string {
  const data = isRecord(payload) ? payload.data : undefined
  if (Array.isArray(data)) {
    return data.map((entry, index) => {
      if (!isRecord(entry)) return String(entry)
      const number = fieldText(entry, 'n') || String(index + 1)
      const text = fieldText(entry, 't') || fieldText(entry, 'message') || compactJson(entry)
      return `${number}: ${text}`
    }).join('\n')
  }
  return compactJson(payload) || 'No task log entries returned.'
}

function actionKey(input: HomelabControlInput): string {
  return `${input.provider}:${input.resourceType}:${input.resourceId}:${input.action}`
}

function manifestResourceType(resourceType: string): string {
  return resourceType === 'vm' ? 'vm' : resourceType
}

function controlActionSet(data: HomelabData): Set<string> {
  return new Set(
    (data.control?.actions ?? []).flatMap(item =>
      item.actions.map(action => `${item.provider}:${item.resource_type}:${action}`),
    ),
  )
}

function capabilityKey(item: Pick<HomelabControlCapability, 'provider' | 'resource_type' | 'action'>): string {
  return `${item.provider}:${item.resource_type}:${item.action}`
}

function controlCapabilities(data: HomelabData): HomelabControlCapability[] {
  const capabilities = new Map<string, HomelabControlCapability>()
  for (const item of LOCAL_PROXMOX_CAPABILITIES) capabilities.set(capabilityKey(item), item)
  for (const item of data.control?.capabilities ?? []) capabilities.set(capabilityKey(item), item)
  return [...capabilities.values()]
}

function proxmoxCapabilities(data: HomelabData): HomelabControlCapability[] {
  return controlCapabilities(data)
    .filter(item => item.provider === 'proxmox')
    .sort((left, right) =>
      String(left.surface ?? left.resource_type).localeCompare(String(right.surface ?? right.resource_type))
      || left.resource_type.localeCompare(right.resource_type)
      || left.action.localeCompare(right.action),
    )
}

function capabilityStatusCounts(data: HomelabData): PveCoverageStats {
  const counts: PveCoverageStats = { implemented: 0, readOnly: 0, blocked: 0, total: 0 }
  for (const item of proxmoxCapabilities(data)) {
    counts.total += 1
    if (item.status === 'implemented') counts.implemented += 1
    else if (item.status === 'read_only') counts.readOnly += 1
    else counts.blocked += 1
  }
  return counts
}

function capabilityStatusLabel(status: HomelabCapabilityStatus): string {
  if (status === 'read_only') return 'read only'
  return String(status).replace(/_/g, ' ')
}

function capabilityStatusColor(status: HomelabCapabilityStatus): string {
  if (status === 'implemented') return ok
  if (status === 'blocked') return danger
  if (status === 'read_only') return pveOrange
  return pveBlue
}

function capabilityFor(data: HomelabData, input: HomelabControlInput): PveCapability {
  const resourceType = manifestResourceType(input.resourceType)
  const capability = controlCapabilities(data).find(
    item => item.provider === input.provider && item.resource_type === resourceType && item.action === input.action,
  )
  if (capability) {
    return {
      status: capability.status,
      reason: capability.reason,
      mode: capability.mode,
      next: capability.next,
      surface: capability.surface,
      backend: capability.backend,
    }
  }
  const manifest = controlActionSet(data)
  if (manifest.size > 0 && !manifest.has(`${input.provider}:${resourceType}:${input.action}`)) {
    return {
      status: 'blocked',
      reason: `Backend control manifest does not advertise ${resourceType}/${input.action}.`,
    }
  }
  if (manifest.size === 0 && input.provider === 'proxmox') {
    return {
      status: 'blocked',
      reason: 'Backend control manifest is missing; Proxmox actions are hidden to avoid fake controls.',
    }
  }
  return { status: 'implemented' }
}

function visibleActionsFor(resource: PveResource, data: HomelabData): PveAction[] {
  return actionsFor(resource, data)
    .map(action => ({ ...action, capability: capabilityFor(data, action.input) }))
    .filter(action => action.capability?.status !== 'blocked')
}

function fieldDefaults(fields: ActionField[] = []): Record<string, string | number | boolean> {
  return Object.fromEntries(fields.map(field => [field.key, field.defaultValue ?? (field.kind === 'checkbox' ? false : '')]))
}

function toArgs(values: Record<string, string | number | boolean>): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'boolean') args[key] = value
    else if (typeof value === 'number') {
      if (Number.isFinite(value)) args[key] = value
    } else if (value.trim()) args[key] = value
  }
  return args
}

function isDangerousAction(action: string): boolean {
  return (
    action === 'delete' ||
    action === 'stop' ||
    action === 'shutdown' ||
    action === 'reboot' ||
    action === 'reset' ||
    action === 'restore' ||
    action === 'rollback-snapshot' ||
    action === 'delete-snapshot' ||
    action === 'delete-backup' ||
    action === 'remove-ha' ||
    action.startsWith('remove-') ||
    action.startsWith('delete-') ||
    action.startsWith('disable-')
  )
}

function resourceTitle(resource: PveResource): string {
  return resource.name
}

function resourceStatus(resource: PveResource): string {
  if (resource.kind === 'datacenter') return 'online'
  if (resource.kind === 'firewall' || resource.kind === 'permissions') return 'configured'
  const item = resource.item as { status?: string; state?: string }
  return item.status ?? item.state ?? 'unknown'
}

function statusColor(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'online' || normalized === 'running' || normalized === 'started' || normalized === 'ok') return ok
  if (normalized === 'stopped' || normalized === 'offline' || normalized.includes('error') || normalized.includes('fail')) return danger
  return warning
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function pveResourceLabel(kind: PveResourceKind): string {
  if (kind === 'qemu') return 'Virtual Machine'
  if (kind === 'lxc') return 'Container'
  if (kind === 'folder') return 'Folder'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function iconFor(kind: PveResourceKind) {
  if (kind === 'datacenter') return Database
  if (kind === 'folder') return FileText
  if (kind === 'node') return Monitor
  if (kind === 'qemu' || kind === 'lxc') return Desktop
  if (kind === 'storage' || kind === 'backup') return FileText
  if (kind === 'ha') return Pulse
  if (kind === 'firewall') return ShieldCheck
  if (kind === 'permissions') return UserCircle
  if (kind === 'service') return Gear
  return ClockCounterClockwise
}

function makeResourceMap(data: HomelabData): Map<string, PveResource> {
  const map = new Map<string, PveResource>()
  map.set(DATACENTER_ID, { id: DATACENTER_ID, kind: 'datacenter', name: 'Datacenter', item: null })
  map.set(FIREWALL_ID, { id: FIREWALL_ID, kind: 'firewall', name: 'Firewall', item: null })
  map.set(PERMISSIONS_ID, { id: PERMISSIONS_ID, kind: 'permissions', name: 'Permissions', item: null })

  for (const node of data.proxmox.nodes) {
    const id = `node:${node.name}`
    map.set(id, { id, kind: 'node', name: node.name, item: node })
  }
  for (const guest of data.proxmox.vms) {
    const kind = guest.kind === 'lxc' ? 'lxc' : 'qemu'
    const id = `${kind}:${guest.node ?? 'node'}:${guest.vmid ?? guest.name}`
    map.set(id, { id, kind, name: `${guest.vmid ?? '-'} (${guest.name})`, item: guest })
  }
  for (const item of data.proxmox.storage ?? []) {
    const id = `storage:${item.node}:${item.name}`
    map.set(id, { id, kind: 'storage', name: `${item.name} (${item.node})`, item })
  }
  for (const item of data.proxmox.backups ?? []) {
    const id = `backup:${item.volid}`
    map.set(id, { id, kind: 'backup', name: item.name || item.volid, item })
  }
  for (const item of data.proxmox.ha_resources ?? []) {
    const id = `ha:${item.sid}`
    map.set(id, { id, kind: 'ha', name: item.sid, item })
  }
  for (const item of data.proxmox.services ?? []) {
    const id = `service:${item.node}:${item.id}`
    map.set(id, { id, kind: 'service', name: item.name || item.id, item })
  }
  for (const item of data.proxmox.tasks ?? []) {
    const id = `task:${item.upid || `${item.node}:${item.id}:${item.starttime}`}`
    map.set(id, { id, kind: 'task', name: item.task_type || item.id || 'task', item })
  }
  return map
}

function guestSortKey(vm: VMInfo): number {
  return Number.isFinite(Number(vm.vmid)) ? Number(vm.vmid) : Number.MAX_SAFE_INTEGER
}

function sortGuests(guests: VMInfo[]): VMInfo[] {
  return [...guests].sort((left, right) => guestSortKey(left) - guestSortKey(right) || left.name.localeCompare(right.name))
}

function nodeKey(value?: string): string {
  return String(value ?? '').trim().toLowerCase()
}

function guestsForNode(data: HomelabData, node: NodeInfo): VMInfo[] {
  const exact = data.proxmox.vms.filter(vm => nodeKey(vm.node) === nodeKey(node.name))
  if (exact.length || data.proxmox.nodes.length !== 1) return sortGuests(exact)

  const knownNodes = new Set(data.proxmox.nodes.map(item => nodeKey(item.name)).filter(Boolean))
  const unmatched = data.proxmox.vms.filter(vm => !knownNodes.has(nodeKey(vm.node)))
  return sortGuests(unmatched)
}

function guestTreeNode(guest: VMInfo): PveTreeNode {
  const kind = guest.kind === 'lxc' ? 'lxc' : 'qemu'
  return {
    id: `${kind}:${guest.node ?? 'node'}:${guest.vmid ?? guest.name}`,
    label: `${guest.vmid ?? '-'} (${guest.name})`,
    kind,
    status: guest.status,
    meta: `${kind} ${percent(guest.cpu)}`,
  }
}

function folderNode(id: string, label: string, children: PveTreeNode[], meta?: string): PveTreeNode | null {
  if (!children.length) return null
  return {
    id,
    label,
    kind: 'folder',
    status: 'folder',
    meta: meta ?? `${children.length}`,
    children,
  }
}

function quickMatches(kind: PveResourceKind, status: string | undefined, quickView: QuickView): boolean {
  const normalized = String(status ?? '').toLowerCase()
  if (quickView === 'all') return true
  if (quickView === 'running') return ['online', 'running', 'started', 'ok'].includes(normalized)
  if (quickView === 'stopped') return ['stopped', 'offline', 'disabled'].includes(normalized)
  if (quickView === 'errors') return normalized.includes('error') || normalized.includes('fail') || normalized === 'offline'
  if (quickView === 'backups') return kind === 'backup'
  if (quickView === 'storage') return kind === 'storage'
  return true
}

function buildInfraGraphSummary(data: HomelabData): InfraGraphSummary {
  const storage = data.proxmox.storage ?? []
  const backups = data.proxmox.backups ?? []
  const tasks = data.proxmox.tasks ?? []
  const containers = data.portainer?.containers?.length ?? data.docker?.containers?.length ?? 0
  const firewallRules = data.proxmox.vms.reduce((sum, vm) => sum + (vm.firewall_rules?.length ?? 0), 0) + (data.proxmox.firewall?.rules?.length ?? 0) + (data.opnsense.firewall?.rule_total ?? data.opnsense.firewall?.rules?.length ?? 0)
  const storagePressure = storage.length ? Math.max(...storage.map(item => (item.total ? Math.round((item.used / item.total) * 100) : 0))) : 0
  const failedTasks = tasks.filter(task => {
    const status = String(task.status || '').toLowerCase()
    return status && status !== 'ok' && status !== 'running' && status !== 'success'
  }).length
  const relationships = [
    ...data.proxmox.vms.slice(0, 5).map(vm => `${vm.vmid ?? '-'} ${vm.name} -> ${vm.node ?? 'node'}`),
    ...storage.slice(0, 3).map(item => `${item.name} storage -> ${item.node}`),
    ...backups.slice(0, 3).map(item => `${item.name || item.volid} -> ${item.storage}`),
    ...(data.portainer?.stacks ?? []).slice(0, 3).map(stack => `${stack.name} stack -> Portainer`),
  ]

  return {
    nodes: data.proxmox.nodes.length,
    guests: data.proxmox.vms.length,
    runningGuests: data.proxmox.vms.filter(vm => vm.status === 'running').length,
    containers,
    services: data.proxmox.services?.length ?? 0,
    backups: backups.length,
    protectedBackups: backups.filter(item => item.protected).length,
    firewallRules,
    storagePressure,
    failedTasks,
    relationships,
  }
}

function makeTree(data: HomelabData, query: string, quickView: QuickView): PveTreeNode[] {
  const q = query.trim().toLowerCase()
  const matches = (...values: Array<string | number | undefined>) =>
    !q || values.some(value => String(value ?? '').toLowerCase().includes(q))

  const nodeChildren: PveTreeNode[] = data.proxmox.nodes
    .map<PveTreeNode | null>(node => {
      const nodeGuests = guestsForNode(data, node)
      const children: PveTreeNode[] = []

      children.push(
        ...nodeGuests
          .filter(vm => matches(vm.name, vm.vmid, vm.status, vm.kind) && quickMatches(vm.kind === 'lxc' ? 'lxc' : 'qemu', vm.status, quickView))
          .map(guestTreeNode),
      )

      const storageChildren = (data.proxmox.storage ?? [])
        .filter(storage => nodeKey(storage.node) === nodeKey(node.name) && matches(storage.name, storage.content, storage.storage_type) && quickMatches('storage', storage.active ? 'online' : storage.enabled ? 'unknown' : 'offline', quickView))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(item => ({
          id: `storage:${item.node}:${item.name}`,
          label: item.name,
          kind: 'storage' as const,
          status: item.active ? 'online' : item.enabled ? 'unknown' : 'offline',
          meta: item.storage_type,
        }))
      const serviceChildren = (data.proxmox.services ?? [])
        .filter(service => nodeKey(service.node) === nodeKey(node.name) && matches(service.id, service.name, service.state) && quickMatches('service', service.state, quickView))
        .sort((left, right) => (left.name || left.id).localeCompare(right.name || right.id))
        .map(item => ({
          id: `service:${item.node}:${item.id}`,
          label: item.name || item.id,
          kind: 'service' as const,
          status: item.state,
          meta: item.description,
        }))
      const nodeFolders = [
        folderNode(`folder:${node.name}:storage`, 'Storage', storageChildren, `${storageChildren.length}`),
        folderNode(`folder:${node.name}:services`, 'Node Services', serviceChildren, `${serviceChildren.length}`),
      ].filter((item): item is PveTreeNode => Boolean(item))

      children.push(...nodeFolders)

      const nodeRecord: PveTreeNode = {
        id: `node:${node.name}`,
        label: node.name,
        kind: 'node' as const,
        status: node.status,
        meta: `${nodeGuests.length} guests`,
        children,
      }
      return matches(node.name, node.status) && (quickMatches('node', node.status, quickView) || children.length) ? nodeRecord : null
    })
    .filter((node): node is PveTreeNode => Boolean(node))

  const knownNodes = new Set(data.proxmox.nodes.map(item => nodeKey(item.name)).filter(Boolean))
  const unassignedGuests = data.proxmox.nodes.length > 1
    ? sortGuests(data.proxmox.vms.filter(vm => !knownNodes.has(nodeKey(vm.node))))
      .filter(vm => matches(vm.name, vm.vmid, vm.status, vm.kind) && quickMatches(vm.kind === 'lxc' ? 'lxc' : 'qemu', vm.status, quickView))
      .map(guestTreeNode)
    : []
  const backupChildren = (data.proxmox.backups ?? [])
    .filter(item => matches(item.name, item.volid, item.vmid) && quickMatches('backup', item.protected ? 'protected' : 'backup', quickView))
    .sort((left, right) => (right.ctime ?? 0) - (left.ctime ?? 0))
    .slice(0, 40)
    .map(item => ({
      id: `backup:${item.volid}`,
      label: item.name || item.volid,
      kind: 'backup' as const,
      status: item.protected ? 'protected' : 'backup',
      meta: `${item.storage} ${formatBytes(item.size)}`,
    }))
  const haChildren = (data.proxmox.ha_resources ?? [])
    .filter(item => matches(item.sid, item.state, item.group) && quickMatches('ha', item.state, quickView))
    .sort((left, right) => left.sid.localeCompare(right.sid))
    .map(item => ({
      id: `ha:${item.sid}`,
      label: item.sid,
      kind: 'ha' as const,
      status: item.state,
      meta: item.group || item.resource_type,
    }))

  const utilityChildren = [
    folderNode('folder:datacenter:unassigned-guests', 'Unassigned Guests', unassignedGuests, `${unassignedGuests.length}`),
    folderNode('folder:datacenter:ha', 'High Availability', haChildren, `${haChildren.length}`),
    folderNode('folder:datacenter:backups', 'Backups', backupChildren, `${backupChildren.length}`),
    ...(quickView === 'all' || quickView === 'errors' ? [{ id: FIREWALL_ID, label: 'Firewall', kind: 'firewall' as const, status: 'configured', meta: 'datacenter' }] : []),
    ...(quickView === 'all' ? [{ id: PERMISSIONS_ID, label: 'Permissions', kind: 'permissions' as const, status: 'configured', meta: 'users/groups' }] : []),
  ].filter((item): item is PveTreeNode => Boolean(item))

  return [
    {
      id: DATACENTER_ID,
      label: 'Datacenter',
      kind: 'datacenter',
      status: 'online',
      meta: `${data.proxmox.nodes.length} nodes`,
      children: [...nodeChildren, ...utilityChildren],
    },
  ]
}

function tabsFor(resource: PveResource): string[] {
  if (resource.kind === 'datacenter') {
    return ['Summary', 'Search', 'Storage', 'Pools', 'Backup', 'Replication', 'HA', 'Firewall', 'Permissions', 'SDN', 'Logs', 'Tasks', 'Coverage']
  }
  if (resource.kind === 'node') {
    return ['Summary', 'Shell', 'Network', 'DNS', 'Hosts', 'Time', 'Repositories', 'Updates', 'Disks', 'ZFS', 'Ceph', 'Firewall', 'Services', 'Logs', 'Task History']
  }
  if (resource.kind === 'qemu') {
    return ['Summary', 'Console', 'Hardware', 'Options', 'Monitor', 'Snapshots', 'Backup', 'Replication', 'Firewall', 'Permissions', 'Task History']
  }
  if (resource.kind === 'lxc') {
    return ['Summary', 'Console', 'Resources', 'Network', 'DNS', 'Options', 'Snapshots', 'Backup', 'Replication', 'Firewall', 'Permissions', 'Task History']
  }
  if (resource.kind === 'storage') return ['Summary', 'Content', 'Backups']
  if (resource.kind === 'backup') return ['Summary', 'Restore', 'Notes']
  if (resource.kind === 'ha') return ['Summary', 'State', 'Task History']
  if (resource.kind === 'service') return ['Summary', 'Task History']
  if (resource.kind === 'task') return ['Summary', 'Log', 'Status']
  if (resource.kind === 'firewall') return ['Summary', 'Rules', 'Options', 'Aliases', 'IP Sets', 'Security Groups']
  return ['Summary', 'Users', 'Groups', 'API Tokens', 'Roles', 'ACL', 'Realms']
}

function guestBase(vm: VMInfo): HomelabControlInput {
  const kind = vm.kind === 'lxc' ? 'lxc' : 'vm'
  return {
    provider: 'proxmox',
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
    action: 'console',
  }
}

function actionsFor(resource: PveResource, data: HomelabData): PveAction[] {
  if (resource.kind === 'datacenter') {
    const firstNode = data.proxmox.nodes[0]?.name ?? 'pve'
    const base = { provider: 'proxmox' as const, resourceType: 'node', resourceId: firstNode, args: { node: firstNode, name: firstNode } }
    return [
      {
        label: 'Create VM',
        target: firstNode,
        primary: true,
        input: { ...base, action: 'create-vm' },
        fields: [
          { key: 'vmid', label: 'VMID', kind: 'number', required: true },
          { key: 'name', label: 'Name', required: true },
          { key: 'memory_mb', label: 'Memory MiB', kind: 'number', defaultValue: 2048 },
          { key: 'cores', label: 'CPU cores', kind: 'number', defaultValue: 2 },
          { key: 'storage', label: 'Storage', defaultValue: 'local-lvm' },
          { key: 'disk_size', label: 'Disk size', defaultValue: '32G' },
          { key: 'net0', label: 'Network config', defaultValue: 'virtio,bridge=vmbr0,firewall=1' },
          { key: 'start', label: 'Start after create', kind: 'checkbox', defaultValue: true },
        ],
      },
      {
        label: 'Create CT',
        target: firstNode,
        primary: true,
        input: { ...base, action: 'create-lxc' },
        fields: [
          { key: 'vmid', label: 'VMID', kind: 'number', required: true },
          { key: 'hostname', label: 'Hostname', required: true },
          { key: 'ostemplate', label: 'OS template', defaultValue: 'local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst', required: true },
          { key: 'memory_mb', label: 'Memory MiB', kind: 'number', defaultValue: 1024 },
          { key: 'cores', label: 'CPU cores', kind: 'number', defaultValue: 1 },
          { key: 'storage', label: 'Storage', defaultValue: 'local-lvm' },
          { key: 'disk_size', label: 'Root disk size', defaultValue: '8G' },
          { key: 'net0', label: 'Network config', defaultValue: 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1' },
          { key: 'start', label: 'Start after create', kind: 'checkbox', defaultValue: true },
        ],
      },
    ]
  }

  if (resource.kind === 'node') {
    const node = resource.item
    const base = { provider: 'proxmox' as const, resourceType: 'node', resourceId: node.name, args: { node: node.name, name: node.name } }
    return [
      ...actionsFor({ id: DATACENTER_ID, kind: 'datacenter', name: 'Datacenter', item: null }, { ...data, proxmox: { ...data.proxmox, nodes: [node] } }),
      { label: 'Shell', target: node.name, input: { ...base, action: 'shell' }, primary: true },
      { label: 'Reboot', target: node.name, input: { ...base, action: 'reboot' }, danger: true, confirm: true },
      { label: 'Shutdown', target: node.name, input: { ...base, action: 'shutdown' }, danger: true, confirm: true },
    ]
  }

  if (resource.kind === 'qemu' || resource.kind === 'lxc') {
    const vm = resource.item
    const target = vm.name
    const base = guestBase(vm)
    const firstSnap = firstSnapshotName(vm)
    const firewallPos = firstFirewallRulePos(vm)
    return [
      vm.status === 'running'
        ? { label: 'Shutdown', target, input: { ...base, action: 'shutdown' }, danger: true, confirm: true, primary: true }
        : { label: 'Start', target, input: { ...base, action: 'start' }, primary: true },
      { label: 'Console', target, input: { ...base, action: 'console' }, primary: true },
      { label: 'Reboot', target, input: { ...base, action: 'reboot' }, danger: true, confirm: true },
      { label: 'Stop', target, input: { ...base, action: 'stop' }, danger: true, confirm: true },
      { label: 'Set Name', target, input: { ...base, action: 'set-name' }, fields: [{ key: 'name', label: 'Name', defaultValue: vm.name, required: true }] },
      { label: 'Set Description', target, input: { ...base, action: 'set-description' }, fields: [{ key: 'description', label: 'Description', kind: 'textarea', defaultValue: String(vm.config?.description ?? '') }] },
      { label: 'Set Tags', target, input: { ...base, action: 'set-tags' }, fields: [{ key: 'tags', label: 'Tags', defaultValue: String(vm.config?.tags ?? ''), required: true }] },
      { label: 'Set Onboot', target, input: { ...base, action: 'set-onboot' }, fields: [{ key: 'onboot', label: 'Start at boot', kind: 'checkbox', defaultValue: String(vm.config?.onboot ?? '0') === '1' }] },
      { label: 'Set Protection', target, input: { ...base, action: 'set-protection' }, fields: [{ key: 'protection', label: 'Protection', kind: 'checkbox', defaultValue: String(vm.config?.protection ?? '0') === '1' }] },
      { label: 'Set Memory', target, input: { ...base, action: 'set-memory' }, fields: [{ key: 'memory_mb', label: 'Memory MiB', kind: 'number', defaultValue: Number(base.args?.memory_mb ?? 2048), required: true }] },
      { label: 'Set CPU', target, input: { ...base, action: 'set-cpu' }, fields: [{ key: 'cores', label: 'CPU cores', kind: 'number', defaultValue: Number(base.args?.cores ?? 2), required: true }] },
      { label: 'Set NIC', target, input: { ...base, action: 'set-network' }, fields: [{ key: 'net', label: 'Network key', defaultValue: String(base.args?.net ?? 'net0'), required: true }, { key: 'value', label: 'Network config', defaultValue: String(base.args?.value ?? 'virtio,bridge=vmbr0,firewall=1'), required: true }] },
      { label: 'Add NIC', target, input: { ...base, action: 'add-network' }, fields: [{ key: 'net', label: 'Network key', defaultValue: 'net1', required: true }, { key: 'value', label: 'Network config', defaultValue: 'virtio,bridge=vmbr0,firewall=1', required: true }] },
      { label: 'Remove NIC', target, input: { ...base, action: 'remove-network' }, danger: true, confirm: true, fields: [{ key: 'net', label: 'Network key', defaultValue: String(base.args?.net ?? 'net0'), required: true }] },
      { label: 'Add Disk', target, input: { ...base, action: 'add-disk' }, fields: [{ key: 'disk', label: 'Disk key', defaultValue: vm.kind === 'lxc' ? 'mp0' : 'scsi1', required: true }, { key: 'value', label: 'Disk config', defaultValue: 'local-lvm:32G', required: true }] },
      { label: 'Resize Disk', target, input: { ...base, action: 'resize-disk' }, fields: [{ key: 'disk', label: 'Disk key', defaultValue: String(base.args?.disk ?? 'scsi0'), required: true }, { key: 'size', label: 'New size or delta', defaultValue: '+10G', required: true }] },
      { label: 'Remove Disk', target, input: { ...base, action: 'remove-disk' }, danger: true, confirm: true, fields: [{ key: 'disk', label: 'Disk key', defaultValue: String(base.args?.disk ?? (vm.kind === 'lxc' ? 'rootfs' : 'scsi0')), required: true }] },
      { label: 'Snapshot', target, input: { ...base, action: 'snapshot' }, fields: [{ key: 'snapname', label: 'Snapshot name', defaultValue: `snap-${Date.now()}`, required: true }, { key: 'description', label: 'Description' }] },
      ...(firstSnap ? [
        { label: 'Rollback', target, input: { ...base, action: 'rollback-snapshot', args: { ...base.args, snapname: firstSnap } }, danger: true, confirm: true },
        { label: 'Delete Snapshot', target, input: { ...base, action: 'delete-snapshot', args: { ...base.args, snapname: firstSnap } }, danger: true, confirm: true },
      ] satisfies PveAction[] : []),
      { label: 'Backup', target, input: { ...base, action: 'backup' }, fields: [{ key: 'mode', label: 'Mode', kind: 'select', options: ['snapshot', 'suspend', 'stop'], defaultValue: 'snapshot' }, { key: 'storage', label: 'Storage' }, { key: 'compress', label: 'Compression', defaultValue: 'zstd' }] },
      { label: 'Migrate', target, input: { ...base, action: 'migrate' }, danger: true, confirm: true, fields: [{ key: 'target', label: 'Target node', required: true }, { key: 'online', label: 'Online migrate', kind: 'checkbox', defaultValue: vm.status === 'running' }] },
      { label: 'Clone', target, input: { ...base, action: 'clone' }, fields: [{ key: 'newid', label: 'New VMID', kind: 'number', required: true }, { key: 'name', label: 'Clone name', defaultValue: `${vm.name}-clone` }] },
      { label: 'Firewall', target, input: { ...base, action: 'set-firewall' }, fields: [{ key: 'enable', label: 'Enable firewall', kind: 'checkbox', defaultValue: true }, { key: 'policy_in', label: 'Inbound policy', kind: 'select', options: ['DROP', 'ACCEPT', 'REJECT'], defaultValue: 'DROP' }, { key: 'policy_out', label: 'Outbound policy', kind: 'select', options: ['ACCEPT', 'DROP', 'REJECT'], defaultValue: 'ACCEPT' }] },
      { label: 'Add Rule', target, input: { ...base, action: 'add-firewall-rule' }, fields: [{ key: 'type', label: 'Direction', kind: 'select', options: ['in', 'out'], defaultValue: 'in' }, { key: 'action', label: 'Action', kind: 'select', options: ['ACCEPT', 'DROP', 'REJECT'], defaultValue: 'ACCEPT' }, { key: 'proto', label: 'Protocol', defaultValue: 'tcp' }, { key: 'dport', label: 'Destination port' }, { key: 'source', label: 'Source' }, { key: 'dest', label: 'Destination' }, { key: 'comment', label: 'Comment', defaultValue: 'Managed from clawctrl' }, { key: 'enable', label: 'Enable rule', kind: 'checkbox', defaultValue: true }] },
      ...(firewallPos !== undefined ? [
        { label: 'Update Rule', target, input: { ...base, action: 'update-firewall-rule', args: { ...base.args, pos: firewallPos } }, fields: [{ key: 'pos', label: 'Rule position', kind: 'number', defaultValue: firewallPos, required: true }, { key: 'action', label: 'Action', kind: 'select', options: ['ACCEPT', 'DROP', 'REJECT'], defaultValue: 'ACCEPT' }, { key: 'comment', label: 'Comment' }] },
        { label: 'Delete Rule', target, input: { ...base, action: 'delete-firewall-rule', args: { ...base.args, pos: firewallPos } }, danger: true, confirm: true },
      ] satisfies PveAction[] : []),
      { label: 'Add HA', target, input: { ...base, action: 'add-ha' }, fields: [{ key: 'state', label: 'State', kind: 'select', options: ['started', 'stopped', 'enabled', 'disabled', 'ignored'], defaultValue: 'started' }, { key: 'group', label: 'Group' }] },
      { label: 'Set HA State', target, input: { ...base, action: 'set-ha-state' }, fields: [{ key: 'state', label: 'State', kind: 'select', options: ['started', 'stopped', 'enabled', 'disabled', 'ignored'], defaultValue: 'started' }] },
      { label: 'Remove HA', target, input: { ...base, action: 'remove-ha' }, danger: true, confirm: true },
      { label: 'Delete', target, input: { ...base, action: 'delete' }, danger: true, confirm: true },
    ]
  }

  if (resource.kind === 'storage') {
    const item = resource.item
    const base = { provider: 'proxmox' as const, resourceType: 'storage', resourceId: item.name, args: { node: item.node, name: item.name, storage: item.name } }
    return [
      { label: 'Reload', target: item.name, input: { ...base, action: 'reload-storage' }, primary: true },
      { label: item.enabled ? 'Disable' : 'Enable', target: item.name, input: { ...base, action: item.enabled ? 'disable-storage' : 'enable-storage' }, danger: item.enabled, confirm: item.enabled },
    ]
  }

  if (resource.kind === 'backup') {
    const item = resource.item
    const target = item.name || item.volid
    const base = { provider: 'proxmox' as const, resourceType: 'backup', resourceId: item.volid, args: { node: item.node, name: target, archive: item.volid, kind: item.kind, vmid: item.vmid, storage: item.storage } }
    return [
      { label: 'Restore', target, input: { ...base, action: 'restore' }, danger: true, confirm: true, primary: true, fields: [{ key: 'vmid', label: 'Target VMID', kind: 'number', defaultValue: item.vmid, required: true }, { key: 'storage', label: 'Target storage', defaultValue: item.storage }, { key: 'force', label: 'Overwrite existing VMID', kind: 'checkbox' }] },
      { label: 'Delete', target, input: { ...base, action: 'delete-backup' }, danger: true, confirm: true },
    ]
  }

  if (resource.kind === 'ha') {
    const item = resource.item
    const base = { provider: 'proxmox' as const, resourceType: 'ha', resourceId: item.sid, args: { name: item.sid, sid: item.sid, state: item.state || 'started' } }
    return [
      { label: 'Set State', target: item.sid, input: { ...base, action: 'set-ha-state' }, primary: true, fields: [{ key: 'state', label: 'State', kind: 'select', options: ['started', 'stopped', 'enabled', 'disabled', 'ignored'], defaultValue: item.state || 'started' }] },
      { label: 'Remove', target: item.sid, input: { ...base, action: 'remove-ha' }, danger: true, confirm: true },
    ]
  }

  if (resource.kind === 'service') {
    const item = resource.item
    const target = item.name || item.id
    const base = { provider: 'proxmox' as const, resourceType: 'service', resourceId: item.id, args: { node: item.node, name: target } }
    return item.state === 'running'
      ? [
        { label: 'Restart', target, input: { ...base, action: 'restart' }, danger: true, confirm: true, primary: true },
        { label: 'Reload', target, input: { ...base, action: 'reload' } },
        { label: 'Stop', target, input: { ...base, action: 'stop' }, danger: true, confirm: true },
      ]
      : [{ label: 'Start', target, input: { ...base, action: 'start' }, primary: true }]
  }

  if (resource.kind === 'task') {
    const item = resource.item
    const target = item.id || item.upid
    const base = { provider: 'proxmox' as const, resourceType: 'task', resourceId: item.upid, args: { node: item.node, name: target } }
    return [
      { label: 'Status', target, input: { ...base, action: 'task-status' }, primary: true },
      { label: 'Log', target, input: { ...base, action: 'task-log' }, primary: true },
      ...(!item.endtime ? [{ label: 'Stop Task', target, input: { ...base, action: 'stop-task' }, danger: true, confirm: true }] satisfies PveAction[] : []),
    ]
  }

  return []
}

function PveHeader({
  data,
  search,
  quickView,
  viewMode,
  onSearch,
  onQuickView,
  onViewMode,
  actions,
  busyAction,
  refreshing,
  onAction,
  onRefresh,
}: {
  data?: HomelabData
  search: string
  quickView: QuickView
  viewMode: PveViewMode
  onSearch: (value: string) => void
  onQuickView: (value: QuickView) => void
  onViewMode: (value: PveViewMode) => void
  actions: PveAction[]
  busyAction: string | null
  refreshing?: boolean
  onAction: (action: PveAction) => void
  onRefresh: () => void
}) {
  const createActions = actions.filter(action => action.label === 'Create VM' || action.label === 'Create CT')
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        background: panelHeader,
        borderBottom: `1px solid ${border}`,
        padding: '6px 8px',
        minWidth: 0,
      }}
    >
      <ProxmoxBrand />
      <div style={{ position: 'relative', width: 'min(360px, 30vw)', minWidth: 180 }}>
        <MagnifyingGlass size={14} style={{ position: 'absolute', left: 7, top: 6, color: iconMuted }} />
        <input
          value={search}
          onChange={event => onSearch(event.currentTarget.value)}
          aria-label="Search Proxmox resources"
          placeholder="Search"
          style={{ ...inputStyle, width: '100%', paddingLeft: '26px' }}
        />
      </div>
      <QuickViewStrip value={quickView} onChange={onQuickView} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 180, flexWrap: 'wrap' }}>
        {createActions.map(action => (
          <PveButton key={action.label} action={action} busyAction={busyAction} onAction={onAction} prominent />
        ))}
        <button type="button" onClick={onRefresh} style={toolbarButtonStyle}>
          <ArrowClockwise size={13} />
          Reload
        </button>
      </div>
      <SegmentedToggle<PveViewMode>
        ariaLabel="Proxmox display mode"
        value={viewMode}
        options={[
          { value: 'native', label: 'Native' },
          { value: 'classic', label: 'Classic' },
        ]}
        onChange={onViewMode}
      />
      <span style={{ fontSize: '11px', color: muted, border: `1px solid ${border}`, padding: '4px 7px', background: 'var(--pve-chip-bg)', borderRadius: 'var(--pve-radius)' }}>
        {refreshing ? 'refreshing' : `source: ${data?.proxmox.source ?? 'fallback'}`}
      </span>
      <button type="button" style={toolbarButtonStyle}>
        Documentation
      </button>
      <button type="button" style={toolbarButtonStyle}>
        <UserCircle size={14} />
        root@pam
      </button>
    </header>
  )
}

function SegmentedToggle<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div aria-label={ariaLabel} role="group" style={{ display: 'inline-flex', border: `1px solid ${border}`, borderRadius: 'var(--pve-radius)', overflow: 'hidden', background: 'var(--pve-chip-bg)' }}>
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              height: 24,
              border: 'none',
              borderRight: option === options[options.length - 1] ? 'none' : `1px solid ${border}`,
              background: active ? 'var(--pve-chip-active-bg)' : 'transparent',
              color: active ? 'var(--pve-chip-active-text)' : text,
              fontSize: 11,
              fontWeight: active ? 800 : 600,
              padding: '0 8px',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function QuickViewStrip({ value, onChange }: { value: QuickView; onChange: (value: QuickView) => void }) {
  return (
    <SegmentedToggle<QuickView>
      ariaLabel="Quick resource filters"
      value={value}
      options={[
        { value: 'all', label: 'All' },
        { value: 'running', label: 'Running' },
        { value: 'stopped', label: 'Stopped' },
        { value: 'errors', label: 'Risk' },
        { value: 'backups', label: 'Backups' },
        { value: 'storage', label: 'Storage' },
      ]}
      onChange={onChange}
    />
  )
}

function PveButton({
  action,
  busyAction,
  onAction,
  prominent,
}: {
  action: PveAction
  busyAction: string | null
  onAction: (action: PveAction) => void
  prominent?: boolean
}) {
  const busy = busyAction === actionKey(action.input)
  const Icon = action.input.action === 'start' || action.label.startsWith('Create') ? Plus : action.input.action === 'stop' || action.input.action === 'shutdown' ? Stop : action.input.action === 'console' || action.input.action === 'shell' ? Terminal : action.input.action === 'backup' ? ClockCounterClockwise : Play
  const isExternal = action.capability?.status === 'external'
  return (
    <button
      type="button"
      disabled={busyAction !== null}
      title={action.capability?.reason}
      onClick={() => onAction(action)}
      style={{
        ...toolbarButtonStyle,
        borderColor: action.danger ? danger : prominent ? pveOrange : border,
        background: action.danger ? 'var(--pve-button-danger-bg)' : prominent ? 'var(--pve-button-primary-bg)' : toolbarButtonStyle.background,
        color: action.danger ? danger : text,
        opacity: busyAction !== null && !busy ? 0.55 : 1,
      }}
    >
      <Icon size={13} />
      {busy ? 'Running...' : isExternal ? `${action.label} (open)` : action.label}
    </button>
  )
}

function TreeNode({
  node,
  selectedId,
  expanded,
  depth,
  onToggle,
  onSelect,
}: {
  node: PveTreeNode
  selectedId: string
  expanded: Set<string>
  depth: number
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  const hasChildren = Boolean(node.children?.length)
  const isOpen = expanded.has(node.id)
  const isSelected = selectedId === node.id
  const Icon = iconFor(node.kind)
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node.id)
          if (hasChildren && !isOpen) onToggle(node.id)
        }}
        style={{
          width: '100%',
          height: '28px',
          display: 'grid',
          gridTemplateColumns: `${depth * 14 + 18}px 16px minmax(0, 1fr) 58px`,
          alignItems: 'center',
          border: 'none',
          borderBottom: '1px solid var(--pve-grid-line)',
          background: isSelected ? selectedRow : rowBg,
          color: text,
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 3 }}>
          {hasChildren ? (
            <span
              onClick={event => {
                event.stopPropagation()
                onToggle(node.id)
              }}
              style={{ display: 'inline-flex' }}
            >
              {isOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
            </span>
          ) : null}
        </span>
        <Icon size={14} color={node.kind === 'datacenter' ? pveOrange : iconMuted} />
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: statusColor(node.status ?? 'unknown'),
              flex: '0 0 auto',
            }}
          />
          <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
        </span>
        <span style={{ color: muted, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.meta}
        </span>
      </button>
      {hasChildren && isOpen ? node.children?.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          selectedId={selectedId}
          expanded={expanded}
          depth={depth + 1}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      )) : null}
    </div>
  )
}

function PveResourceTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: PveTreeNode[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([DATACENTER_ID]))
  useEffect(() => {
    setExpanded(previous => {
      const next = new Set(previous)
      next.add(DATACENTER_ID)
      for (const root of tree) {
        for (const child of root.children ?? []) {
          if (child.kind === 'node') next.add(child.id)
        }
      }
      return next
    })
  }, [tree])
  const toggle = (id: string) => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <aside style={{ display: 'grid', gridTemplateRows: '32px minmax(0, 1fr)', minWidth: 0, borderRight: `1px solid ${border}`, background: panel }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 6px',
          background: panelHeader,
          borderBottom: `1px solid ${border}`,
        }}
      >
        <select aria-label="Resource tree view" style={{ ...inputStyle, height: '24px', width: '116px', padding: '0 4px' }}>
          <option>Server View</option>
          <option>Folder View</option>
          <option>Pool View</option>
        </select>
        <button type="button" style={{ ...toolbarButtonStyle, height: '24px', padding: '0 6px' }}>
          <Gear size={12} />
        </button>
      </div>
      <div style={{ overflow: 'auto' }}>
        {tree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            selectedId={selectedId}
            expanded={expanded}
            depth={0}
            onToggle={toggle}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  )
}

function PveConfigNav({
  tabs,
  activeTab,
  onTab,
}: {
  tabs: string[]
  activeTab: string
  onTab: (tab: string) => void
}) {
  return (
    <nav style={{ background: panelDark, borderRight: `1px solid ${border}`, overflow: 'auto' }}>
      {tabs.map(tab => (
        <button
          key={tab}
          type="button"
          onClick={() => onTab(tab)}
          style={{
            width: '100%',
            height: '30px',
            border: 'none',
            borderBottom: '1px solid var(--pve-grid-line)',
            background: activeTab === tab ? selectedRow : 'transparent',
            color: activeTab === tab ? 'var(--pve-chip-active-text)' : text,
            fontSize: '12px',
            fontWeight: activeTab === tab ? 700 : 500,
            textAlign: 'left',
            padding: '0 10px',
            cursor: 'pointer',
          }}
        >
          {tab}
        </button>
      ))}
    </nav>
  )
}

function PvePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: `1px solid ${border}`, background: panel, minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: '30px minmax(0, 1fr)' }}>
      <div style={{ background: panelHeader, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', padding: '0 9px', fontSize: '12px', fontWeight: 800, color: text }}>
        {title}
      </div>
      <div style={{ overflow: 'auto', minWidth: 0 }}>{children}</div>
    </section>
  )
}

function PveMetric({ label: metricLabel, value, sub, tone = 'blue' }: { label: string; value: string; sub?: string; tone?: 'blue' | 'orange' | 'green' | 'red' }) {
  const color = tone === 'orange' ? pveOrange : tone === 'green' ? ok : tone === 'red' ? danger : pveBlue
  return (
    <div style={{ border: `1px solid ${border}`, background: panel, padding: '10px', minWidth: 0, borderRadius: 'var(--pve-radius)' }}>
      <div style={{ color: muted, fontSize: '11px', textTransform: 'uppercase', fontWeight: 800 }}>{metricLabel}</div>
      <div style={{ color, fontSize: '20px', fontWeight: 800, lineHeight: 1.15, marginTop: 5 }}>{value}</div>
      {sub ? <div style={{ color: muted, fontSize: '11px', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div> : null}
    </div>
  )
}

function PveProgress({ value, color = pveBlue }: { value: number; color?: string }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ height: 13, flex: 1, border: `1px solid ${border}`, background: panelDark, minWidth: 60, borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${bounded}%`, height: '100%', background: color }} />
      </div>
      <span style={{ color: muted, fontSize: 11, minWidth: 34, textAlign: 'right' }}>{bounded}%</span>
    </div>
  )
}

function PveGrid({
  columns,
  rows,
  onSelect,
}: {
  columns: Array<{ key: string; label: string; width?: string }>
  rows: Array<Record<string, React.ReactNode> & { id: string }>
  onSelect?: (id: string) => void
}) {
  return (
    <div style={{ overflow: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>{columns.map(column => <th key={column.key} style={{ ...gridHeaderStyle, width: column.width }}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr
              key={row.id}
              onDoubleClick={() => onSelect?.(row.id)}
              style={{ background: index % 2 === 0 ? rowBg : rowAlt, cursor: onSelect ? 'pointer' : 'default' }}
              onMouseEnter={event => {
                event.currentTarget.style.background = rowHover
              }}
              onMouseLeave={event => {
                event.currentTarget.style.background = index % 2 === 0 ? rowBg : rowAlt
              }}
            >
              {columns.map(column => <td key={column.key} style={gridCellStyle}>{row[column.key] ?? ''}</td>)}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} style={{ ...gridCellStyle, color: muted }}>
                No records
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(status) }} />
      {status}
    </span>
  )
}

function SummaryLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 10, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>{children}</div>
}

function CapabilityStatusPill({ status }: { status: HomelabCapabilityStatus }) {
  const normalized = capabilityStatusLabel(status)
  const color = capabilityStatusColor(status)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color, fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {normalized}
    </span>
  )
}

function ProxmoxCoveragePanel({ data, focus }: { data: HomelabData; focus?: string }) {
  const allRows = proxmoxCapabilities(data)
  const lowerFocus = focus?.toLowerCase()
  const rows = (lowerFocus
    ? allRows.filter(item =>
      String(item.surface ?? '').toLowerCase().includes(lowerFocus) ||
      item.resource_type.toLowerCase().includes(lowerFocus) ||
      item.action.toLowerCase().includes(lowerFocus),
    )
    : allRows)
  const counts = capabilityStatusCounts(data)
  const total = Math.max(counts.total, 1)
  const shippedPercent = Math.round((counts.implemented / total) * 100)

  return (
    <div style={{ minHeight: '100%', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', background: panel }}>
      <SummaryLayout>
        <PveMetric label="Implemented" value={String(counts.implemented)} sub={`${shippedPercent}% of mapped surfaces`} tone="green" />
        <PveMetric label="Read only" value={String(counts.readOnly)} sub="visible inventory without full control" tone="orange" />
        <PveMetric label="Blocked" value={String(counts.blocked)} sub="not rendered as active controls" tone="red" />
        <PveMetric label="Mapped" value={String(total)} sub="backend capability records" />
      </SummaryLayout>
      <div style={{ minHeight: 0, padding: '0 10px 10px' }}>
        <PveGrid
          columns={[
            { key: 'surface', label: 'Surface' },
            { key: 'resource', label: 'Resource', width: '120px' },
            { key: 'action', label: 'Action' },
            { key: 'status', label: 'Status', width: '116px' },
            { key: 'next', label: 'Next' },
          ]}
          rows={rows.map((item, index) => ({
            id: `${item.resource_type}:${item.action}:${index}`,
            surface: item.surface ?? item.resource_type,
            resource: item.resource_type,
            action: item.action,
            status: <CapabilityStatusPill status={item.status} />,
            next: item.next ?? item.reason ?? item.backend ?? item.mode ?? '',
          }))}
        />
      </div>
    </div>
  )
}

function DatacenterContent({ data, tab, onSelect }: { data: HomelabData; tab: string; onSelect: (id: string) => void }) {
  const runningGuests = data.proxmox.vms.filter(vm => vm.status === 'running').length
  const storage = data.proxmox.storage ?? []
  const used = storage.reduce((sum, item) => sum + item.used, 0)
  const total = storage.reduce((sum, item) => sum + item.total, 0)
  const tasks = data.proxmox.tasks ?? []

  if (tab === 'Coverage') return <ProxmoxCoveragePanel data={data} />
  if (tab === 'Storage') return <StorageGrid storage={storage} onSelect={onSelect} />
  if (tab === 'Pools') return <PoolPanel pools={data.proxmox.pools ?? []} />
  if (tab === 'Backup') return <DatacenterBackupPanel data={data} onSelect={onSelect} />
  if (tab === 'Replication') return <ReplicationPanel jobs={data.proxmox.replication_jobs ?? []} />
  if (tab === 'HA') return <HaManagerPanel data={data} onSelect={onSelect} />
  if (tab === 'Permissions') return <ProxmoxPermissionsPanel permissions={data.proxmox.permissions} />
  if (tab === 'SDN') return <SdnPanel sdn={data.proxmox.sdn} />
  if (tab === 'Logs') return <ProxmoxLogsPanel logs={data.proxmox.logs} />
  if (tab === 'Firewall') return <DatacenterFirewallPanel firewall={data.proxmox.firewall} />
  if (tab === 'Tasks') return <TaskGrid tasks={tasks} onSelect={onSelect} />
  if (tab !== 'Summary' && tab !== 'Search') return <Placeholder title={tab} text={`Parity gap: ${tab} navigation is visible for map completeness, but this panel is not implemented yet.`} />

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Cluster Health" value={data.live?.proxmox === false ? 'Degraded' : 'OK'} sub={`${data.proxmox.source ?? 'api'} source`} tone={data.live?.proxmox === false ? 'red' : 'green'} />
        <PveMetric label="Nodes" value={`${data.proxmox.nodes.filter(node => node.status === 'online').length}/${data.proxmox.nodes.length}`} sub="online" />
        <PveMetric label="Guests" value={`${runningGuests}/${data.proxmox.vms.length}`} sub="running" tone="orange" />
        <PveMetric label="Storage" value={total ? `${Math.round((used / total) * 100)}%` : '0%'} sub={`${formatBytes(used)} / ${formatBytes(total)}`} />
      </SummaryLayout>
      <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <PvePanel title="Nodes">
          <NodeGrid nodes={data.proxmox.nodes} onSelect={onSelect} />
        </PvePanel>
        <PvePanel title="Guests">
          <GuestGrid guests={data.proxmox.vms} onSelect={onSelect} />
        </PvePanel>
        <PvePanel title="Storage">
          <StorageGrid storage={storage} onSelect={onSelect} />
        </PvePanel>
        <PvePanel title="Recent Tasks">
          <TaskGrid tasks={tasks.slice(0, 10)} onSelect={onSelect} />
        </PvePanel>
      </div>
    </div>
  )
}

function NodeContent({ data, node, tab, onSelect }: { data: HomelabData; node: NodeInfo; tab: string; onSelect: (id: string) => void }) {
  const guests = guestsForNode(data, node)
  const storage = (data.proxmox.storage ?? []).filter(item => nodeKey(item.node) === nodeKey(node.name))
  const tasks = (data.proxmox.tasks ?? []).filter(task => nodeKey(task.node) === nodeKey(node.name))
  const services = (data.proxmox.services ?? []).filter(service => nodeKey(service.node) === nodeKey(node.name))

  if (tab === 'Services') return <ServiceGrid services={services} onSelect={onSelect} />
  if (tab === 'Task History') return <TaskGrid tasks={tasks} onSelect={onSelect} />
  if (tab === 'Logs') return <ProxmoxLogsPanel logs={data.proxmox.logs} node={node.name} />
  if (tab === 'Firewall') return <FirewallGrid guests={guests} />
  if (tab === 'Disks' || tab === 'ZFS' || tab === 'Ceph') return <StorageGrid storage={storage} onSelect={onSelect} />
  if (tab === 'Network') return <NodeNetworkGrid data={data} node={node} />
  if (tab === 'Shell') return <ProxmoxShellTerminal node={node} />
  if (tab === 'DNS') return <NodeDnsPanel data={data} node={node} />
  if (tab === 'Hosts') return <NodeHostsPanel data={data} node={node} />
  if (tab === 'Time') return <NodeTimePanel data={data} node={node} />
  if (tab === 'Repositories' || tab === 'Updates') return <NodeRepositoryGrid data={data} node={node} />
  if (tab !== 'Summary') return <Placeholder title={tab} text={`Parity gap: ${tab} data/actions are not implemented in clawctrl yet.`} />

  return (
    <div style={{ padding: 10, display: 'grid', gap: 10 }}>
      <SummaryLayout>
        <PveMetric label="Status" value={node.status} sub={`uptime ${formatUptime(node.uptime)}`} tone={node.status === 'online' ? 'green' : 'red'} />
        <PveMetric label="Guests" value={`${guests.filter(vm => vm.status === 'running').length}/${guests.length}`} sub="running" />
        <div style={{ border: `1px solid ${border}`, background: panel, padding: 10, borderRadius: 'var(--pve-radius)' }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>CPU usage</div>
          <PveProgress value={node.cpu * 100} color={node.cpu > 0.7 ? danger : pveBlue} />
        </div>
        <div style={{ border: `1px solid ${border}`, background: panel, padding: 10, borderRadius: 'var(--pve-radius)' }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>Memory usage</div>
          <PveProgress value={node.mem_total ? (node.mem_used / node.mem_total) * 100 : 0} color={pveOrange} />
          <div style={{ fontSize: 11, color: muted, marginTop: 5 }}>{formatBytes(node.mem_used)} / {formatBytes(node.mem_total)}</div>
        </div>
      </SummaryLayout>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <PvePanel title="Virtual Guests"><GuestGrid guests={guests} onSelect={onSelect} /></PvePanel>
        <PvePanel title="Services"><ServiceGrid services={services} onSelect={onSelect} /></PvePanel>
      </div>
    </div>
  )
}

function GuestContent({ data, vm, tab, onSelect }: { data: HomelabData; vm: VMInfo; tab: string; onSelect?: (id: string) => void }) {
  const backupRows = (data.proxmox.backups ?? []).filter(backup => backup.vmid === vm.vmid)
  const replicationRows = (data.proxmox.replication_jobs ?? []).filter(job => job.guest === String(vm.vmid) || job.id.startsWith(`${vm.vmid}-`) || job.id.startsWith(`${vm.vmid}:`))
  const taskRows = (data.proxmox.tasks ?? []).filter(task =>
    String(task.id ?? '').includes(String(vm.vmid ?? '')) ||
    String(task.upid ?? '').includes(`:${vm.vmid ?? ''}:`),
  )
  if (tab === 'Hardware' || tab === 'Resources') return <GuestHardware vm={vm} />
  if (tab === 'Network') return <NetworkGrid guests={[vm]} />
  if (tab === 'Snapshots') return <SnapshotGrid vm={vm} />
  if (tab === 'Firewall') return <GuestFirewall vm={vm} />
  if (tab === 'Backup') return <BackupGrid backups={backupRows} onSelect={onSelect ?? (() => undefined)} />
  if (tab === 'Replication') return <ReplicationPanel jobs={replicationRows} />
  if (tab === 'Console') return <ProxmoxNoVncConsole data={data} vm={vm} />
  if (tab === 'Task History') return <TaskGrid tasks={taskRows} onSelect={onSelect ?? (() => undefined)} />
  if (tab === 'Monitor' || tab === 'Permissions' || tab === 'Cloud-Init' || tab === 'DNS') return <ProxmoxCoveragePanel data={data} focus={tab} />
  if (tab === 'Options') return <OptionsGrid vm={vm} />

  const ha = vm.config?.ha ? String(vm.config.ha) : 'not configured'
  return (
    <div style={{ padding: 10, display: 'grid', gap: 10 }}>
      <SummaryLayout>
        <PveMetric label="Status" value={vm.status} sub={`${vm.kind ?? 'qemu'} on ${vm.node ?? 'node'}`} tone={vm.status === 'running' ? 'green' : 'red'} />
        <PveMetric label="VMID" value={String(vm.vmid ?? '-')} sub={vm.name} />
        <div style={{ border: `1px solid ${border}`, background: panel, padding: 10, borderRadius: 'var(--pve-radius)' }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>CPU usage</div>
          <PveProgress value={vm.cpu * 100} />
        </div>
        <div style={{ border: `1px solid ${border}`, background: panel, padding: 10, borderRadius: 'var(--pve-radius)' }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>Memory usage</div>
          <PveProgress value={vm.maxmem ? (vm.mem / vm.maxmem) * 100 : 0} color={pveOrange} />
          <div style={{ fontSize: 11, color: muted, marginTop: 5 }}>{formatBytes(vm.mem)} / {formatBytes(vm.maxmem ?? 0)}</div>
        </div>
      </SummaryLayout>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: 10 }}>
        <PvePanel title="Hardware"><GuestHardware vm={vm} /></PvePanel>
        <PvePanel title="Protection and HA">
          <PveGrid
            columns={[{ key: 'name', label: 'Option' }, { key: 'value', label: 'Value' }]}
            rows={[
              { id: 'node', name: 'Node', value: vm.node ?? '-' },
              { id: 'onboot', name: 'Start at boot', value: String(vm.config?.onboot ?? '0') },
              { id: 'protection', name: 'Protection', value: String(vm.config?.protection ?? '0') },
              { id: 'tags', name: 'Tags', value: String(vm.config?.tags ?? '-') },
              { id: 'ha', name: 'HA', value: ha },
            ]}
          />
        </PvePanel>
      </div>
    </div>
  )
}

function GuestHardware({ vm }: { vm: VMInfo }) {
  const rows = [
    ...Object.entries(vm.config ?? {})
      .filter(([key]) => ['memory', 'cores', 'sockets', 'cpu', 'boot', 'ostype', 'agent', 'bios', 'machine'].includes(key))
      .map(([key, value]) => ({ id: key, name: key, value: String(value), type: 'Option' })),
    ...(vm.disks ?? []).map(item => ({ id: item.key, name: item.key, value: item.value, type: 'Disk' })),
    ...(vm.networks ?? []).map(item => ({ id: item.key, name: item.key, value: item.value, type: 'Network' })),
  ]
  return <PveGrid columns={[{ key: 'name', label: 'Device', width: '180px' }, { key: 'type', label: 'Type', width: '100px' }, { key: 'value', label: 'Value' }]} rows={rows} />
}

function OptionsGrid({ vm }: { vm: VMInfo }) {
  const rows = Object.entries(vm.config ?? {}).map(([key, value]) => ({ id: key, name: key, value: String(value) }))
  return <PveGrid columns={[{ key: 'name', label: 'Name', width: '200px' }, { key: 'value', label: 'Value' }]} rows={rows} />
}

function SnapshotGrid({ vm }: { vm: VMInfo }) {
  return (
    <PveGrid
      columns={[{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'time', label: 'Date' }, { key: 'vmstate', label: 'RAM' }]}
      rows={(vm.snapshots ?? []).map(snapshot => ({
        id: snapshot.name,
        name: snapshot.name,
        description: snapshot.description ?? '',
        time: snapshot.snaptime ? new Date(snapshot.snaptime * 1000).toLocaleString() : '',
        vmstate: snapshot.vmstate ? 'yes' : 'no',
      }))}
    />
  )
}

function GuestFirewall({ vm }: { vm: VMInfo }) {
  return (
    <PveGrid
      columns={[{ key: 'pos', label: 'Pos', width: '60px' }, { key: 'type', label: 'Dir', width: '70px' }, { key: 'action', label: 'Action' }, { key: 'proto', label: 'Proto' }, { key: 'dport', label: 'D.Port' }, { key: 'source', label: 'Source' }, { key: 'dest', label: 'Dest' }, { key: 'comment', label: 'Comment' }]}
      rows={(vm.firewall_rules ?? []).map((rule, index) => ({
        id: String(rule.pos ?? index),
        pos: rule.pos ?? index,
        type: rule.type ?? '',
        action: rule.action ?? '',
        proto: rule.proto ?? '',
        dport: rule.dport ?? '',
        source: rule.source ?? '',
        dest: rule.dest ?? '',
        comment: rule.comment ?? '',
      }))}
    />
  )
}

function NodeGrid({ nodes, onSelect }: { nodes: NodeInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'name', label: 'Node' }, { key: 'status', label: 'Status' }, { key: 'cpu', label: 'CPU' }, { key: 'mem', label: 'Memory' }, { key: 'uptime', label: 'Uptime' }]}
      rows={nodes.map(node => ({
        id: `node:${node.name}`,
        name: node.name,
        status: <StatusPill status={node.status} />,
        cpu: percent(node.cpu),
        mem: `${formatBytes(node.mem_used)} / ${formatBytes(node.mem_total)}`,
        uptime: formatUptime(node.uptime),
      }))}
    />
  )
}

function GuestGrid({ guests, onSelect }: { guests: VMInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'vmid', label: 'VMID', width: '70px' }, { key: 'name', label: 'Name' }, { key: 'node', label: 'Node' }, { key: 'status', label: 'Status' }, { key: 'cpu', label: 'CPU' }, { key: 'mem', label: 'Memory' }, { key: 'kind', label: 'Type' }]}
      rows={sortGuests(guests).map(vm => {
        const kind = vm.kind === 'lxc' ? 'lxc' : 'qemu'
        return {
          id: `${kind}:${vm.node ?? 'node'}:${vm.vmid ?? vm.name}`,
          vmid: vm.vmid ?? '-',
          name: vm.name,
          node: vm.node ?? '-',
          status: <StatusPill status={vm.status} />,
          cpu: percent(vm.cpu),
          mem: `${formatBytes(vm.mem)} / ${formatBytes(vm.maxmem ?? 0)}`,
          kind,
        }
      })}
    />
  )
}

function StorageGrid({ storage, onSelect }: { storage: ProxmoxStorageInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'name', label: 'Storage' }, { key: 'node', label: 'Node' }, { key: 'type', label: 'Type' }, { key: 'content', label: 'Content' }, { key: 'status', label: 'Status' }, { key: 'used', label: 'Used' }, { key: 'shared', label: 'Shared' }]}
      rows={storage.map(item => ({
        id: `storage:${item.node}:${item.name}`,
        name: item.name,
        node: item.node,
        type: item.storage_type,
        content: item.content,
        status: <StatusPill status={item.active ? 'online' : item.enabled ? 'unknown' : 'offline'} />,
        used: `${formatBytes(item.used)} / ${formatBytes(item.total)}`,
        shared: item.shared ? 'yes' : 'no',
      }))}
    />
  )
}

function BackupGrid({ backups, onSelect }: { backups: ProxmoxBackupInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'name', label: 'Archive' }, { key: 'node', label: 'Node' }, { key: 'storage', label: 'Storage' }, { key: 'vmid', label: 'VMID' }, { key: 'format', label: 'Format' }, { key: 'size', label: 'Size' }, { key: 'ctime', label: 'Date' }, { key: 'protected', label: 'Protected' }]}
      rows={backups.map(item => ({
        id: `backup:${item.volid}`,
        name: item.name,
        node: item.node,
        storage: item.storage,
        vmid: item.vmid ?? '',
        format: item.format,
        size: formatBytes(item.size),
        ctime: item.ctime ? new Date(item.ctime * 1000).toLocaleString() : '',
        protected: item.protected ? 'yes' : 'no',
      }))}
    />
  )
}

function BackupJobGrid({ jobs }: { jobs: ProxmoxBackupJobInfo[] }) {
  return (
    <PveGrid
      columns={[
        { key: 'id', label: 'Job' },
        { key: 'enabled', label: 'Enabled', width: '80px' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'storage', label: 'Storage', width: '100px' },
        { key: 'selection', label: 'Selection' },
        { key: 'mode', label: 'Mode', width: '90px' },
        { key: 'compress', label: 'Compress', width: '90px' },
        { key: 'prune', label: 'Retention' },
        { key: 'notify', label: 'Notify' },
      ]}
      rows={jobs.map(item => ({
        id: `backup-job:${item.id}`,
        enabled: item.enabled ? 'yes' : 'no',
        schedule: item.schedule || '-',
        storage: item.storage || '-',
        selection: item.all ? 'all guests' : item.vmids || (item.exclude ? `exclude ${item.exclude}` : '-'),
        mode: item.mode || '-',
        compress: item.compress || '-',
        prune: item.prune_backups || '-',
        notify: item.mailnotification || item.notification_mode || item.mailto || '-',
      }))}
    />
  )
}

function DatacenterBackupPanel({ data, onSelect }: { data: HomelabData; onSelect: (id: string) => void }) {
  const jobs = data.proxmox.backup_jobs ?? []
  const backups = data.proxmox.backups ?? []
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Backup Jobs" value={String(jobs.length)} sub={`${jobs.filter(job => job.enabled).length} enabled`} />
        <PveMetric label="Archives" value={String(backups.length)} sub={`${backups.filter(item => item.protected).length} protected`} />
        <PveMetric label="Storages" value={String(new Set(backups.map(item => item.storage).filter(Boolean)).size)} />
      </SummaryLayout>
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        <PvePanel title="Scheduled Backup Jobs">
          <BackupJobGrid jobs={jobs} />
        </PvePanel>
        <PvePanel title="Backup Archives">
          <BackupGrid backups={backups} onSelect={onSelect} />
        </PvePanel>
      </div>
    </div>
  )
}

function formatUnixTime(value: number | undefined): string {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

function ReplicationJobGrid({ jobs }: { jobs: ProxmoxReplicationJobInfo[] }) {
  return (
    <PveGrid
      columns={[
        { key: 'id', label: 'Job' },
        { key: 'enabled', label: 'Enabled', width: '80px' },
        { key: 'guest', label: 'Guest', width: '80px' },
        { key: 'source', label: 'Source' },
        { key: 'target', label: 'Target' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'rate', label: 'Rate', width: '80px' },
        { key: 'next', label: 'Next Sync' },
        { key: 'last', label: 'Last Sync' },
        { key: 'failures', label: 'Failures', width: '80px' },
        { key: 'error', label: 'Error' },
      ]}
      rows={jobs.map(item => ({
        id: `replication:${item.id}`,
        enabled: item.enabled ? 'yes' : 'no',
        guest: item.guest,
        source: item.source,
        target: item.target,
        schedule: item.schedule,
        rate: item.rate,
        next: formatUnixTime(item.next_sync),
        last: formatUnixTime(item.last_sync || item.last_try),
        failures: item.fail_count || '',
        error: item.error,
      }))}
    />
  )
}

function ReplicationPanel({ jobs }: { jobs: ProxmoxReplicationJobInfo[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Replication Jobs" value={String(jobs.length)} sub={`${jobs.filter(job => job.enabled).length} enabled`} />
        <PveMetric label="Targets" value={String(new Set(jobs.map(job => job.target).filter(Boolean)).size)} />
        <PveMetric label="Failures" value={String(jobs.reduce((sum, job) => sum + (job.fail_count || 0), 0))} tone={jobs.some(job => job.fail_count > 0 || job.error) ? 'red' : 'green'} />
      </SummaryLayout>
      <div style={{ padding: 10 }}>
        <PvePanel title="Replication Jobs">
          <ReplicationJobGrid jobs={jobs} />
        </PvePanel>
      </div>
    </div>
  )
}

function PoolPanel({ pools }: { pools: ProxmoxPoolInfo[] }) {
  const memberRows = pools.flatMap(pool => (pool.members ?? []).map((member, index) => ({
    id: `pool-member:${pool.poolid}:${index}`,
    pool: pool.poolid,
    type: String(member.type ?? ''),
    idText: String(member.id ?? member.vmid ?? member.storage ?? member.name ?? ''),
    node: String(member.node ?? ''),
    name: String(member.name ?? member.storage ?? ''),
  })))

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Pools" value={String(pools.length)} />
        <PveMetric label="Members" value={String(pools.reduce((sum, pool) => sum + (pool.member_count ?? pool.members?.length ?? 0), 0))} />
      </SummaryLayout>
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        <PvePanel title="Pools">
          <PveGrid
            columns={[{ key: 'poolid', label: 'Pool' }, { key: 'members', label: 'Members', width: '90px' }, { key: 'comment', label: 'Comment' }]}
            rows={pools.map(pool => ({ id: `pool:${pool.poolid}`, poolid: pool.poolid, members: pool.member_count ?? pool.members?.length ?? 0, comment: pool.comment }))}
          />
        </PvePanel>
        <PvePanel title="Pool Members">
          <PveGrid
            columns={[{ key: 'pool', label: 'Pool' }, { key: 'type', label: 'Type' }, { key: 'idText', label: 'ID' }, { key: 'node', label: 'Node' }, { key: 'name', label: 'Name / Storage' }]}
            rows={memberRows}
          />
        </PvePanel>
      </div>
    </div>
  )
}

function sdnProviderRows(rows: Array<Record<string, unknown>>, prefix: string) {
  return rows.map((item, index) => ({
    id: `${prefix}:${fieldText(item, 'id') || fieldText(item, 'name') || fieldText(item, 'type') || index}`,
    idText: fieldText(item, 'id') || fieldText(item, 'name') || fieldText(item, 'plugin') || fieldText(item, 'dhcp') || fieldText(item, 'dns') || fieldText(item, 'ipam'),
    type: fieldText(item, 'type'),
    state: fieldText(item, 'state') || fieldText(item, 'status'),
    comment: fieldText(item, 'comment') || (fieldText(item, 'disable') ? `disabled: ${fieldText(item, 'disable')}` : ''),
  }))
}

function SdnProviderGrid({ rows, prefix }: { rows: Array<Record<string, unknown>>; prefix: string }) {
  return (
    <PveGrid
      columns={[
        { key: 'idText', label: 'ID' },
        { key: 'type', label: 'Type', width: '120px' },
        { key: 'state', label: 'State', width: '110px' },
        { key: 'comment', label: 'Comment' },
      ]}
      rows={sdnProviderRows(rows, prefix)}
    />
  )
}

function SdnPanel({ sdn }: { sdn?: ProxmoxSdnInfo }) {
  const zones = sdn?.zones ?? []
  const vnets = sdn?.vnets ?? []
  const subnets = sdn?.subnets ?? []
  const controllers = sdn?.controllers ?? []
  const ipams = sdn?.ipams ?? []
  const dns = sdn?.dns ?? []
  const dhcp = sdn?.dhcp ?? []
  const status = sdn?.status ?? []
  const pendingVnets = vnets.filter(item => item.pending && Object.keys(item.pending).length > 0).length

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Zones" value={String(zones.length)} />
        <PveMetric label="VNets" value={String(vnets.length)} sub={`${pendingVnets} pending`} tone={pendingVnets ? 'orange' : 'blue'} />
        <PveMetric label="Subnets" value={String(subnets.length)} />
        <PveMetric label="Providers" value={String(controllers.length + ipams.length + dns.length + dhcp.length)} sub="controllers/IPAM/DNS/DHCP" />
      </SummaryLayout>
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        <PvePanel title="Status">
          <PveGrid
            columns={[
              { key: 'idText', label: 'ID' },
              { key: 'type', label: 'Type', width: '120px' },
              { key: 'state', label: 'State', width: '110px' },
              { key: 'message', label: 'Message' },
            ]}
            rows={status.map((item, index) => ({
              id: `sdn-status:${fieldText(item, 'id') || index}`,
              idText: fieldText(item, 'id') || fieldText(item, 'name') || fieldText(item, 'vnet') || fieldText(item, 'zone'),
              type: fieldText(item, 'type'),
              state: fieldText(item, 'state') || fieldText(item, 'status'),
              message: fieldText(item, 'msg') || fieldText(item, 'message') || fieldText(item, 'comment'),
            }))}
          />
        </PvePanel>
        <PvePanel title="Zones">
          <PveGrid
            columns={[{ key: 'zone', label: 'Zone' }, { key: 'type', label: 'Type', width: '120px' }, { key: 'nodes', label: 'Nodes' }, { key: 'mtu', label: 'MTU', width: '80px' }, { key: 'comment', label: 'Comment' }]}
            rows={zones.map((item, index) => ({
              id: `sdn-zone:${fieldText(item, 'zone') || fieldText(item, 'id') || index}`,
              zone: fieldText(item, 'zone') || fieldText(item, 'id'),
              type: fieldText(item, 'type'),
              nodes: fieldText(item, 'nodes'),
              mtu: fieldText(item, 'mtu'),
              comment: fieldText(item, 'comment'),
            }))}
          />
        </PvePanel>
        <PvePanel title="VNets">
          <PveGrid
            columns={[{ key: 'vnet', label: 'VNet' }, { key: 'zone', label: 'Zone' }, { key: 'alias', label: 'Alias' }, { key: 'tag', label: 'Tag', width: '80px' }, { key: 'vlanaware', label: 'VLAN aware', width: '100px' }, { key: 'mtu', label: 'MTU', width: '80px' }, { key: 'pending', label: 'Pending' }]}
            rows={vnets.map(item => ({
              id: `sdn-vnet:${item.vnet}`,
              vnet: item.vnet,
              zone: item.zone,
              alias: item.alias,
              tag: item.tag,
              vlanaware: item.vlanaware ? 'yes' : 'no',
              mtu: item.mtu,
              pending: compactJson(item.pending),
            }))}
          />
        </PvePanel>
        <PvePanel title="Subnets">
          <PveGrid
            columns={[{ key: 'vnet', label: 'VNet' }, { key: 'subnet', label: 'Subnet' }, { key: 'gateway', label: 'Gateway' }, { key: 'snat', label: 'SNAT', width: '70px' }, { key: 'dhcpRange', label: 'DHCP range' }, { key: 'dnszoneprefix', label: 'DNS prefix' }]}
            rows={subnets.map((item, index) => ({
              id: `sdn-subnet:${item.vnet}:${item.subnet}:${index}`,
              vnet: item.vnet,
              subnet: item.subnet,
              gateway: item.gateway,
              snat: item.snat ? 'yes' : 'no',
              dhcpRange: item.dhcp_range,
              dnszoneprefix: item.dnszoneprefix,
            }))}
          />
        </PvePanel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          <PvePanel title="Controllers"><SdnProviderGrid rows={controllers} prefix="sdn-controller" /></PvePanel>
          <PvePanel title="IPAM"><SdnProviderGrid rows={ipams} prefix="sdn-ipam" /></PvePanel>
          <PvePanel title="DNS"><SdnProviderGrid rows={dns} prefix="sdn-dns" /></PvePanel>
          <PvePanel title="DHCP"><SdnProviderGrid rows={dhcp} prefix="sdn-dhcp" /></PvePanel>
        </div>
      </div>
    </div>
  )
}

function logMessage(item: Record<string, unknown>): string {
  return fieldText(item, 'msg') || fieldText(item, 'message') || fieldText(item, 'text') || compactJson(item)
}

function logTime(item: Record<string, unknown>): string {
  return fieldText(item, 't') || fieldText(item, 'time') || fieldText(item, 'timestamp') || fieldText(item, 'datetime')
}

function ProxmoxLogGrid({ rows, idPrefix }: { rows: Array<Record<string, unknown>>; idPrefix: string }) {
  return (
    <PveGrid
      columns={[
        { key: 'time', label: 'Time', width: '170px' },
        { key: 'node', label: 'Node', width: '90px' },
        { key: 'source', label: 'Source', width: '90px' },
        { key: 'user', label: 'User', width: '130px' },
        { key: 'severity', label: 'Severity', width: '90px' },
        { key: 'message', label: 'Message' },
      ]}
      rows={rows.map((item, index) => ({
        id: `${idPrefix}:${fieldText(item, 'n') || fieldText(item, 'id') || index}`,
        time: logTime(item),
        node: fieldText(item, 'node'),
        source: fieldText(item, 'source'),
        user: fieldText(item, 'user') || fieldText(item, 'uid'),
        severity: fieldText(item, 'pri') || fieldText(item, 'priority') || fieldText(item, 'severity'),
        message: logMessage(item),
      }))}
    />
  )
}

function ProxmoxLogsPanel({ logs, node }: { logs?: ProxmoxLogsInfo; node?: string }) {
  const cluster = logs?.cluster ?? []
  const syslog = (logs?.node_syslog ?? []).filter(item => !node || nodeKey(fieldText(item, 'node')) === nodeKey(node))
  const journal = (logs?.node_journal ?? []).filter(item => !node || nodeKey(fieldText(item, 'node')) === nodeKey(node))
  const allNodeRows = [...syslog, ...journal]

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Cluster Log" value={String(cluster.length)} />
        <PveMetric label="Syslog" value={String(syslog.length)} sub={node ? node : 'all nodes'} />
        <PveMetric label="Journal" value={String(journal.length)} sub={node ? node : 'all nodes'} />
        <PveMetric label="Visible Rows" value={String(cluster.length + allNodeRows.length)} />
      </SummaryLayout>
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        {!node ? (
          <PvePanel title="Cluster Log">
            <ProxmoxLogGrid rows={cluster} idPrefix="cluster-log" />
          </PvePanel>
        ) : null}
        <PvePanel title={node ? `${node} Syslog` : 'Node Syslog'}>
          <ProxmoxLogGrid rows={syslog} idPrefix="node-syslog" />
        </PvePanel>
        <PvePanel title={node ? `${node} Journal` : 'Node Journal'}>
          <ProxmoxLogGrid rows={journal} idPrefix="node-journal" />
        </PvePanel>
      </div>
    </div>
  )
}

function StorageContentGrid({ items }: { items: ProxmoxStorageContentInfo[] }) {
  return (
    <PveGrid
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'content', label: 'Content', width: '100px' },
        { key: 'node', label: 'Node', width: '90px' },
        { key: 'storage', label: 'Storage', width: '110px' },
        { key: 'vmid', label: 'VMID', width: '70px' },
        { key: 'format', label: 'Format', width: '90px' },
        { key: 'size', label: 'Size', width: '100px' },
        { key: 'ctime', label: 'Date' },
        { key: 'protected', label: 'Protected', width: '90px' },
      ]}
      rows={items.map(item => ({
        id: `storage-content:${item.volid}`,
        name: item.name || item.volid,
        content: item.content || item.subtype,
        node: item.node,
        storage: item.storage,
        vmid: item.vmid ?? '',
        format: item.format,
        size: formatBytes(item.size),
        ctime: item.ctime ? new Date(item.ctime * 1000).toLocaleString() : '',
        protected: item.protected ? 'yes' : 'no',
      }))}
    />
  )
}

function HaGrid({ resources, onSelect }: { resources: ProxmoxHaResourceInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'sid', label: 'Resource' }, { key: 'type', label: 'Type' }, { key: 'state', label: 'State' }, { key: 'group', label: 'Group' }, { key: 'comment', label: 'Comment' }]}
      rows={resources.map(item => ({
        id: `ha:${item.sid}`,
        sid: item.sid,
        type: item.resource_type,
        state: <StatusPill status={item.state} />,
        group: item.group,
        comment: item.comment,
      }))}
    />
  )
}

function HaGroupGrid({ groups }: { groups: ProxmoxHaGroupInfo[] }) {
  return (
    <PveGrid
      columns={[{ key: 'group', label: 'Group' }, { key: 'nodes', label: 'Nodes' }, { key: 'restricted', label: 'Restricted', width: '100px' }, { key: 'nofailback', label: 'No failback', width: '100px' }, { key: 'comment', label: 'Comment' }]}
      rows={groups.map(item => ({
        id: `ha-group:${item.group}`,
        group: item.group,
        nodes: item.nodes,
        restricted: item.restricted ? 'yes' : 'no',
        nofailback: item.nofailback ? 'yes' : 'no',
        comment: item.comment,
      }))}
    />
  )
}

function HaStatusGrid({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <PveGrid
      columns={[{ key: 'id', label: 'ID' }, { key: 'type', label: 'Type', width: '90px' }, { key: 'node', label: 'Node', width: '90px' }, { key: 'status', label: 'Status' }, { key: 'state', label: 'State' }, { key: 'quorate', label: 'Quorate', width: '80px' }]}
      rows={rows.map((item, index) => ({
        id: `ha-status:${String(item.id ?? index)}`,
        type: String(item.type ?? ''),
        node: String(item.node ?? ''),
        status: String(item.status ?? ''),
        state: String(item.state ?? ''),
        quorate: item.quorate === undefined ? '' : String(item.quorate),
      }))}
    />
  )
}

function HaManagerPanel({ data, onSelect }: { data: HomelabData; onSelect: (id: string) => void }) {
  const resources = data.proxmox.ha_resources ?? []
  const groups = data.proxmox.ha_groups ?? []
  const status = (data.proxmox.ha_status ?? []) as Array<Record<string, unknown>>
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="HA Resources" value={String(resources.length)} sub={`${resources.filter(item => item.state === 'started').length} started`} />
        <PveMetric label="Groups" value={String(groups.length)} />
        <PveMetric label="Manager Rows" value={String(status.length)} />
        <PveMetric label="Warnings" value={String(status.filter(item => String(item.status ?? item.state ?? '').toLowerCase().includes('error')).length)} />
      </SummaryLayout>
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        <PvePanel title="HA Resources">
          <HaGrid resources={resources} onSelect={onSelect} />
        </PvePanel>
        <PvePanel title="HA Groups">
          <HaGroupGrid groups={groups} />
        </PvePanel>
        <PvePanel title="CRM / LRM Status">
          <HaStatusGrid rows={status} />
        </PvePanel>
      </div>
    </div>
  )
}

function formatUnixExpiry(value: number | undefined): string {
  if (!value) return 'never'
  return new Date(value * 1000).toLocaleDateString()
}

function ProxmoxPermissionsPanel({ permissions, tab = 'Summary' }: { permissions?: ProxmoxPermissionsInfo; tab?: string }) {
  const users = permissions?.users ?? []
  const groups = permissions?.groups ?? []
  const roles = permissions?.roles ?? []
  const acl = permissions?.acl ?? []
  const realms = permissions?.realms ?? []
  const tokens = permissions?.tokens ?? []

  if (tab === 'Users') {
    return (
      <PveGrid
        columns={[{ key: 'userid', label: 'User' }, { key: 'enabled', label: 'Enabled', width: '90px' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'groups', label: 'Groups' }, { key: 'expire', label: 'Expires', width: '110px' }, { key: 'comment', label: 'Comment' }]}
        rows={users.map(item => ({
          id: `permission-user:${item.userid}`,
          userid: item.userid,
          enabled: item.enabled ? 'yes' : 'no',
          name: [item.firstname, item.lastname].filter(Boolean).join(' '),
          email: item.email,
          groups: item.groups,
          expire: formatUnixExpiry(item.expire),
          comment: item.comment,
        }))}
      />
    )
  }
  if (tab === 'Groups') {
    return (
      <PveGrid
        columns={[{ key: 'groupid', label: 'Group' }, { key: 'users', label: 'Users' }, { key: 'comment', label: 'Comment' }]}
        rows={groups.map(item => ({ id: `permission-group:${item.groupid}`, groupid: item.groupid, users: item.users, comment: item.comment }))}
      />
    )
  }
  if (tab === 'API Tokens') {
    return (
      <PveGrid
        columns={[{ key: 'userid', label: 'User' }, { key: 'tokenid', label: 'Token' }, { key: 'privsep', label: 'Privilege separation', width: '150px' }, { key: 'expire', label: 'Expires', width: '110px' }, { key: 'comment', label: 'Comment' }]}
        rows={tokens.map(item => ({
          id: `permission-token:${item.userid}:${item.tokenid}`,
          userid: item.userid,
          tokenid: item.tokenid,
          privsep: item.privsep ? 'yes' : 'no',
          expire: formatUnixExpiry(item.expire),
          comment: item.comment,
        }))}
      />
    )
  }
  if (tab === 'Roles') {
    return (
      <PveGrid
        columns={[{ key: 'roleid', label: 'Role' }, { key: 'special', label: 'Special', width: '90px' }, { key: 'privs', label: 'Privileges' }]}
        rows={roles.map(item => ({ id: `permission-role:${item.roleid}`, roleid: item.roleid, special: item.special ? 'yes' : 'no', privs: item.privs }))}
      />
    )
  }
  if (tab === 'ACL') {
    return (
      <PveGrid
        columns={[{ key: 'path', label: 'Path' }, { key: 'ugid', label: 'User/Group/Token' }, { key: 'roleid', label: 'Role' }, { key: 'type', label: 'Type', width: '90px' }, { key: 'propagate', label: 'Propagate', width: '90px' }]}
        rows={acl.map((item, index) => ({
          id: `permission-acl:${index}:${item.path}:${item.ugid}:${item.roleid}`,
          path: item.path,
          ugid: item.ugid,
          roleid: item.roleid,
          type: item.acl_type,
          propagate: item.propagate ? 'yes' : 'no',
        }))}
      />
    )
  }
  if (tab === 'Realms') {
    return (
      <PveGrid
        columns={[{ key: 'realm', label: 'Realm' }, { key: 'type', label: 'Type' }, { key: 'defaultRealm', label: 'Default', width: '90px' }, { key: 'tfa', label: 'TFA' }, { key: 'comment', label: 'Comment' }]}
        rows={realms.map(item => ({
          id: `permission-realm:${item.realm}`,
          realm: item.realm,
          type: item.realm_type,
          defaultRealm: item.default_realm ? 'yes' : 'no',
          tfa: item.tfa,
          comment: item.comment,
        }))}
      />
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Users" value={String(users.length)} sub={`${users.filter(item => item.enabled).length} enabled`} />
        <PveMetric label="Groups" value={String(groups.length)} />
        <PveMetric label="API Tokens" value={String(tokens.length)} sub={`${tokens.filter(item => item.privsep).length} privsep`} />
        <PveMetric label="ACL Entries" value={String(acl.length)} />
        <PveMetric label="Roles" value={String(roles.length)} />
        <PveMetric label="Realms" value={String(realms.length)} sub={realms.find(item => item.default_realm)?.realm ?? ''} />
      </SummaryLayout>
      <div style={{ padding: 10 }}>
        <PvePanel title="ACL">
          <ProxmoxPermissionsPanel permissions={permissions} tab="ACL" />
        </PvePanel>
      </div>
    </div>
  )
}

function ServiceGrid({ services, onSelect }: { services: ProxmoxServiceInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'name', label: 'Service' }, { key: 'node', label: 'Node' }, { key: 'state', label: 'State' }, { key: 'description', label: 'Description' }]}
      rows={services.map(item => ({
        id: `service:${item.node}:${item.id}`,
        name: item.name || item.id,
        node: item.node,
        state: <StatusPill status={item.state} />,
        description: item.description,
      }))}
    />
  )
}

function TaskGrid({ tasks, onSelect }: { tasks: ProxmoxTaskInfo[]; onSelect: (id: string) => void }) {
  return (
    <PveGrid
      onSelect={onSelect}
      columns={[{ key: 'status', label: 'Status', width: '90px' }, { key: 'node', label: 'Node', width: '80px' }, { key: 'type', label: 'Task' }, { key: 'idText', label: 'ID' }, { key: 'user', label: 'User' }, { key: 'start', label: 'Start Time' }, { key: 'end', label: 'End Time' }]}
      rows={tasks.map(task => ({
        id: `task:${task.upid || `${task.node}:${task.id}:${task.starttime}`}`,
        status: <StatusPill status={task.status || (task.endtime ? 'OK' : 'running')} />,
        node: task.node,
        type: task.task_type,
        idText: task.id,
        user: task.user,
        start: task.starttime ? new Date(task.starttime * 1000).toLocaleString() : '',
        end: task.endtime ? new Date(task.endtime * 1000).toLocaleString() : '',
      }))}
    />
  )
}

function NetworkGrid({ guests }: { guests: VMInfo[] }) {
  const rows = guests.flatMap(vm => (vm.networks ?? []).map(item => ({
    id: `${vm.vmid}:${item.key}`,
    guest: `${vm.vmid ?? '-'} ${vm.name}`,
    device: item.key,
    bridge: item.bridge ?? '',
    model: item.model ?? '',
    config: item.value,
  })))
  return <PveGrid columns={[{ key: 'guest', label: 'Guest' }, { key: 'device', label: 'Device' }, { key: 'bridge', label: 'Bridge' }, { key: 'model', label: 'Model' }, { key: 'config', label: 'Config' }]} rows={rows} />
}

function NodeNetworkGrid({ data, node }: { data: HomelabData; node: NodeInfo }) {
  const rows = (data.proxmox.node_networks ?? [])
    .filter(item => nodeKey(item.node) === nodeKey(node.name))
    .map(item => ({
      id: `${item.node}:${item.iface}`,
      iface: item.iface,
      type: item.type,
      method: item.method || item.method6,
      cidr: item.cidr || item.address,
      gateway: item.gateway,
      bridge_ports: item.bridge_ports,
      active: <StatusPill status={item.active ? 'active' : item.autostart ? 'autostart' : 'inactive'} />,
      comments: item.comments,
    }))
  return <PveGrid columns={[{ key: 'iface', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'method', label: 'Method' }, { key: 'cidr', label: 'CIDR / Address' }, { key: 'gateway', label: 'Gateway' }, { key: 'bridge_ports', label: 'Bridge Ports' }, { key: 'active', label: 'State' }, { key: 'comments', label: 'Comment' }]} rows={rows} />
}

function NodeDnsPanel({ data, node }: { data: HomelabData; node: NodeInfo }) {
  const dns = (data.proxmox.node_dns ?? []).find(item => nodeKey(item.node) === nodeKey(node.name))
  return (
    <PveGrid
      columns={[{ key: 'name', label: 'Field' }, { key: 'value', label: 'Value' }]}
      rows={[
        { id: 'search', name: 'Search domain', value: dns?.search ?? '' },
        { id: 'dns1', name: 'DNS server 1', value: dns?.dns1 ?? '' },
        { id: 'dns2', name: 'DNS server 2', value: dns?.dns2 ?? '' },
        { id: 'dns3', name: 'DNS server 3', value: dns?.dns3 ?? '' },
      ]}
    />
  )
}

function NodeTimePanel({ data, node }: { data: HomelabData; node: NodeInfo }) {
  const timeInfo = (data.proxmox.node_time ?? []).find(item => nodeKey(item.node) === nodeKey(node.name))
  return (
    <PveGrid
      columns={[{ key: 'name', label: 'Field' }, { key: 'value', label: 'Value' }]}
      rows={[
        { id: 'timezone', name: 'Time zone', value: timeInfo?.timezone ?? '' },
        { id: 'localtime', name: 'Local time', value: timeInfo?.localtime ? new Date(timeInfo.localtime * 1000).toLocaleString() : '' },
        { id: 'time', name: 'Unix time', value: timeInfo?.time ? new Date(timeInfo.time * 1000).toLocaleString() : '' },
      ]}
    />
  )
}

function NodeHostsPanel({ data, node }: { data: HomelabData; node: NodeInfo }) {
  const hosts = (data.proxmox.node_hosts ?? []).find(item => nodeKey(item.node) === nodeKey(node.name))
  return (
    <pre style={{ margin: 0, padding: 10, minHeight: '100%', overflow: 'auto', background: panelDark, color: text, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
      {hosts?.content || 'No hosts content returned by Proxmox.'}
    </pre>
  )
}

function NodeRepositoryGrid({ data, node }: { data: HomelabData; node: NodeInfo }) {
  const rows = (data.proxmox.node_repositories ?? [])
    .filter(item => nodeKey(item.node) === nodeKey(node.name))
    .map((item, index) => ({
      id: `${item.node}:${item.path}:${index}`,
      status: <StatusPill status={item.status || (item.enabled ? 'enabled' : 'disabled')} />,
      path: item.path,
      file_type: item.file_type,
      uri: item.uri,
      suite: item.suite,
      component: item.component,
      comment: item.comment,
    }))
  return <PveGrid columns={[{ key: 'status', label: 'Status', width: '90px' }, { key: 'path', label: 'File' }, { key: 'file_type', label: 'Type', width: '80px' }, { key: 'uri', label: 'URI' }, { key: 'suite', label: 'Suite' }, { key: 'component', label: 'Component' }, { key: 'comment', label: 'Comment' }]} rows={rows} />
}

function FirewallGrid({ guests }: { guests: VMInfo[] }) {
  const rows = guests.flatMap(vm => (vm.firewall_rules ?? []).map((rule, index) => ({
    id: `${vm.vmid}:${rule.pos ?? index}`,
    guest: `${vm.vmid ?? '-'} ${vm.name}`,
    pos: rule.pos ?? index,
    type: rule.type ?? '',
    action: rule.action ?? '',
    proto: rule.proto ?? '',
    dport: rule.dport ?? '',
    comment: rule.comment ?? '',
  })))
  return <PveGrid columns={[{ key: 'guest', label: 'Guest' }, { key: 'pos', label: 'Pos', width: '60px' }, { key: 'type', label: 'Dir' }, { key: 'action', label: 'Action' }, { key: 'proto', label: 'Proto' }, { key: 'dport', label: 'D.Port' }, { key: 'comment', label: 'Comment' }]} rows={rows} />
}

function firewallRuleRows(rules: Array<Record<string, unknown>>, idPrefix: string) {
  return rules.map((rule, index) => ({
    id: `${idPrefix}:${String(rule.pos ?? index)}`,
    pos: String(rule.pos ?? index),
    enabled: rule.enable === false || rule.enable === 0 ? 'no' : 'yes',
    type: String(rule.type ?? ''),
    action: String(rule.action ?? ''),
    proto: String(rule.proto ?? ''),
    source: String(rule.source ?? ''),
    dest: String(rule.dest ?? ''),
    dport: String(rule.dport ?? ''),
    comment: String(rule.comment ?? ''),
  }))
}

function DatacenterFirewallPanel({ firewall, tab = 'Summary' }: { firewall?: ProxmoxFirewallInfo; tab?: string }) {
  const options = firewall?.options ?? {}
  const rules = firewall?.rules ?? []
  const aliases = firewall?.aliases ?? []
  const ipsets = firewall?.ipsets ?? []
  const groups = firewall?.groups ?? []

  if (tab === 'Rules') {
    return <PveGrid columns={[{ key: 'pos', label: 'Pos', width: '60px' }, { key: 'enabled', label: 'Enabled', width: '80px' }, { key: 'type', label: 'Dir', width: '70px' }, { key: 'action', label: 'Action' }, { key: 'proto', label: 'Proto' }, { key: 'source', label: 'Source' }, { key: 'dest', label: 'Dest' }, { key: 'dport', label: 'D.Port' }, { key: 'comment', label: 'Comment' }]} rows={firewallRuleRows(rules as Array<Record<string, unknown>>, 'dc-firewall-rule')} />
  }
  if (tab === 'Options') {
    return (
      <PveGrid
        columns={[{ key: 'name', label: 'Option' }, { key: 'value', label: 'Value' }]}
        rows={Object.entries(options).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => ({ id: `dc-firewall-option:${name}`, name, value: String(value ?? '') }))}
      />
    )
  }
  if (tab === 'Aliases') {
    return <PveGrid columns={[{ key: 'name', label: 'Alias' }, { key: 'cidr', label: 'CIDR' }, { key: 'comment', label: 'Comment' }]} rows={aliases.map(item => ({ id: `dc-firewall-alias:${item.name}`, name: item.name, cidr: item.cidr, comment: item.comment }))} />
  }
  if (tab === 'IP Sets') {
    return <PveGrid columns={[{ key: 'name', label: 'IP Set' }, { key: 'entries', label: 'Entries', width: '90px' }, { key: 'comment', label: 'Comment' }]} rows={ipsets.map(item => ({ id: `dc-firewall-ipset:${item.name}`, name: item.name, entries: item.entries?.length ?? 0, comment: item.comment }))} />
  }
  if (tab === 'Security Groups') {
    return <PveGrid columns={[{ key: 'group', label: 'Group' }, { key: 'rules', label: 'Rules', width: '90px' }, { key: 'comment', label: 'Comment' }]} rows={groups.map(item => ({ id: `dc-firewall-group:${item.group}`, group: item.group, rules: item.rules?.length ?? 0, comment: item.comment }))} />
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: '100%' }}>
      <SummaryLayout>
        <PveMetric label="Firewall" value={String(options.enable ?? 'unknown')} sub="datacenter option" />
        <PveMetric label="Rules" value={String(rules.length)} />
        <PveMetric label="Aliases" value={String(aliases.length)} />
        <PveMetric label="IP Sets" value={String(ipsets.length)} sub={`${ipsets.reduce((sum, item) => sum + (item.entries?.length ?? 0), 0)} entries`} />
        <PveMetric label="Security Groups" value={String(groups.length)} sub={`${groups.reduce((sum, item) => sum + (item.rules?.length ?? 0), 0)} rules`} />
      </SummaryLayout>
      <div style={{ padding: 10 }}>
        <PvePanel title="Datacenter Rules">
          <DatacenterFirewallPanel firewall={firewall} tab="Rules" />
        </PvePanel>
      </div>
    </div>
  )
}

function Placeholder({ title, text: body }: { title: string; text: string }) {
  return (
    <div style={{ padding: 18, color: text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
        <Warning size={16} color={pveOrange} />
        {title}
      </div>
      <p style={{ margin: 0, color: muted, fontSize: 12, lineHeight: 1.5, maxWidth: 720 }}>{body}</p>
    </div>
  )
}

function ProxmoxBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 7 : 9, minWidth: compact ? 0 : 220 }}>
      <div aria-hidden="true" style={{ position: 'relative', width: 28, height: 24, flex: '0 0 auto' }}>
        <span style={{ position: 'absolute', left: 2, top: 4, width: 16, height: 16, background: '#e57000', transform: 'skewX(-18deg)', borderRadius: 1 }} />
        <span style={{ position: 'absolute', left: 11, top: 4, width: 16, height: 16, background: '#f29f05', transform: 'skewX(-18deg)', borderRadius: 1, mixBlendMode: 'multiply' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 900, lineHeight: 1, color: text, letterSpacing: 0 }}>
          Proxmox VE
        </div>
        {!compact ? <div style={{ fontSize: 10, color: muted, lineHeight: 1.1 }}>Virtual Environment</div> : null}
      </div>
    </div>
  )
}

function ConsoleFrame({
  title,
  status,
  error,
  onReconnect,
  children,
  actions,
}: {
  title: string
  status: ProxmoxSessionStatus
  error: string | null
  onReconnect: () => void
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(frameRef.current && document.fullscreenElement === frameRef.current))
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await frameRef.current?.requestFullscreen()
    } catch (err) {
      // Fullscreen can be denied by browser policy; the console itself should keep running.
      console.warn('Proxmox console fullscreen failed', err)
    }
  }

  return (
    <div ref={frameRef} style={{ minHeight: '100%', display: 'grid', gridTemplateRows: '36px minmax(0, 1fr)', background: '#05070a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', background: panelHeader, borderBottom: `1px solid ${border}`, minWidth: 0 }}>
        <Terminal size={14} color={status === 'connected' ? ok : warning} />
        <strong style={{ fontSize: 12, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        <span style={{ fontSize: 11, color: status === 'error' ? danger : muted }}>{error ?? status}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {actions}
          <button type="button" onClick={toggleFullscreen} title="Fullscreen" style={{ ...toolbarButtonStyle, height: 24 }}>
            <CornersOut size={12} />
            {fullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          <button type="button" onClick={onReconnect} style={{ ...toolbarButtonStyle, height: 24 }}>
            <ArrowClockwise size={12} />
            Reconnect
          </button>
        </div>
      </div>
      <div style={{ minHeight: 0, minWidth: 0, position: 'relative' }}>{children}</div>
    </div>
  )
}

function ProxmoxNoVncConsole({ data, vm }: { data: HomelabData; vm: VMInfo }) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<NoVncRfb | null>(null)
  const inferredNode = String(vm.node ?? '').trim() || (data.proxmox.nodes.length === 1 ? data.proxmox.nodes[0]?.name?.trim() : '')
  const [selectedNode, setSelectedNode] = useState(inferredNode ?? '')
  const [status, setStatus] = useState<ProxmoxSessionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const [scaleViewport, setScaleViewport] = useState(true)
  const node = selectedNode.trim()

  useEffect(() => {
    setSelectedNode(inferredNode ?? '')
  }, [inferredNode, vm.vmid])

  useEffect(() => {
    let cancelled = false
    const target = targetRef.current
    if (!target || !node || !vm.vmid) {
      setStatus('error')
      setError(vm.vmid ? 'Select the Proxmox node that hosts this guest.' : 'Console requires a VMID.')
      return
    }
    if (String(vm.status ?? '').toLowerCase() === 'stopped') {
      target.innerHTML = ''
      setStatus('error')
      setError('Guest is stopped. Start it from Summary before opening the console.')
      return
    }
    target.innerHTML = ''
    setStatus('connecting')
    setError(null)

    async function connect() {
      let handshakeTimer: number | undefined
      try {
        const response = await api.post<ApiSuccess<ProxmoxSessionResponse> | ProxmoxSessionResponse>(
          '/api/homelab/proxmox/console/session',
          { node, kind: vm.kind === 'lxc' ? 'lxc' : 'qemu', vmid: vm.vmid },
        )
        if (cancelled || !target) return
        const session = unwrapApiData(response)
        const module = await import('@novnc/novnc')
        if (cancelled || !target) return
        const RFB = module.default as NoVncCtor
        const rfb = new RFB(target, proxmoxWsUrl(session.websocketUrl), {
          credentials: { password: session.password },
        })
        handshakeTimer = window.setTimeout(() => {
          if (cancelled) return
          setStatus('error')
          setError('Console websocket did not complete the RFB handshake within 10 seconds.')
          rfb.disconnect()
        }, 10000)
        rfb.scaleViewport = scaleViewport
        rfb.resizeSession = true
        rfb.viewOnly = false
        rfb.addEventListener?.('connect', () => {
          if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer)
          setStatus('connected')
          setError(null)
        })
        rfb.addEventListener?.('disconnect', () => {
          if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer)
          if (!cancelled) setStatus(previous => previous === 'error' ? 'error' : 'closed')
        })
        rfb.addEventListener?.('securityfailure', event => {
          if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer)
          setStatus('error')
          setError(event instanceof CustomEvent ? String(event.detail?.reason ?? 'Console security handshake failed.') : 'Console security handshake failed.')
        })
        rfbRef.current = rfb
      } catch (err) {
        if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer)
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void connect()
    return () => {
      cancelled = true
      rfbRef.current?.disconnect()
      rfbRef.current = null
    }
  }, [node, vm.kind, vm.status, vm.vmid, reconnectKey])

  useEffect(() => {
    if (rfbRef.current) rfbRef.current.scaleViewport = scaleViewport
  }, [scaleViewport])

  const pasteClipboardToConsole = async () => {
    try {
      const value = await navigator.clipboard?.readText?.()
      if (!value) return
      rfbRef.current?.clipboardPasteFrom?.(value)
      rfbRef.current?.focus?.()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? `Clipboard paste failed: ${err.message}` : 'Clipboard paste failed.')
    }
  }

  const focusConsoleKeyboard = () => {
    rfbRef.current?.focus?.()
    targetRef.current?.focus()
  }

  return (
    <ConsoleFrame
      title={`${vm.vmid ?? '-'} ${vm.name} console`}
      status={status}
      error={error}
      onReconnect={() => setReconnectKey(key => key + 1)}
      actions={(
        <>
          {!String(vm.node ?? '').trim() && data.proxmox.nodes.length > 1 ? (
            <select
              aria-label="Console node"
              value={selectedNode}
              onChange={event => setSelectedNode(event.currentTarget.value)}
              style={{ ...inputStyle, height: 24, width: 130 }}
            >
              <option value="">Select node</option>
              {data.proxmox.nodes.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          ) : null}
          <button type="button" onClick={() => setScaleViewport(value => !value)} style={{ ...toolbarButtonStyle, height: 24 }}>
            {scaleViewport ? 'Actual size' : 'Scale'}
          </button>
          <button type="button" onClick={pasteClipboardToConsole} title="Paste clipboard to console" style={{ ...toolbarButtonStyle, height: 24 }}>
            <ClipboardText size={12} />
            Paste
          </button>
          <button type="button" onClick={focusConsoleKeyboard} title="Capture keyboard focus" style={{ ...toolbarButtonStyle, height: 24 }}>
            <Keyboard size={12} />
            Focus
          </button>
          <button type="button" onClick={() => rfbRef.current?.sendCtrlAltDel?.()} style={{ ...toolbarButtonStyle, height: 24 }}>
            Ctrl-Alt-Del
          </button>
        </>
      )}
    >
      <div ref={targetRef} tabIndex={0} style={{ position: 'absolute', inset: 0, background: '#05070a', outline: 'none' }} />
    </ConsoleFrame>
  )
}

function ProxmoxShellTerminal({ node }: { node: NodeInfo }) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const terminalControlsRef = useRef<{
    clear: () => void
    copySelection: () => string
    focus: () => void
    paste: (value: string) => void
  } | null>(null)
  const [status, setStatus] = useState<ProxmoxSessionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined
    const target = targetRef.current
    if (!target || !node.name) {
      setStatus('error')
      setError('Shell requires a Proxmox node.')
      return
    }
    target.innerHTML = ''
    setStatus('connecting')
    setError(null)

    async function connect() {
      try {
        const [{ Terminal: XtermTerminal }, { FitAddon }, { WebLinksAddon }, response] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
          api.post<ApiSuccess<ProxmoxSessionResponse> | ProxmoxSessionResponse>('/api/homelab/proxmox/shell/session', { node: node.name }),
        ])
        if (cancelled || !target) return
        const session = unwrapApiData(response)
        const term = new XtermTerminal({
          cursorBlink: true,
          convertEol: true,
          fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, monospace)',
          fontSize: 13,
          theme: { background: '#05070a', foreground: '#d6deeb', cursor: '#f29f05' },
        })
        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(new WebLinksAddon())
        term.open(target)
        fitAddon.fit()
        terminalControlsRef.current = {
          clear: () => term.clear(),
          copySelection: () => term.getSelection(),
          focus: () => term.focus(),
          paste: value => term.paste(value),
        }
        const ws = new WebSocket(proxmoxWsUrl(session.websocketUrl))
        socketRef.current = ws
        let shellReady = false
        let pingTimer: number | undefined

        const resizeObserver = new ResizeObserver(() => {
          try {
            fitAddon.fit()
          } catch {
            // xterm fit can fail during unmount; ignore.
          }
        })
        resizeObserver.observe(target)
        const dataDisposable = term.onData(data => {
          if (shellReady && ws.readyState === WebSocket.OPEN) ws.send(proxmoxTermFrame(data))
        })
        const resizeDisposable = term.onResize(({ cols, rows }) => {
          if (shellReady && ws.readyState === WebSocket.OPEN) ws.send(proxmoxTermResizeFrame(cols, rows))
        })
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          setStatus('connecting')
        }
        ws.onmessage = event => {
          const writeShellPayload = (payload: string | Uint8Array) => {
            if (!shellReady) {
              const textPayload = typeof payload === 'string' ? payload : new TextDecoder().decode(payload)
              if (!textPayload.startsWith('OK')) {
                setStatus('error')
                setError(textPayload.trim() || 'Proxmox shell authentication failed.')
                ws.close()
                return
              }
              shellReady = true
              setStatus('connected')
              setError(null)
              term.focus()
              if (ws.readyState === WebSocket.OPEN) ws.send(proxmoxTermResizeFrame(term.cols, term.rows))
              pingTimer = window.setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send('2')
              }, 30000)
              const remainder = textPayload.slice(2)
              if (remainder) term.write(remainder)
              return
            }
            term.write(payload)
          }

          if (event.data instanceof ArrayBuffer) {
            writeShellPayload(new Uint8Array(event.data))
          } else if (event.data instanceof Blob) {
            void event.data.arrayBuffer().then(buffer => writeShellPayload(new Uint8Array(buffer)))
          } else {
            writeShellPayload(String(event.data))
          }
        }
        ws.onerror = () => {
          setStatus('error')
          setError('Shell websocket failed.')
        }
        ws.onclose = () => {
          if (!cancelled) setStatus(previous => previous === 'error' ? 'error' : 'closed')
        }
        cleanup = () => {
          if (pingTimer !== undefined) window.clearInterval(pingTimer)
          dataDisposable.dispose()
          resizeDisposable.dispose()
          resizeObserver.disconnect()
          ws.close()
          term.dispose()
          terminalControlsRef.current = null
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void connect()
    return () => {
      cancelled = true
      cleanup?.()
      socketRef.current?.close()
      socketRef.current = null
      terminalControlsRef.current = null
    }
  }, [node.name, reconnectKey])

  const pasteClipboardToShell = async () => {
    try {
      const value = await navigator.clipboard?.readText?.()
      if (!value) return
      terminalControlsRef.current?.paste(value)
      terminalControlsRef.current?.focus()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? `Clipboard paste failed: ${err.message}` : 'Clipboard paste failed.')
    }
  }

  const copyShellSelection = async () => {
    try {
      const value = terminalControlsRef.current?.copySelection() ?? ''
      if (!value) return
      await navigator.clipboard?.writeText?.(value)
      terminalControlsRef.current?.focus()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? `Copy failed: ${err.message}` : 'Copy failed.')
    }
  }

  const clearShell = () => {
    terminalControlsRef.current?.clear()
    terminalControlsRef.current?.focus()
  }

  return (
    <ConsoleFrame
      title={`${node.name} shell`}
      status={status}
      error={error}
      onReconnect={() => setReconnectKey(key => key + 1)}
      actions={(
        <>
          <button type="button" onClick={pasteClipboardToShell} title="Paste clipboard to shell" style={{ ...toolbarButtonStyle, height: 24 }}>
            <ClipboardText size={12} />
            Paste
          </button>
          <button type="button" onClick={copyShellSelection} title="Copy terminal selection" style={{ ...toolbarButtonStyle, height: 24 }}>
            Copy
          </button>
          <button type="button" onClick={clearShell} title="Clear terminal buffer" style={{ ...toolbarButtonStyle, height: 24 }}>
            <Eraser size={12} />
            Clear
          </button>
        </>
      )}
    >
      <div ref={targetRef} style={{ position: 'absolute', inset: 0, padding: 8 }} />
    </ConsoleFrame>
  )
}

function StorageContent({ resource, tab, data, onSelect }: { resource: Extract<PveResource, { kind: 'storage' | 'backup' | 'ha' | 'service' | 'task' | 'firewall' | 'permissions' }>; tab: string; data: HomelabData; onSelect: (id: string) => void }) {
  if (resource.kind === 'storage') {
    const item = resource.item
    const storageContent = (data.proxmox.storage_content ?? []).filter(entry => entry.storage === item.name && nodeKey(entry.node) === nodeKey(item.node))
    const backups = (data.proxmox.backups ?? []).filter(backup => backup.storage === item.name && backup.node === item.node)
    if (tab === 'Content') return <StorageContentGrid items={storageContent} />
    if (tab === 'Backups') return <BackupGrid backups={backups} onSelect={onSelect} />
    return (
      <SummaryLayout>
        <PveMetric label="Storage" value={item.name} sub={`${item.storage_type} on ${item.node}`} />
        <PveMetric label="Status" value={item.active ? 'active' : item.enabled ? 'enabled' : 'disabled'} sub={item.shared ? 'shared' : 'local'} tone={item.active ? 'green' : 'red'} />
        <PveMetric label="Used" value={item.total ? `${Math.round((item.used / item.total) * 100)}%` : '0%'} sub={`${formatBytes(item.used)} / ${formatBytes(item.total)}`} />
        <PveMetric label="Content" value={item.content || '-'} />
      </SummaryLayout>
    )
  }
  if (resource.kind === 'backup') {
    const item = resource.item
    return (
      <SummaryLayout>
        <PveMetric label="Archive" value={item.name} sub={item.volid} />
        <PveMetric label="Guest" value={String(item.vmid ?? '-')} sub={item.kind} />
        <PveMetric label="Storage" value={item.storage} sub={item.node} />
        <PveMetric label="Size" value={formatBytes(item.size)} sub={item.protected ? 'protected' : 'unprotected'} />
      </SummaryLayout>
    )
  }
  if (resource.kind === 'ha') {
    const item = resource.item
    return <PveGrid columns={[{ key: 'name', label: 'Field' }, { key: 'value', label: 'Value' }]} rows={[{ id: 'sid', name: 'Resource', value: item.sid }, { id: 'state', name: 'State', value: item.state }, { id: 'type', name: 'Type', value: item.resource_type }, { id: 'group', name: 'Group', value: item.group }, { id: 'comment', name: 'Comment', value: item.comment }]} />
  }
  if (resource.kind === 'service') {
    const item = resource.item
    return <PveGrid columns={[{ key: 'name', label: 'Field' }, { key: 'value', label: 'Value' }]} rows={[{ id: 'service', name: 'Service', value: item.id }, { id: 'node', name: 'Node', value: item.node }, { id: 'state', name: 'State', value: item.state }, { id: 'description', name: 'Description', value: item.description }]} />
  }
  if (resource.kind === 'task') return <TaskDetailContent task={resource.item} tab={tab} onSelect={onSelect} />
  if (resource.kind === 'firewall') return <DatacenterFirewallPanel firewall={data.proxmox.firewall} tab={tab} />
  return <ProxmoxPermissionsPanel permissions={data.proxmox.permissions} tab={tab} />
}

function TaskDetailContent({ task, tab, onSelect }: { task: ProxmoxTaskInfo; tab: string; onSelect: (id: string) => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [output, setOutput] = useState('')

  useEffect(() => {
    if (tab !== 'Log' && tab !== 'Status') {
      setStatus('idle')
      setOutput('')
      return
    }
    let cancelled = false
    const action = tab === 'Log' ? 'task-log' : 'task-status'
    setStatus('loading')
    setOutput('')

    async function fetchTaskDetail() {
      try {
        const result = await api.post<ApiSuccess<HomelabControlResult> | HomelabControlResult>('/api/homelab/control', {
          provider: 'proxmox',
          resourceType: 'task',
          resourceId: task.upid,
          action,
          args: { node: task.node, name: task.id || task.upid },
        })
        if (cancelled) return
        const data = unwrapApiData(result)
        const responsePayload = isRecord(data) && 'response' in data ? data.response : data
        setOutput(tab === 'Log' ? formatProxmoxTaskLogPayload(responsePayload) : compactJson(responsePayload))
        setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          setOutput(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    }

    void fetchTaskDetail()
    return () => {
      cancelled = true
    }
  }, [tab, task.id, task.node, task.upid])

  if (tab === 'Summary') return <TaskGrid tasks={[task]} onSelect={onSelect} />

  if (tab === 'Log' || tab === 'Status') {
    return (
      <div style={{ minHeight: '100%', display: 'grid', gridTemplateRows: '32px minmax(0, 1fr)', background: panel }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: `1px solid ${border}`, background: panelHeader }}>
          <strong style={{ fontSize: 12 }}>{tab}</strong>
          <span style={{ fontSize: 11, color: status === 'error' ? danger : muted }}>{status === 'loading' ? 'loading from Proxmox' : status}</span>
          <span style={{ fontSize: 11, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.upid}</span>
        </div>
        <pre style={{ margin: 0, padding: 10, overflow: 'auto', fontSize: 11, lineHeight: 1.45, color: status === 'error' ? danger : text, background: panelDark, whiteSpace: 'pre-wrap' }}>
          {status === 'loading' ? `Fetching task ${tab.toLowerCase()}...` : output}
        </pre>
      </div>
    )
  }

  return <TaskGrid tasks={[task]} onSelect={onSelect} />
}

function ActionModal({
  pending,
  busyAction,
  onClose,
  onPatch,
  onSubmit,
}: {
  pending: PendingAction | null
  busyAction: string | null
  onClose: () => void
  onPatch: (pending: PendingAction) => void
  onSubmit: (pending: PendingAction) => void
}) {
  if (!pending) return null
  const busy = busyAction === actionKey(pending.input)
  const fields = pending.fields ?? []
  const needsTyped = pending.danger || isDangerousAction(pending.input.action)
  const disabled =
    busy ||
    fields.some(field => field.required && !String(pending.values[field.key] ?? '').trim()) ||
    (needsTyped && pending.confirmation !== pending.target)
  const safetyItems = [
    `${pending.input.provider} / ${pending.input.resourceType}`,
    `action: ${pending.input.action}`,
    `target: ${pending.target}`,
    needsTyped ? 'typed confirmation required' : pending.confirm ? 'confirmation required' : 'preflight clean',
  ]

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--pve-modal-overlay)', zIndex: 80, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: panel, border: `1px solid ${border}`, boxShadow: 'var(--pve-shadow)', borderRadius: 'var(--pve-radius)' }}>
        <div style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: panelHeader, borderBottom: `1px solid ${border}`, padding: '0 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{pending.label} - {pending.target}</div>
          <button type="button" onClick={onClose} style={toolbarButtonStyle}>Close</button>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          <div style={{ border: `1px solid ${needsTyped ? danger : border}`, background: needsTyped ? 'var(--pve-risk-bg)' : panelDark, color: needsTyped ? 'var(--pve-risk-text)' : text, padding: 10, display: 'grid', gap: 8, borderRadius: 'var(--pve-radius)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800 }}>
              <ShieldCheck size={15} color={needsTyped ? danger : ok} />
              Safety preflight
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {safetyItems.map(item => (
                <span key={item} style={{ border: `1px solid ${border}`, background: 'var(--pve-chip-bg)', color: text, padding: '4px 7px', fontSize: 11, borderRadius: 'var(--pve-radius)' }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
          {fields.map(field => (
            <label key={field.key} style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: 10, alignItems: field.kind === 'textarea' ? 'start' : 'center', fontSize: 12, color: text }}>
              <span style={{ fontWeight: 700 }}>{field.label}</span>
              {field.kind === 'textarea' ? (
                <textarea
                  value={String(pending.values[field.key] ?? '')}
                  onChange={event => onPatch({ ...pending, values: { ...pending.values, [field.key]: event.currentTarget.value } })}
                  style={{ ...inputStyle, minHeight: 140, height: 'auto', padding: 8, resize: 'vertical' }}
                />
              ) : field.kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(pending.values[field.key])}
                  onChange={event => onPatch({ ...pending, values: { ...pending.values, [field.key]: event.currentTarget.checked } })}
                />
              ) : field.kind === 'select' ? (
                <select
                  value={String(pending.values[field.key] ?? '')}
                  onChange={event => onPatch({ ...pending, values: { ...pending.values, [field.key]: event.currentTarget.value } })}
                  style={inputStyle}
                >
                  {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  type={field.kind === 'number' ? 'number' : 'text'}
                  value={String(pending.values[field.key] ?? '')}
                  onChange={event => onPatch({ ...pending, values: { ...pending.values, [field.key]: field.kind === 'number' ? (event.currentTarget.value ? Number(event.currentTarget.value) : '') : event.currentTarget.value } })}
                  style={inputStyle}
                />
              )}
            </label>
          ))}
          {needsTyped ? (
            <label style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: 10, alignItems: 'center', fontSize: 12, color: text }}>
              <span style={{ fontWeight: 800, color: danger }}>Type target</span>
              <input
                value={pending.confirmation}
                onChange={event => onPatch({ ...pending, confirmation: event.currentTarget.value })}
                placeholder={pending.target}
                style={{ ...inputStyle, borderColor: pending.confirmation && pending.confirmation !== pending.target ? danger : border }}
              />
            </label>
          ) : pending.confirm ? (
            <div style={{ border: '1px solid var(--pve-risk-border)', background: 'var(--pve-risk-bg)', padding: 10, fontSize: 12, color: 'var(--pve-risk-text)', borderRadius: 'var(--pve-radius)' }}>
              Confirm action on {pending.target}.
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 10, borderTop: `1px solid ${border}`, background: panelDark }}>
          <button type="button" onClick={onClose} style={toolbarButtonStyle}>Cancel</button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSubmit({ ...pending, input: { ...pending.input, args: { ...(pending.input.args ?? {}), ...toArgs(pending.values) }, confirmation: needsTyped ? pending.confirmation : undefined } })}
            style={{ ...toolbarButtonStyle, background: pending.danger ? danger : pveOrange, color: 'var(--button-primary-text, #fff)', borderColor: pending.danger ? danger : pveOrange, opacity: disabled ? 0.5 : 1 }}
          >
            {busy ? 'Running...' : pending.label}
          </button>
        </div>
      </div>
    </div>
  )
}

function PveTaskLog({
  tasks,
  logEntry,
  activities,
  onSelect,
  onActivitySelect,
}: {
  tasks: ProxmoxTaskInfo[]
  logEntry: LogEntry | null
  activities: TaskActivity[]
  onSelect: (id: string) => void
  onActivitySelect: (activity: TaskActivity) => void
}) {
  const visibleActivity = logEntry ? null : activities[0] ?? null

  return (
    <section style={{ borderTop: `1px solid ${border}`, background: panel, display: 'grid', gridTemplateRows: '30px minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', alignItems: 'center', background: panelHeader, borderBottom: `1px solid ${border}`, padding: '0 8px', gap: 10 }}>
        <strong style={{ fontSize: 12 }}>Tasks</strong>
        <span style={{ fontSize: 11, color: muted }}>{tasks.length} entries</span>
        {activities.length ? <span style={{ fontSize: 11, color: muted }}>{activities.length} tracked</span> : null}
        {logEntry ? <span style={{ fontSize: 11, color: pveBlue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Latest output: {logEntry.title}</span> : null}
        {!logEntry && visibleActivity ? <span style={{ fontSize: 11, color: pveBlue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Latest tracked: {visibleActivity.title}</span> : null}
      </div>
      <div style={{ minHeight: 0, overflow: 'auto' }}>
        {logEntry ? (
          <pre style={{ margin: 0, padding: 10, fontSize: 11, lineHeight: 1.45, color: text, background: panelDark, whiteSpace: 'pre-wrap' }}>{logEntry.body}</pre>
        ) : visibleActivity ? (
          <div style={{ display: 'grid', gridTemplateColumns: '270px minmax(0, 1fr)', minHeight: '100%' }}>
            <div style={{ borderRight: `1px solid ${border}`, background: panel, overflow: 'auto' }}>
              {activities.map(activity => (
                <button
                  key={activity.upid}
                  type="button"
                  onClick={() => onActivitySelect(activity)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 8,
                    alignItems: 'center',
                    border: 0,
                    borderBottom: '1px solid var(--pve-grid-line)',
                    background: activity.upid === visibleActivity.upid ? selectedRow : panel,
                    color: text,
                    padding: '7px 9px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                    <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.title}</strong>
                    <span style={{ fontSize: 11, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.upid}</span>
                  </span>
                  <StatusPill status={activity.status || 'running'} />
                </button>
              ))}
            </div>
            <pre style={{ margin: 0, padding: 10, fontSize: 11, lineHeight: 1.45, color: text, background: panelDark, whiteSpace: 'pre-wrap', minWidth: 0 }}>{visibleActivity.body}</pre>
          </div>
        ) : (
          <TaskGrid tasks={tasks} onSelect={onSelect} />
        )}
      </div>
    </section>
  )
}

function InfraGraphStrip({ graph }: { graph: InfraGraphSummary }) {
  const stats = [
    { label: 'nodes', value: graph.nodes },
    { label: 'guests', value: `${graph.runningGuests}/${graph.guests}` },
    { label: 'containers', value: graph.containers },
    { label: 'backups', value: `${graph.protectedBackups}/${graph.backups}` },
    { label: 'rules', value: graph.firewallRules },
    { label: 'storage max', value: `${graph.storagePressure}%`, risk: graph.storagePressure >= 85 },
    { label: 'failed tasks', value: graph.failedTasks, risk: graph.failedTasks > 0 },
  ]
  return (
    <section style={{ borderBottom: `1px solid ${border}`, background: panelDark, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 10, padding: '8px 10px', minHeight: 62 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <strong style={{ fontSize: 12, color: text, marginRight: 2 }}>Infra graph</strong>
        {stats.map(stat => (
          <span key={stat.label} style={{ border: `1px solid ${stat.risk ? danger : border}`, background: stat.risk ? 'var(--pve-risk-bg)' : 'var(--pve-chip-bg)', color: stat.risk ? danger : text, padding: '5px 8px', borderRadius: 'var(--pve-radius)', fontSize: 11, fontWeight: 700 }}>
            {stat.label}: {stat.value}
          </span>
        ))}
      </div>
      <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
        <div style={{ fontSize: 10, color: muted, fontWeight: 800, textTransform: 'uppercase' }}>Relationships</div>
        <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
          {graph.relationships.slice(0, 3).map(item => (
            <span key={item} style={{ color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${border}`, background: panel, padding: '3px 6px', borderRadius: 'var(--pve-radius)' }}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function resourceRisk(resource: PveResource, data: HomelabData): string[] {
  const risks: string[] = []
  const status = resourceStatus(resource).toLowerCase()
  if (status.includes('offline') || status.includes('error') || status.includes('fail')) risks.push(`Status is ${resourceStatus(resource)}`)
  if (resource.kind === 'qemu' || resource.kind === 'lxc') {
    const vm = resource.item
    if (!vm.snapshots?.length) risks.push('No snapshots visible')
    if (!(data.proxmox.backups ?? []).some(backup => backup.vmid === vm.vmid)) risks.push('No backup archive visible')
    if (!vm.firewall_rules?.length) risks.push('No guest firewall rules visible')
  }
  if (resource.kind === 'storage') {
    const item = resource.item
    const usage = item.total ? (item.used / item.total) * 100 : 0
    if (usage >= 85) risks.push(`Storage pressure ${Math.round(usage)}%`)
    if (!item.active) risks.push('Storage not active')
  }
  if (resource.kind === 'datacenter' && data.live?.proxmox === false) risks.push('Proxmox provider is degraded')
  return risks
}

function InfraInspector({
  data,
  resource,
  actions,
  graph,
  onAction,
  busyAction,
}: {
  data: HomelabData
  resource: PveResource
  actions: PveAction[]
  graph: InfraGraphSummary
  onAction: (action: PveAction) => void
  busyAction: string | null
}) {
  const risks = resourceRisk(resource, data)
  const guestBackups = resource.kind === 'qemu' || resource.kind === 'lxc'
    ? (data.proxmox.backups ?? []).filter(backup => backup.vmid === resource.item.vmid)
    : []
  const destructiveActions = actions.filter(action => action.danger || isDangerousAction(action.input.action)).length
  const runbooks = [
    actions.find(action => action.input.action === 'backup'),
    actions.find(action => action.input.action === 'snapshot'),
    actions.find(action => action.input.action === 'console' || action.input.action === 'shell'),
  ].filter((action): action is PveAction => Boolean(action))

  return (
    <aside style={{ borderLeft: `1px solid ${border}`, background: panelDark, minWidth: 0, overflow: 'auto', display: 'grid', alignContent: 'start' }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${border}`, background: panelHeader }}>
        <div style={{ fontSize: 10, color: muted, fontWeight: 800, textTransform: 'uppercase' }}>Inspector</div>
        <div style={{ marginTop: 4, fontSize: 14, color: text, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resourceTitle(resource)}</div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: muted }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(resourceStatus(resource)) }} />
          {pveResourceLabel(resource.kind)} · {resourceStatus(resource)}
        </div>
      </div>
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 800, textTransform: 'uppercase' }}>Safety</div>
          {risks.length ? risks.map(item => (
            <div key={item} style={{ border: `1px solid ${danger}`, background: 'var(--pve-risk-bg)', color: text, padding: 8, fontSize: 12, borderRadius: 'var(--pve-radius)' }}>
              {item}
            </div>
          )) : (
            <div style={{ border: `1px solid ${border}`, background: panel, color: muted, padding: 8, fontSize: 12, borderRadius: 'var(--pve-radius)' }}>
              No immediate risk flags from visible inventory.
            </div>
          )}
        </div>
        <PveGrid
          columns={[{ key: 'name', label: 'Signal' }, { key: 'value', label: 'Value', width: '84px' }]}
          rows={[
            { id: 'actions', name: 'Actions', value: actions.length },
            { id: 'danger', name: 'Destructive', value: destructiveActions },
            { id: 'backups', name: 'Backups', value: resource.kind === 'qemu' || resource.kind === 'lxc' ? guestBackups.length : graph.backups },
            { id: 'tasks', name: 'Failed tasks', value: graph.failedTasks },
          ]}
        />
        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 800, textTransform: 'uppercase' }}>Runbooks</div>
          {runbooks.length ? runbooks.map(action => (
            <PveButton key={action.input.action} action={action} busyAction={busyAction} onAction={onAction} />
          )) : (
            <span style={{ color: muted, fontSize: 12 }}>No runbook entry points for this resource.</span>
          )}
        </div>
      </div>
    </aside>
  )
}

function PveContent({
  data,
  resource,
  activeTab,
  actions,
  busyAction,
  onAction,
  onSelect,
}: {
  data: HomelabData
  resource: PveResource
  activeTab: string
  actions: PveAction[]
  busyAction: string | null
  onAction: (action: PveAction) => void
  onSelect: (id: string) => void
}) {
  return (
    <main style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minWidth: 0, minHeight: 0, background: panel }}>
      <div style={{ borderBottom: `1px solid ${border}`, background: panelHeader, padding: '7px 8px', display: 'grid', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <strong style={{ fontSize: 14, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resourceTitle(resource)}</strong>
          <span style={{ fontSize: 11, color: muted }}>{pveResourceLabel(resource.kind)}</span>
          <span style={{ fontSize: 11, color: statusColor(resourceStatus(resource)) }}>{resourceStatus(resource)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', overflow: 'hidden', paddingRight: 6, maxHeight: 62 }}>
          {actions.length ? actions.map(action => <PveButton key={`${action.label}:${action.input.action}`} action={action} busyAction={busyAction} onAction={onAction} prominent={action.primary} />) : (
            <span style={{ fontSize: 12, color: muted }}>No direct actions for this resource.</span>
          )}
        </div>
      </div>
      <div style={{ minHeight: 0, overflow: 'auto' }}>
        {resource.kind === 'datacenter' ? <DatacenterContent data={data} tab={activeTab} onSelect={onSelect} /> : null}
        {resource.kind === 'node' ? <NodeContent data={data} node={resource.item} tab={activeTab} onSelect={onSelect} /> : null}
        {resource.kind === 'qemu' || resource.kind === 'lxc' ? <GuestContent data={data} vm={resource.item} tab={activeTab} onSelect={onSelect} /> : null}
        {resource.kind === 'storage' || resource.kind === 'backup' || resource.kind === 'ha' || resource.kind === 'service' || resource.kind === 'task' || resource.kind === 'firewall' || resource.kind === 'permissions' ? (
          <StorageContent resource={resource} tab={activeTab} data={data} onSelect={onSelect} />
        ) : null}
      </div>
    </main>
  )
}

function PveSkeleton({ width = '100%', height = 28 }: { width?: string | number; height?: string | number }) {
  return (
    <div
      className="pve-loading-skeleton"
      style={{
        width,
        height,
        borderRadius: 'var(--pve-radius)',
        border: `1px solid ${border}`,
        background: 'linear-gradient(90deg, var(--pve-row) 0%, var(--pve-row-alt) 45%, var(--pve-row) 90%)',
      }}
    />
  )
}

function ProxmoxLoadingShell() {
  return (
    <div style={{ ...shellStyle, ...proxmoxThemeVars('native') }}>
      <style>
        {`
          @keyframes pve-loading-sweep {
            0% { background-position: 120% 0; opacity: .72; }
            50% { opacity: 1; }
            100% { background-position: -120% 0; opacity: .72; }
          }
          .pve-loading-skeleton {
            background-size: 220% 100% !important;
            animation: pve-loading-sweep 1.35s ease-in-out infinite;
          }
        `}
      </style>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, background: panelHeader, borderBottom: `1px solid ${border}`, padding: '7px 10px', minHeight: 42 }}>
        <ProxmoxBrand />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: muted, border: `1px solid ${border}`, background: 'var(--pve-chip-bg)', padding: '4px 8px', borderRadius: 'var(--pve-radius)' }}>
            discovering inventory
          </span>
          <PveSkeleton width={92} height={24} />
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '282px minmax(0, 1fr)', minHeight: 0 }}>
        <aside style={{ display: 'grid', gridTemplateRows: '32px minmax(0, 1fr)', minWidth: 0, borderRight: `1px solid ${border}`, background: panel }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', background: panelHeader, borderBottom: `1px solid ${border}` }}>
            <PveSkeleton width={118} height={23} />
            <PveSkeleton width={26} height={23} />
          </div>
          <div style={{ padding: 8, display: 'grid', gap: 7, alignContent: 'start' }}>
            <PveSkeleton width="74%" />
            <PveSkeleton width="88%" />
            <PveSkeleton width="82%" />
            <PveSkeleton width="66%" />
            <PveSkeleton width="91%" />
            <PveSkeleton width="70%" />
            <PveSkeleton width="84%" />
          </div>
        </aside>
        <main style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: '62px minmax(0, 1fr) 190px', background: panel }}>
          <section style={{ borderBottom: `1px solid ${border}`, background: panelDark, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: 8, padding: 10 }}>
            <PveSkeleton />
            <PveSkeleton />
            <PveSkeleton />
            <PveSkeleton />
            <PveSkeleton />
          </section>
          <section style={{ minHeight: 0, minWidth: 0, display: 'grid', gridTemplateColumns: '172px minmax(0, 1fr) 292px' }}>
            <nav style={{ background: panelDark, borderRight: `1px solid ${border}`, padding: 8, display: 'grid', gap: 7, alignContent: 'start' }}>
              <PveSkeleton />
              <PveSkeleton />
              <PveSkeleton />
              <PveSkeleton />
              <PveSkeleton />
            </nav>
            <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minWidth: 0, minHeight: 0 }}>
              <div style={{ borderBottom: `1px solid ${border}`, background: panelHeader, padding: 10, display: 'grid', gap: 8 }}>
                <PveSkeleton width="34%" height={18} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <PveSkeleton width={86} height={26} />
                  <PveSkeleton width={94} height={26} />
                  <PveSkeleton width={76} height={26} />
                </div>
              </div>
              <div style={{ padding: 10, display: 'grid', gap: 10, alignContent: 'start' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  <PveSkeleton height={86} />
                  <PveSkeleton height={86} />
                  <PveSkeleton height={86} />
                  <PveSkeleton height={86} />
                </div>
                <PveSkeleton height={34} />
                <PveSkeleton height={34} />
                <PveSkeleton height={34} />
                <PveSkeleton height={34} />
              </div>
            </div>
            <aside style={{ borderLeft: `1px solid ${border}`, background: panelDark, padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
              <PveSkeleton width="48%" height={14} />
              <PveSkeleton height={42} />
              <PveSkeleton height={72} />
              <PveSkeleton height={96} />
            </aside>
          </section>
          <section style={{ borderTop: `1px solid ${border}`, background: panel, display: 'grid', gridTemplateRows: '30px minmax(0, 1fr)' }}>
            <div style={{ background: panelHeader, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8 }}>
              <strong style={{ fontSize: 12 }}>Tasks</strong>
              <span style={{ fontSize: 11, color: muted }}>waiting for Proxmox API</span>
            </div>
            <div style={{ padding: 10, display: 'grid', gap: 8 }}>
              <PveSkeleton height={28} />
              <PveSkeleton height={28} />
              <PveSkeleton height={28} />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function EmptyProxmoxState({ loading, error, onRefresh }: { loading: boolean; error: unknown; onRefresh: () => void }) {
  if (loading) return <ProxmoxLoadingShell />

  const message = error
    ? String(error instanceof Error ? error.message : error)
    : 'Add Proxmox host, token ID, and token secret in HomeLab settings, then reload this console.'
  return (
    <div style={{ ...shellStyle, ...proxmoxThemeVars('native') }}>
      <div style={{ background: panelHeader, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8 }}>
        <ProxmoxBrand compact />
      </div>
      <div style={{ display: 'grid', placeItems: 'center', background: panel, padding: 20 }}>
        <div style={{ width: 'min(680px, 92vw)', border: `1px solid ${border}`, background: panel, padding: 18, borderRadius: 'var(--pve-radius)', display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>{loading ? 'Loading Proxmox inventory' : error ? 'Proxmox connection failed' : 'Proxmox credentials missing'}</div>
          <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>{message}</div>
          <button type="button" onClick={onRefresh} style={{ ...toolbarButtonStyle, marginTop: 12 }}>
            <ArrowClockwise size={13} />
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProxmoxConsolePage() {
  const demo = isDemoMode()
  const {
    data: response,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useTauriQuery<ApiSuccess<HomelabData> | HomelabData>(['homelab', 'proxmox-console'], '/api/homelab', {
    refetchInterval: demo ? false : 15000,
    enabled: !demo,
    placeholderData: previous => previous,
  })
  const rawData = unwrapData(response)
  const data = useMemo(() => (rawData ? normalizeHomelabData(rawData) : undefined), [rawData])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(DATACENTER_ID)
  const [activeTab, setActiveTab] = useState('Summary')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null)
  const [taskActivities, setTaskActivities] = useState<TaskActivity[]>(loadTaskActivities)
  const [viewMode, setViewModeState] = useState<PveViewMode>(loadViewMode)
  const [quickView, setQuickView] = useState<QuickView>('all')
  const activeTaskPollsRef = useRef(new Map<string, { cancelled: boolean }>())

  const resources = useMemo(() => (data ? makeResourceMap(data) : new Map<string, PveResource>()), [data])
  const selected = resources.get(selectedId) ?? resources.get(DATACENTER_ID)
  const tabs = selected ? tabsFor(selected) : ['Summary']
  const actions = selected && data ? visibleActionsFor(selected, data) : []
  const tree = useMemo(() => (data ? makeTree(data, search, quickView) : []), [data, search, quickView])
  const graph = useMemo(() => (data ? buildInfraGraphSummary(data) : null), [data])

  useEffect(() => {
    if (!selected || !tabs.includes(activeTab)) setActiveTab(tabs[0] ?? 'Summary')
  }, [selected, tabs, activeTab])

  useEffect(() => () => {
    activeTaskPollsRef.current.forEach(poll => {
      poll.cancelled = true
    })
    activeTaskPollsRef.current.clear()
  }, [])

  const upsertTaskActivity = (activity: TaskActivity) => {
    setTaskActivities(previous => {
      const next = [activity, ...previous.filter(item => item.upid !== activity.upid)].slice(0, 20)
      saveTaskActivities(next)
      return next
    })
  }

  const selectResource = (id: string) => {
    if (!resources.has(id)) return
    const next = resources.get(id)
    setSelectedId(id)
    setActiveTab(next ? tabsFor(next)[0] ?? 'Summary' : 'Summary')
    setLogEntry(null)
  }

  const setViewMode = (next: PveViewMode) => {
    setViewModeState(next)
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next)
    } catch {
      // Theme choice is non-critical when storage is unavailable.
    }
  }

  const openAction = (action: PveAction) => {
    if (action.input.action === 'console' && selected && (selected.kind === 'qemu' || selected.kind === 'lxc')) {
      setActiveTab('Console')
      setLogEntry(null)
      return
    }
    if (action.input.action === 'shell' && selected?.kind === 'node') {
      setActiveTab('Shell')
      setLogEntry(null)
      return
    }
    if (!action.fields?.length && !action.confirm && !action.danger && !isDangerousAction(action.input.action)) {
      void runAction(action.input, action.target, action.label)
      return
    }
    setPending({ ...action, values: fieldDefaults(action.fields), confirmation: '' })
  }

  const pollProxmoxTask = async (responseData: HomelabControlResult, title: string, target: string, initialBody: string) => {
    const descriptor = proxmoxTaskDescriptor(responseData)
    if (!descriptor || activeTaskPollsRef.current.has(descriptor.upid)) return
    const poll = { cancelled: false }
    activeTaskPollsRef.current.set(descriptor.upid, poll)
    let body = `${initialBody}\n\nTask polling: starting`

    try {
      for (let attempt = 1; attempt <= TASK_POLL_ATTEMPTS; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, TASK_POLL_INTERVAL_MS))
        if (poll.cancelled) return
        const result = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/control', {
          provider: 'proxmox',
          resourceType: 'task',
          resourceId: descriptor.upid,
          action: 'task-status',
          args: { node: descriptor.node, name: descriptor.upid },
        })
        if (poll.cancelled) return
        const statusData = result.data as HomelabControlResult
        const statusBlock = formatPolledTaskStatus(statusData, attempt)
        body = `${initialBody}\n\nTask polling:\n${statusBlock}`
        setLogEntry({ title: `${title} - ${target}`, body })
        upsertTaskActivity({
          title: `${title} - ${target}`,
          body,
          upid: descriptor.upid,
          node: descriptor.node,
          status: taskStatusLabel(proxmoxTaskStatusPayload(statusData)) || 'unknown',
          updatedAt: Date.now(),
        })
        if (proxmoxTaskStatusIsFinal(proxmoxTaskStatusPayload(statusData))) {
          await refetch()
          return
        }
      }
      if (!poll.cancelled) {
        const timeoutBody = `${body}\nPolling stopped after ${TASK_POLL_ATTEMPTS} checks; task may still be running.`
        setLogEntry({ title: `${title} - ${target}`, body: timeoutBody })
        upsertTaskActivity({
          title: `${title} - ${target}`,
          body: timeoutBody,
          upid: descriptor.upid,
          node: descriptor.node,
          status: 'running',
          updatedAt: Date.now(),
        })
      }
    } catch (err) {
      if (!poll.cancelled) {
        const failureBody = `${body}\nTask polling failed: ${err instanceof Error ? err.message : String(err)}`
        setLogEntry({
          title: `${title} - ${target}`,
          body: failureBody,
        })
        upsertTaskActivity({
          title: `${title} - ${target}`,
          body: failureBody,
          upid: descriptor.upid,
          node: descriptor.node,
          status: 'poll-failed',
          updatedAt: Date.now(),
        })
      }
    } finally {
      activeTaskPollsRef.current.delete(descriptor.upid)
    }
  }

  const runAction = async (input: HomelabControlInput, target: string, title: string) => {
    const key = actionKey(input)
    setBusyAction(key)
    setLogEntry(null)
    try {
      const result = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/control', input)
      const responseData = result.data as HomelabControlResult & { response?: unknown }
      const responsePayload = responseData.response ?? responseData.output ?? responseData
      const taskLog = formatTaskResultLog(responseData, input)
      if (responsePayload && typeof responsePayload === 'object' && 'url' in responsePayload) {
        window.open(String((responsePayload as { url?: string }).url), '_blank', 'noopener,noreferrer')
      } else if (taskLog) {
        const taskEntry = { title: `${title} - ${target}`, body: taskLog }
        const descriptor = proxmoxTaskDescriptor(responseData)
        setLogEntry(taskEntry)
        if (descriptor) {
          upsertTaskActivity({
            ...taskEntry,
            upid: descriptor.upid,
            node: descriptor.node,
            status: taskStatusLabel(isRecord(responseData.task) ? responseData.task.status : undefined) || 'submitted',
            updatedAt: Date.now(),
          })
        }
        void pollProxmoxTask(responseData, title, target, taskLog)
        await refetch()
      } else if (['task-log', 'task-status', 'console', 'shell'].includes(input.action) || typeof responsePayload === 'string' || input.action.includes('inspect')) {
        setLogEntry({
          title: `${title} - ${target}`,
          body: typeof responsePayload === 'string' ? responsePayload : JSON.stringify(responsePayload, null, 2),
        })
      } else {
        setLogEntry({ title: `${title} - ${target}`, body: `${input.action} submitted via ${responseData.mode ?? 'proxmox'}` })
        await refetch()
      }
    } catch (err) {
      setLogEntry({ title: `${title} failed`, body: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusyAction(null)
    }
  }

  if (!data || !selected) {
    return <EmptyProxmoxState loading={isLoading} error={error} onRefresh={() => void refetch()} />
  }

  return (
    <div style={{ ...shellStyle, ...proxmoxThemeVars(viewMode) }} data-testid="proxmox-console-shell" data-pve-mode={viewMode}>
      <PveHeader
        data={data}
        search={search}
        quickView={quickView}
        viewMode={viewMode}
        onSearch={setSearch}
        onQuickView={setQuickView}
        onViewMode={setViewMode}
        actions={visibleActionsFor({ id: DATACENTER_ID, kind: 'datacenter', name: 'Datacenter', item: null }, data)}
        busyAction={busyAction}
        refreshing={isFetching && !isLoading}
        onAction={openAction}
        onRefresh={() => void refetch()}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '282px minmax(0, 1fr)', minHeight: 0 }}>
        <PveResourceTree tree={tree} selectedId={selected.id} onSelect={selectResource} />
        <div style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 210px' }}>
          <div style={{ minHeight: 0, minWidth: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', background: panel }}>
            {graph ? <InfraGraphStrip graph={graph} /> : null}
            <div style={{ minHeight: 0, minWidth: 0, display: 'grid', gridTemplateColumns: '172px minmax(0, 1fr) 292px', background: panel }}>
              <PveConfigNav tabs={tabs} activeTab={activeTab} onTab={setActiveTab} />
              <PveContent
                data={data}
                resource={selected}
                activeTab={activeTab}
                actions={actions}
                busyAction={busyAction}
                onAction={openAction}
                onSelect={selectResource}
              />
              {graph ? (
                <InfraInspector
                  data={data}
                  resource={selected}
                  actions={actions}
                  graph={graph}
                  busyAction={busyAction}
                  onAction={openAction}
                />
              ) : null}
            </div>
          </div>
          <PveTaskLog
            tasks={data.proxmox.tasks ?? []}
            logEntry={logEntry}
            activities={taskActivities}
            onSelect={selectResource}
            onActivitySelect={activity => setLogEntry({ title: activity.title, body: activity.body })}
          />
        </div>
      </div>
      <ActionModal
        pending={pending}
        busyAction={busyAction}
        onClose={() => setPending(null)}
        onPatch={setPending}
        onSubmit={next => {
          setPending(null)
          void runAction(next.input, next.target, next.label)
        }}
      />
    </div>
  )
}
