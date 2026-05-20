import { useEffect, useMemo, useState } from 'react'
import { Desktop } from '@phosphor-icons/react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/ui/ErrorState'
import { api } from '@/lib/api'
import ActivitySettingsSection from './homelab/ActivitySettingsSection'
import NetworkSection from './homelab/NetworkSection'
import { NativePortainerConsole, NativeProxmoxConsole } from './homelab/NativeControls'
import OverviewSection from './homelab/OverviewSection'
import PortainerSection from './homelab/PortainerSection'
import ProxmoxSection from './homelab/ProxmoxSection'
import StorageBackupsSection from './homelab/StorageBackupsSection'
import SystemsSection from './homelab/SystemsSection'

import type {
  ApiSuccess,
  DockerContainerInfo,
  HomelabAuditEntry,
  HomelabConfigData,
  HomelabControlInput,
  HomelabControlResult,
  HomelabData,
  HomelabSystemInfo,
  NodeInfo,
  OPNsenseServiceInfo,
  PortainerConfigAssetInfo,
  PortainerEndpointInfo,
  PortainerImageInfo,
  PortainerInstanceInfo,
  PortainerNetworkInfo,
  PortainerRegistryInfo,
  PortainerSecretInfo,
  ProxmoxBackupInfo,
  ProxmoxHaResourceInfo,
  ProxmoxServiceInfo,
  ProxmoxTaskInfo,
  PortainerStackInfo,
  PortainerVolumeInfo,
  VMInfo,
  ProxmoxStorageInfo,
} from './homelab/types'
import { configValue, firstFirewallRulePos, firstSnapshotName, shortId } from './homelab/helpers'
import {
  InfoPanel,
  RuntimeCard,
  StatusDot,
  drawerBackdropStyle,
  drawerStyle,
  editorInputStyle,
  editorTextareaStyle,
  label,
  smallButtonStyle,
} from './homelab/components'

interface AuthSessionData {
  authenticated?: boolean
  mfa_required?: boolean
  mfa_verified?: boolean
}

type SyncStatus = 'checking' | 'ready' | 'signed-out' | 'mfa' | 'unknown'
export type HomeLabModuleKey =
  | 'overview'
  | 'portainer'
  | 'proxmox'
  | 'network'
  | 'storage'
  | 'power'
  | 'services'
  | 'activity'

const moduleLabels: Record<HomeLabModuleKey, string> = {
  overview: 'Overview',
  portainer: 'Portainer',
  proxmox: 'Proxmox',
  network: 'Network',
  storage: 'Storage/Backups',
  power: 'Power/Hardware',
  services: 'Services',
  activity: 'Activity/Settings',
}

interface HomelabPageProps {
  module?: HomeLabModuleKey
}

type StackEditorState = {
  targetLabel: string
  input: HomelabControlInput
  stackName: string
  compose: string
  env: string
  prune: boolean
  error?: string
}

function sourceLabel(source?: string): string {
  if (source === 'api') return 'API'
  if (source === 'ssh') return 'SSH'
  if (source === 'docker-ssh') return 'Docker SSH'
  if (source === 'combined') return 'combined'
  return source ? source.toUpperCase() : 'fallback'
}

function isHomeLabDemoMode(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('demo-mode') === 'true'
  } catch {
    return false
  }
}

function needsTypedConfirmation(action: string): boolean {
  return (
    action === 'delete' ||
    action === 'remove' ||
    action === 'update-stack' ||
    action === 'recreate' ||
    action.startsWith('prune') ||
    action.startsWith('remove-') ||
    action === 'delete-snapshot' ||
    action === 'delete-backup' ||
    action === 'rollback-snapshot' ||
    action === 'restore' ||
    action === 'remove-ha' ||
    action === 'delete-firewall-rule'
  )
}

function needsSimpleConfirmation(action: string): boolean {
  return [
    'stop',
    'shutdown',
    'reboot',
    'restart',
    'pause',
    'kill',
    'redeploy',
    'stop-stack',
    'stop-task',
    'disconnect-container',
    'disable-storage',
  ].includes(action)
}

function confirmAction(action: string, target: string): string | undefined | false {
  if (needsTypedConfirmation(action)) {
    const typed = window.prompt(`Type ${target} to ${action}.`)
    return typed === null ? false : typed
  }
  if (needsSimpleConfirmation(action) && !window.confirm(`Run ${action} on ${target}?`)) {
    return false
  }
  return undefined
}

export default function HomelabPage({ module }: HomelabPageProps = {}) {
  const demo = isHomeLabDemoMode()
  const {
    data: homelabResponse,
    isLoading: loading,
    error,
    refetch,
    dataUpdatedAt,
  } = useTauriQuery<ApiSuccess<HomelabData> | HomelabData>(['homelab'], '/api/homelab', {
    refetchInterval: demo ? false : 30000,
    enabled: !demo,
  })
  const data = homelabResponse && 'data' in homelabResponse ? homelabResponse.data : homelabResponse

  const [configInfo, setConfigInfo] = useState<HomelabConfigData | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')
  const [activeTab, setActiveTab] = useState<HomeLabModuleKey>(module ?? 'overview')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [stackEditor, setStackEditor] = useState<StackEditorState | null>(null)
  const [resourceFilter, setResourceFilter] = useState('')
  const [auditEntries, setAuditEntries] = useState<HomelabAuditEntry[]>([])

  async function loadAuditEntries() {
    const auditResponse = await api
      .get<ApiSuccess<HomelabAuditEntry[]>>('/api/audit-log?resource_type=homelab_control&limit=12')
      .catch(() => null)
    setAuditEntries(auditResponse?.data ?? [])
  }

  useEffect(() => {
    if (demo) return
    let cancelled = false

    async function loadConfig() {
      const localResponse = await api.get<ApiSuccess<HomelabConfigData>>('/api/homelab/config').catch(() => null)
      if (!cancelled) setConfigInfo(localResponse?.data ?? null)
      const auditResponse = await api
        .get<ApiSuccess<HomelabAuditEntry[]>>('/api/audit-log?resource_type=homelab_control&limit=12')
        .catch(() => null)
      if (!cancelled) setAuditEntries(auditResponse?.data ?? [])

      const session = await api.get<AuthSessionData>('/api/auth/session').catch(() => null)
      if (!cancelled) {
        if (!session) setSyncStatus('unknown')
        else if (!session.authenticated) setSyncStatus('signed-out')
        else if (session.mfa_required && !session.mfa_verified) setSyncStatus('mfa')
        else setSyncStatus('ready')
      }
    }

    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [demo])

  useEffect(() => {
    if (module) setActiveTab(module)
  }, [module])

  const proxmoxLive = data?.live?.proxmox ?? (data ? !data.mock_services?.proxmox && !data.mock : false)
  const opnsenseLive = data?.live?.opnsense ?? (data ? !data.mock_services?.opnsense && !data.mock : false)
  const portainer = data?.portainer
  const portainerInstances = portainer?.instances ?? []
  const portainerContainers = portainer?.containers ?? []
  const dockerContainers = portainerContainers
  const runningContainers = dockerContainers.filter(container => container.state === 'running').length
  const portainerLive = data?.live?.portainer ?? !!portainer?.available
  const dockerLive = portainerLive
  const runningVMs = data?.proxmox.vms.filter(vm => vm.status === 'running').length ?? 0
  const configuredSystems = data?.systems?.filter(system => system.status === 'configured').length ?? 0
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const syncStatusText =
    syncStatus === 'ready'
      ? 'Supabase ready'
      : syncStatus === 'mfa'
        ? 'Supabase MFA pending'
        : syncStatus === 'signed-out'
          ? 'Supabase signed out'
          : syncStatus === 'checking'
            ? 'Supabase checking'
            : 'Supabase unavailable'

  const runtimeNotes = useMemo(
    () =>
      [
        {
          label: 'Proxmox',
          value: data ? `${runningVMs}/${data.proxmox.vms.length} guests running` : 'Waiting',
          tone: proxmoxLive ? 'ok' : 'warn',
        },
        {
          label: 'OPNsense',
          value: data?.opnsense?.status ?? 'Waiting',
          tone: opnsenseLive ? 'ok' : 'warn',
        },
        {
          label: 'Docker',
          value: portainerLive
            ? `${runningContainers}/${dockerContainers.length} containers controllable`
            : portainer?.error || 'No Portainer provider live',
          tone: portainerLive ? 'ok' : 'warn',
        },
        {
          label: 'Portainer',
          value: portainerLive
            ? `${portainerInstances.filter(instance => instance.available).length}/${portainerInstances.length} instances live`
            : portainer?.error || 'Not configured',
          tone: portainerLive ? 'ok' : 'warn',
        },
        {
          label: 'Systems',
          value: data?.systems ? `${configuredSystems}/${data.systems.length} categories configured` : 'Waiting',
          tone: configuredSystems > 0 ? 'ok' : 'warn',
        },
        {
          label: 'Sync',
          value: syncStatusText,
          tone: syncStatus === 'ready' ? 'ok' : 'warn',
        },
        {
          label: 'Secrets',
          value: configInfo?.api_configured.portainer
            ? 'Portainer armed'
            : configInfo?.api_configured.proxmox || configInfo?.api_configured.opnsense
              ? 'Partial'
              : 'Incomplete',
          tone: configInfo?.api_configured.portainer ? 'ok' : 'warn',
        },
      ] as const,
    [
      configInfo,
      configuredSystems,
      data,
      dockerContainers.length,
      opnsenseLive,
      portainer?.error,
      portainerInstances,
      portainerLive,
      proxmoxLive,
      runningContainers,
      runningVMs,
      syncStatus,
      syncStatusText,
    ],
  )

  const statusChip = (name: string, live: boolean, source?: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        borderRadius: '999px',
        border: '1px solid var(--border)',
        background: live ? 'var(--secondary-a12)' : 'var(--bg-elevated)',
        color: live ? 'var(--secondary-bright)' : 'var(--text-muted)',
        fontSize: '11px',
        fontFamily: 'monospace',
      }}
    >
      <StatusDot status={live ? 'online' : 'offline'} />
      {name} {live ? sourceLabel(source) : 'offline'}
    </span>
  )

  async function runControl(input: HomelabControlInput, targetLabel: string) {
    const preparedInput = prepareControlInput(input, targetLabel)
    if (!preparedInput) return
    const confirmation = typeof window === 'undefined' ? undefined : confirmAction(preparedInput.action, targetLabel)
    if (confirmation === false) return

    const payload = confirmation ? { ...preparedInput, confirmation } : preparedInput
    const key = `${preparedInput.provider}:${preparedInput.resourceType}:${preparedInput.resourceId}:${preparedInput.action}`
    setBusyAction(key)
    setActionStatus(null)
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/control', payload)
      if (
        [
          'logs',
          'inspect',
          'stats',
          'inspect-endpoint',
          'inspect-image',
          'history-image',
          'inspect-volume',
          'inspect-network',
          'inspect-secret',
          'inspect-config',
          'inspect-registry',
          'inspect-stack',
          'console',
          'exec',
          'stack-file',
          'stack-logs',
          'open',
          'healthcheck',
          'task-log',
          'task-status',
        ].includes(preparedInput.action)
      ) {
        const result = response.data as { response?: { logs?: string; output?: string; url?: string } | unknown }
        if (
          (preparedInput.action === 'console' || preparedInput.action === 'open') &&
          result.response &&
          typeof result.response === 'object' &&
          'url' in result.response
        ) {
          window.open(String((result.response as { url?: string }).url), '_blank', 'noopener,noreferrer')
        } else {
          const logs =
            result.response && typeof result.response === 'object'
              ? 'logs' in result.response
                ? String((result.response as { logs?: string }).logs ?? '')
                : 'output' in result.response
                  ? String((result.response as { output?: string }).output ?? '')
                  : JSON.stringify(result.response, null, 2)
              : JSON.stringify(response.data, null, 2)
          setLogText(logs || 'No data returned.')
        }
      } else {
        setActionStatus(`${preparedInput.action} sent to ${targetLabel} via ${response.data.mode}`)
        await loadAuditEntries()
        await refetch()
      }
    } catch (e) {
      setActionStatus(`Control failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function runPreparedControl(input: HomelabControlInput, targetLabel: string) {
    const key = `${input.provider}:${input.resourceType}:${input.resourceId}:${input.action}`
    setBusyAction(key)
    setActionStatus(null)
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/control', input)
      if (
        [
          'logs',
          'inspect',
          'stats',
          'inspect-endpoint',
          'inspect-image',
          'history-image',
          'inspect-volume',
          'inspect-network',
          'inspect-secret',
          'inspect-config',
          'inspect-registry',
          'inspect-stack',
          'console',
          'exec',
          'stack-file',
          'stack-logs',
          'open',
          'healthcheck',
          'task-log',
          'task-status',
        ].includes(input.action)
      ) {
        const result = response.data as { response?: { logs?: string; output?: string; url?: string } | unknown }
        if (
          (input.action === 'console' || input.action === 'open') &&
          result.response &&
          typeof result.response === 'object' &&
          'url' in result.response
        ) {
          window.open(String((result.response as { url?: string }).url), '_blank', 'noopener,noreferrer')
        } else {
          const logs =
            result.response && typeof result.response === 'object'
              ? 'logs' in result.response
                ? String((result.response as { logs?: string }).logs ?? '')
                : 'output' in result.response
                  ? String((result.response as { output?: string }).output ?? '')
                  : JSON.stringify(result.response, null, 2)
              : JSON.stringify(response.data, null, 2)
          setLogText(logs || 'No data returned.')
        }
      } else {
        setActionStatus(`${input.action} sent to ${targetLabel} via ${response.data.mode}`)
        await loadAuditEntries()
        await refetch()
      }
    } catch (e) {
      setActionStatus(`Control failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  function prepareControlInput(input: HomelabControlInput, targetLabel: string): HomelabControlInput | null {
    if (typeof window === 'undefined') return input
    const args = { ...(input.args ?? {}) }
    const askNumber = (message: string, fallback = '') => {
      const value = window.prompt(message, fallback)?.trim()
      if (!value) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
    const askString = (message: string, fallback = '') => {
      const value = window.prompt(message, fallback)?.trim()
      return value || null
    }

    if (input.action === 'set-memory') {
      const value = askNumber(`Memory for ${targetLabel} in MiB`, String(args.memory_mb ?? ''))
      if (!value) return null
      args.memory_mb = value
    }
    if (input.action === 'set-cpu') {
      const value = askNumber(`CPU cores for ${targetLabel}`, String(args.cores ?? ''))
      if (!value) return null
      args.cores = value
    }
    if (input.action === 'set-name') {
      const value = askString(`New name for ${targetLabel}`, targetLabel)
      if (!value) return null
      args.name = value
    }
    if (input.action === 'set-description') {
      const value = askString(`Description for ${targetLabel}`, String(args.description ?? ''))
      if (!value) return null
      args.description = value
    }
    if (input.action === 'set-tags') {
      const value = askString(`Tags for ${targetLabel}`, String(args.tags ?? ''))
      if (!value) return null
      args.tags = value
    }
    if (input.action === 'set-onboot') {
      args.onboot = window.confirm(`Enable start at boot for ${targetLabel}?`)
    }
    if (input.action === 'set-protection') {
      args.protection = window.confirm(`Enable protection for ${targetLabel}?`)
    }
    if (input.action === 'set-firewall') {
      args.enable = window.confirm(`Enable Proxmox firewall for ${targetLabel}?`)
      const policyIn = askString(`Inbound policy for ${targetLabel}`, String(args.policy_in ?? 'DROP'))
      const policyOut = askString(`Outbound policy for ${targetLabel}`, String(args.policy_out ?? 'ACCEPT'))
      if (policyIn) args.policy_in = policyIn
      if (policyOut) args.policy_out = policyOut
    }
    if (input.action === 'add-firewall-rule' || input.action === 'update-firewall-rule') {
      if (input.action === 'update-firewall-rule') {
        const pos = askNumber(`Firewall rule position for ${targetLabel}`, String(args.pos ?? '0'))
        if (!pos) return null
        args.pos = pos
      }
      const type = askString(`Firewall rule direction for ${targetLabel}`, String(args.type ?? 'in'))
      if (!type) return null
      const action = askString(`Firewall rule action for ${targetLabel}`, String(args.action ?? 'ACCEPT'))
      if (!action) return null
      const proto = askString(`Protocol for ${targetLabel}`, String(args.proto ?? 'tcp'))
      const dport = askString(`Destination port for ${targetLabel}`, String(args.dport ?? ''))
      const source = askString(`Source CIDR/IP for ${targetLabel}`, String(args.source ?? ''))
      const dest = askString(`Destination CIDR/IP for ${targetLabel}`, String(args.dest ?? ''))
      const comment = askString(`Rule comment for ${targetLabel}`, String(args.comment ?? 'Managed from HomeLab'))
      args.type = type
      args.action = action
      args.enable = window.confirm(`Enable this firewall rule for ${targetLabel}?`)
      if (proto) args.proto = proto
      if (dport) args.dport = dport
      if (source) args.source = source
      if (dest) args.dest = dest
      if (comment) args.comment = comment
    }
    if (input.action === 'delete-firewall-rule') {
      const pos = askNumber(`Firewall rule position to delete from ${targetLabel}`, String(args.pos ?? '0'))
      if (!pos) return null
      args.pos = pos
    }
    if (input.action === 'set-network') {
      const net = askString(`Network device for ${targetLabel}`, String(args.net ?? 'net0'))
      if (!net) return null
      const value = askString(`Network config for ${net}`, String(args.value ?? 'virtio,bridge=vmbr0,firewall=1'))
      if (!value) return null
      args.net = net
      args.value = value
    }
    if (input.action === 'add-network') {
      const net = askString(`New network device for ${targetLabel}`, String(args.net ?? 'net1'))
      if (!net) return null
      const value = askString(`Network config for ${net}`, String(args.value ?? 'virtio,bridge=vmbr0,firewall=1'))
      if (!value) return null
      args.net = net
      args.value = value
    }
    if (input.action === 'remove-network') {
      const net = askString(`Network device to remove from ${targetLabel}`, String(args.net ?? 'net0'))
      if (!net) return null
      args.net = net
    }
    if (input.action === 'resize-disk') {
      const disk = askString(
        `Disk for ${targetLabel}`,
        String(args.disk ?? (input.resourceType === 'lxc' ? 'rootfs' : 'scsi0')),
      )
      if (!disk) return null
      const size = askString(`New size or delta for ${disk} (example: +10G or 80G)`, String(args.size ?? '+10G'))
      if (!size) return null
      args.disk = disk
      args.size = size
    }
    if (input.action === 'add-disk') {
      const disk = askString(
        `New disk key for ${targetLabel}`,
        String(args.disk ?? (input.resourceType === 'lxc' ? 'mp0' : 'scsi1')),
      )
      if (!disk) return null
      const fallback =
        input.resourceType === 'lxc'
          ? `${String(args.storage ?? 'local-lvm')}:8G,mp=/mnt/data`
          : `${String(args.storage ?? 'local-lvm')}:32G,discard=on`
      const value = askString(`Disk config for ${disk}`, String(args.value ?? fallback))
      if (!value) return null
      args.disk = disk
      args.value = value
    }
    if (input.action === 'remove-disk') {
      const disk = askString(
        `Disk key to remove from ${targetLabel}`,
        String(args.disk ?? (input.resourceType === 'lxc' ? 'mp0' : 'scsi1')),
      )
      if (!disk) return null
      args.disk = disk
    }
    if (['snapshot', 'rollback-snapshot', 'delete-snapshot'].includes(input.action)) {
      const snapname = askString(
        `Snapshot name for ${targetLabel}`,
        input.action === 'snapshot' ? `snap-${Date.now()}` : '',
      )
      if (!snapname) return null
      args.snapname = snapname
    }
    if (input.action === 'backup') {
      const mode = askString(`Backup mode for ${targetLabel}`, String(args.mode ?? 'snapshot'))
      if (!mode) return null
      const storage = askString(`Backup storage for ${targetLabel}`, String(args.storage ?? ''))
      const compress = askString(`Compression for ${targetLabel}`, String(args.compress ?? 'zstd'))
      args.mode = mode
      if (storage) args.storage = storage
      if (compress) args.compress = compress
      args.notes = `Manual backup from HomeLab for ${targetLabel}`
    }
    if (input.action === 'restore') {
      const vmid = askNumber(`Target VMID for restore from ${targetLabel}`, String(args.vmid ?? ''))
      if (!vmid) return null
      const storage = askString(`Target storage for restored guest`, String(args.storage ?? ''))
      args.vmid = vmid
      if (storage) args.storage = storage
      args.force = window.confirm(`Overwrite VMID ${vmid} if it already exists?`)
    }
    if (input.action === 'migrate') {
      const target = askString(`Target Proxmox node for ${targetLabel}`)
      if (!target) return null
      args.target = target
      args.online = window.confirm(`Online migrate ${targetLabel}?`)
    }
    if (input.action === 'add-ha') {
      const state = askString(`HA state for ${targetLabel}`, String(args.state ?? 'started'))
      if (!state) return null
      const group = askString(`HA group for ${targetLabel}`, String(args.group ?? ''))
      args.state = state
      if (group) args.group = group
      args.comment = `Managed from HomeLab for ${targetLabel}`
    }
    if (input.action === 'set-ha-state') {
      const state = askString(`HA state for ${targetLabel}`, String(args.state ?? 'started'))
      if (!state) return null
      args.state = state
    }
    if (input.action === 'clone') {
      const newid = askNumber(`New VMID for clone of ${targetLabel}`)
      if (!newid) return null
      args.newid = newid
      const name = askString(`Name for clone of ${targetLabel}`, `${targetLabel}-clone`)
      if (name) args.name = name
    }
    if (input.action === 'create-vm') {
      const vmid = askNumber(`VMID for new VM on ${targetLabel}`, String(args.vmid ?? ''))
      if (!vmid) return null
      const name = askString(`Name for VM ${vmid}`, String(args.name ?? `vm-${vmid}`))
      if (!name) return null
      const memory = askNumber(`Memory for ${name} in MiB`, String(args.memory_mb ?? '2048'))
      if (!memory) return null
      const cores = askNumber(`CPU cores for ${name}`, String(args.cores ?? '2'))
      if (!cores) return null
      const storage = askString(`Storage for ${name}`, String(args.storage ?? 'local-lvm'))
      if (!storage) return null
      const diskSize = askString(`Disk size for ${name}`, String(args.disk_size ?? '32G'))
      if (!diskSize) return null
      const network = askString(`Network config for ${name}`, String(args.net0 ?? 'virtio,bridge=vmbr0,firewall=1'))
      if (!network) return null
      args.vmid = vmid
      args.name = name
      args.memory_mb = memory
      args.cores = cores
      args.storage = storage
      args.disk_size = diskSize
      args.net0 = network
      args.start = window.confirm(`Start ${name} after creation?`)
    }
    if (input.action === 'create-lxc') {
      const vmid = askNumber(`VMID for new LXC on ${targetLabel}`, String(args.vmid ?? ''))
      if (!vmid) return null
      const hostname = askString(`Hostname for LXC ${vmid}`, String(args.hostname ?? `lxc-${vmid}`))
      if (!hostname) return null
      const template = askString(
        `OS template volume for ${hostname}`,
        String(args.ostemplate ?? 'local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst'),
      )
      if (!template) return null
      const memory = askNumber(`Memory for ${hostname} in MiB`, String(args.memory_mb ?? '1024'))
      if (!memory) return null
      const cores = askNumber(`CPU cores for ${hostname}`, String(args.cores ?? '1'))
      if (!cores) return null
      const storage = askString(`Storage for ${hostname}`, String(args.storage ?? 'local-lvm'))
      if (!storage) return null
      const diskSize = askString(`Root disk size for ${hostname}`, String(args.disk_size ?? '8G'))
      if (!diskSize) return null
      const network = askString(
        `Network config for ${hostname}`,
        String(args.net0 ?? 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1'),
      )
      if (!network) return null
      args.vmid = vmid
      args.hostname = hostname
      args.name = hostname
      args.ostemplate = template
      args.memory_mb = memory
      args.cores = cores
      args.storage = storage
      args.disk_size = diskSize
      args.net0 = network
      args.start = window.confirm(`Start ${hostname} after creation?`)
    }
    if (input.action === 'pull-image') {
      const image = askString(`Image to pull on ${targetLabel}`, String(args.image ?? ''))
      if (!image) return null
      const tag = askString(`Tag for ${image}`, String(args.tag ?? 'latest'))
      if (!tag) return null
      args.image = image
      args.tag = tag
      args.name = image
    }
    if (input.action === 'tag-image') {
      const repo = askString(`Repository for ${targetLabel}`, String(args.repo ?? args.name ?? targetLabel))
      if (!repo) return null
      const tag = askString(`Tag for ${repo}`, String(args.tag ?? 'latest'))
      if (!tag) return null
      args.repo = repo
      args.tag = tag
    }
    if (input.action === 'create-container') {
      const name = askString(`Container name on ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const image = askString(`Image for ${name}`, String(args.image ?? ''))
      if (!image) return null
      const restartPolicy = askString(`Restart policy for ${name}`, String(args.restart_policy ?? 'unless-stopped'))
      if (!restartPolicy) return null
      const env = askString(`Environment for ${name} (KEY=value, comma separated)`, String(args.env ?? ''))
      const ports = askString(`Ports for ${name} (8080:80/tcp, comma separated)`, String(args.ports ?? ''))
      const binds = askString(
        `Bind mounts for ${name} (/host:/container:ro, comma separated)`,
        String(args.binds ?? ''),
      )
      const network = askString(`Network mode for ${name}`, String(args.network ?? ''))
      const command = askString(`Command for ${name}`, String(args.command ?? ''))
      const labels = askString(`Labels for ${name} (key=value, comma separated)`, String(args.labels ?? ''))
      args.name = name
      args.image = image
      args.restart_policy = restartPolicy
      if (env) args.env = env
      if (ports) args.ports = ports
      if (binds) args.binds = binds
      if (network) args.network = network
      if (command) args.command = command
      if (labels) args.labels = labels
    }
    if (input.action === 'create-stack') {
      const name = askString(`Stack name on ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const compose = askString(`Compose YAML for ${name}`, String(args.stack_file_content ?? ''))
      if (!compose) return null
      const env = askString(`Stack environment for ${name} (KEY=value, comma separated)`, String(args.env ?? ''))
      args.name = name
      args.stack_file_content = compose
      if (env) args.env = env
    }
    if (input.action === 'update-stack') {
      const compose = askString(`Updated compose YAML for ${targetLabel}`, String(args.stack_file_content ?? ''))
      if (!compose) return null
      const env = askString(
        `Updated stack environment for ${targetLabel} (KEY=value, comma separated)`,
        String(args.env ?? ''),
      )
      args.stack_file_content = compose
      if (env) args.env = env
      args.prune = window.confirm(`Prune services removed from ${targetLabel}?`)
    }
    if (input.action === 'create-volume') {
      const name = askString(`Volume name on ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const driver = askString(`Volume driver for ${name}`, String(args.driver ?? 'local'))
      if (!driver) return null
      args.name = name
      args.driver = driver
    }
    if (input.action === 'create-network') {
      const name = askString(`Network name on ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const driver = askString(`Network driver for ${name}`, String(args.driver ?? 'bridge'))
      if (!driver) return null
      args.name = name
      args.driver = driver
    }
    if (input.action === 'connect-container' || input.action === 'disconnect-container') {
      const container = askString(`Container id/name for ${targetLabel}`, String(args.container ?? ''))
      if (!container) return null
      args.container = container
      if (input.action === 'disconnect-container') args.force = true
    }
    if (input.action === 'create-secret') {
      const name = askString(`Secret name on ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const data = askString(`Secret value for ${name}`, String(args.data ?? ''))
      if (!data) return null
      const labels = askString(`Labels for ${name} (key=value, comma separated)`, String(args.labels ?? ''))
      args.name = name
      args.data = data
      if (labels) args.labels = labels
    }
    if (input.action === 'create-config') {
      const name = askString(`Config name on ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const data = askString(`Config content for ${name}`, String(args.data ?? ''))
      if (!data) return null
      const labels = askString(`Labels for ${name} (key=value, comma separated)`, String(args.labels ?? ''))
      args.name = name
      args.data = data
      if (labels) args.labels = labels
    }
    if (input.action === 'create-registry' || input.action === 'update-registry') {
      const name = askString(`Registry name for ${targetLabel}`, String(args.name ?? ''))
      if (!name) return null
      const url = askString(`Registry URL for ${name}`, String(args.url ?? ''))
      if (!url) return null
      const type = askNumber(`Registry type for ${name}`, String(args.type ?? '1'))
      if (!type) return null
      const authentication = window.confirm(`Use authentication for ${name}?`)
      args.name = name
      args.url = url
      args.type = type
      args.authentication = authentication
      if (authentication) {
        const username = askString(`Registry username for ${name}`, String(args.username ?? ''))
        if (!username) return null
        const password = askString(`Registry password/token for ${name}`, '')
        if (!password) return null
        args.username = username
        args.password = password
      }
    }
    if (input.action === 'rename') {
      const newName = askString(`New container name for ${targetLabel}`, targetLabel)
      if (!newName) return null
      args.new_name = newName
      args.name = newName
    }
    if (input.action === 'duplicate') {
      const newName = askString(`Duplicate container name for ${targetLabel}`, `${targetLabel}-copy`)
      if (!newName) return null
      args.new_name = newName
      args.name = newName
      args.start = window.confirm(`Start ${newName} after duplicate?`)
    }
    if (input.action === 'recreate') {
      args.name = targetLabel
      args.start = window.confirm(`Start ${targetLabel} after recreate?`)
    }
    if (input.action === 'exec') {
      const command = askString(`Command to exec in ${targetLabel}`, String(args.command ?? 'id'))
      if (!command) return null
      args.command = command
    }
    if (input.action === 'update-restart-policy') {
      const restartPolicy = askString(
        `Restart policy for ${targetLabel}`,
        String(args.restart_policy ?? 'unless-stopped'),
      )
      if (!restartPolicy) return null
      args.restart_policy = restartPolicy
    }
    if (input.action === 'update-resources') {
      const memory = askNumber(`Memory limit for ${targetLabel} in MiB`, String(args.memory_mb ?? ''))
      const cpuShares = askNumber(`CPU shares for ${targetLabel}`, String(args.cpu_shares ?? '1024'))
      if (!memory && !cpuShares) return null
      if (memory) args.memory_mb = memory
      if (cpuShares) args.cpu_shares = cpuShares
    }

    return { ...input, args }
  }

  async function openStackEditor(targetLabel: string, input: HomelabControlInput) {
    const key = `${input.provider}:${input.resourceType}:${input.resourceId}:stack-file`
    setBusyAction(key)
    setActionStatus(null)
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/control', {
        ...input,
        action: 'stack-file',
      })
      const result = response.data as { response?: { logs?: string } | unknown }
      const compose =
        result.response && typeof result.response === 'object' && 'logs' in result.response
          ? String((result.response as { logs?: string }).logs ?? '')
          : ''
      if (!compose.trim()) {
        setActionStatus(`Could not load stack file for ${targetLabel}`)
        return
      }
      setStackEditor({
        targetLabel,
        input: { ...input, action: 'update-stack' },
        stackName: targetLabel,
        compose,
        env: String(input.args?.env ?? ''),
        prune: true,
      })
    } catch (e) {
      setActionStatus(`Stack file load failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  function openCreateStackEditor(targetLabel: string, input: HomelabControlInput) {
    setActionStatus(null)
    setStackEditor({
      targetLabel,
      input: { ...input, action: 'create-stack' },
      stackName: '',
      compose: '',
      env: '',
      prune: false,
    })
  }

  async function submitStackEditor() {
    if (!stackEditor) return
    const action = stackEditor.input.action
    const confirmation =
      action === 'update-stack' && typeof window !== 'undefined'
        ? confirmAction('update-stack', stackEditor.targetLabel)
        : undefined
    if (confirmation === false) return
    const args: Record<string, unknown> = {
      ...(stackEditor.input.args ?? {}),
      stack_file_content: stackEditor.compose,
    }
    if (action === 'create-stack') args.name = stackEditor.stackName.trim()
    if (action === 'update-stack') args.prune = stackEditor.prune
    if (stackEditor.env.trim()) args.env = stackEditor.env.trim()

    const payload = {
      ...stackEditor.input,
      args,
      confirmation,
    }
    const key = `${payload.provider}:${payload.resourceType}:${payload.resourceId}:${payload.action}`
    setBusyAction(key)
    setActionStatus(null)
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/control', payload)
      setActionStatus(`${action} sent to ${stackEditor.targetLabel} via ${response.data.mode}`)
      setStackEditor(null)
      await loadAuditEntries()
      await refetch()
    } catch (e) {
      setStackEditor(current => (current ? { ...current, error: e instanceof Error ? e.message : String(e) } : current))
    } finally {
      setBusyAction(null)
    }
  }

  const controlButton = (targetLabel: string, input: HomelabControlInput, tone: 'normal' | 'danger' = 'normal') => {
    const key = `${input.provider}:${input.resourceType}:${input.resourceId}:${input.action}`
    const disabled = busyAction !== null
    return (
      <button
        key={`${input.action}-${input.resourceId}`}
        onClick={() => void runControl(input, targetLabel)}
        disabled={disabled}
        style={{
          padding: '5px 9px',
          borderRadius: '6px',
          border: `1px solid ${tone === 'danger' ? 'var(--red-500-a25)' : 'var(--border)'}`,
          background: tone === 'danger' ? 'var(--red-500-a12)' : 'var(--bg-subtle)',
          color: tone === 'danger' ? 'var(--red-bright)' : 'var(--text-secondary)',
          fontSize: '11px',
          fontFamily: 'monospace',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {busyAction === key ? '...' : input.action}
      </button>
    )
  }

  const vmActions = (vm: VMInfo) => {
    if (!vm.vmid || !vm.node) return null
    const base = {
      provider: 'proxmox' as const,
      resourceType: vm.kind === 'lxc' ? 'lxc' : 'vm',
      resourceId: String(vm.vmid),
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
    const firstSnapshot = firstSnapshotName(vm)
    const firewallRulePos = firstFirewallRulePos(vm)
    const snapshotActions = (
      <>
        {controlButton(vm.name, { ...base, action: 'snapshot' })}
        {firstSnapshot
          ? controlButton(
              vm.name,
              { ...base, action: 'rollback-snapshot', args: { ...base.args, snapname: firstSnapshot } },
              'danger',
            )
          : null}
        {firstSnapshot
          ? controlButton(
              vm.name,
              { ...base, action: 'delete-snapshot', args: { ...base.args, snapname: firstSnapshot } },
              'danger',
            )
          : null}
      </>
    )
    const firewallRuleActions = (
      <>
        {controlButton(vm.name, {
          ...base,
          action: 'add-firewall-rule',
          args: { ...base.args, type: 'in', action: 'ACCEPT', proto: 'tcp' },
        })}
        {firewallRulePos !== undefined
          ? controlButton(vm.name, {
              ...base,
              action: 'update-firewall-rule',
              args: { ...base.args, pos: firewallRulePos, type: 'in', action: 'ACCEPT' },
            })
          : null}
        {firewallRulePos !== undefined
          ? controlButton(
              vm.name,
              { ...base, action: 'delete-firewall-rule', args: { ...base.args, pos: firewallRulePos } },
              'danger',
            )
          : null}
      </>
    )
    return vm.status === 'running' ? (
      <>
        {controlButton(vm.name, { ...base, action: 'console' })}
        {controlButton(vm.name, { ...base, action: 'set-name' })}
        {controlButton(vm.name, { ...base, action: 'set-description' })}
        {controlButton(vm.name, { ...base, action: 'set-tags' })}
        {controlButton(vm.name, { ...base, action: 'set-onboot' })}
        {controlButton(vm.name, { ...base, action: 'set-protection' })}
        {controlButton(vm.name, {
          ...base,
          action: 'set-firewall',
          args: { ...base.args, policy_in: 'DROP', policy_out: 'ACCEPT' },
        })}
        {firewallRuleActions}
        {controlButton(vm.name, { ...base, action: 'set-memory' })}
        {controlButton(vm.name, { ...base, action: 'set-cpu' })}
        {controlButton(vm.name, { ...base, action: 'set-network' })}
        {controlButton(vm.name, { ...base, action: 'add-network', args: { ...base.args, net: 'net1' } })}
        {controlButton(vm.name, { ...base, action: 'remove-network' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'resize-disk' })}
        {controlButton(vm.name, {
          ...base,
          action: 'add-disk',
          args: { ...base.args, disk: vm.kind === 'lxc' ? 'mp0' : 'scsi1', value: undefined },
        })}
        {controlButton(vm.name, { ...base, action: 'remove-disk' }, 'danger')}
        {snapshotActions}
        {controlButton(vm.name, { ...base, action: 'backup', args: { ...base.args, mode: 'snapshot' } })}
        {controlButton(vm.name, { ...base, action: 'migrate' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'add-ha', args: { ...base.args, state: 'started' } })}
        {controlButton(vm.name, { ...base, action: 'set-ha-state', args: { ...base.args, state: 'started' } })}
        {controlButton(vm.name, { ...base, action: 'remove-ha' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'reboot' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'shutdown' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'stop' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'delete' }, 'danger')}
      </>
    ) : (
      <>
        {controlButton(vm.name, { ...base, action: 'start' })}
        {controlButton(vm.name, { ...base, action: 'set-name' })}
        {controlButton(vm.name, { ...base, action: 'set-description' })}
        {controlButton(vm.name, { ...base, action: 'set-tags' })}
        {controlButton(vm.name, { ...base, action: 'set-onboot' })}
        {controlButton(vm.name, { ...base, action: 'set-protection' })}
        {controlButton(vm.name, {
          ...base,
          action: 'set-firewall',
          args: { ...base.args, policy_in: 'DROP', policy_out: 'ACCEPT' },
        })}
        {firewallRuleActions}
        {controlButton(vm.name, { ...base, action: 'set-memory' })}
        {controlButton(vm.name, { ...base, action: 'set-cpu' })}
        {controlButton(vm.name, { ...base, action: 'set-network' })}
        {controlButton(vm.name, { ...base, action: 'add-network', args: { ...base.args, net: 'net1' } })}
        {controlButton(vm.name, { ...base, action: 'remove-network' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'resize-disk' })}
        {controlButton(vm.name, {
          ...base,
          action: 'add-disk',
          args: { ...base.args, disk: vm.kind === 'lxc' ? 'mp0' : 'scsi1', value: undefined },
        })}
        {controlButton(vm.name, { ...base, action: 'remove-disk' }, 'danger')}
        {snapshotActions}
        {controlButton(vm.name, { ...base, action: 'backup', args: { ...base.args, mode: 'snapshot' } })}
        {controlButton(vm.name, { ...base, action: 'migrate' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'add-ha', args: { ...base.args, state: 'started' } })}
        {controlButton(vm.name, { ...base, action: 'set-ha-state', args: { ...base.args, state: 'started' } })}
        {controlButton(vm.name, { ...base, action: 'remove-ha' }, 'danger')}
        {controlButton(vm.name, { ...base, action: 'clone' })}
        {controlButton(vm.name, { ...base, action: 'delete' }, 'danger')}
      </>
    )
  }

  const nodeActions = (node: NodeInfo) => {
    const base = {
      provider: 'proxmox' as const,
      resourceType: 'node',
      resourceId: node.name,
      args: { node: node.name, name: node.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {controlButton(node.name, { ...base, action: 'create-vm' })}
        {controlButton(node.name, { ...base, action: 'create-lxc' })}
        {controlButton(node.name, { ...base, action: 'reboot' }, 'danger')}
        {controlButton(node.name, { ...base, action: 'shutdown' }, 'danger')}
      </div>
    )
  }

  const serviceActions = (service: ProxmoxServiceInfo) => {
    const base = {
      provider: 'proxmox' as const,
      resourceType: 'service',
      resourceId: service.id,
      args: { node: service.node, name: service.name || service.id },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {service.state === 'running' ? (
          <>
            {controlButton(service.name || service.id, { ...base, action: 'restart' }, 'danger')}
            {controlButton(service.name || service.id, { ...base, action: 'reload' })}
            {controlButton(service.name || service.id, { ...base, action: 'stop' }, 'danger')}
          </>
        ) : (
          controlButton(service.name || service.id, { ...base, action: 'start' })
        )}
      </div>
    )
  }

  const backupActions = (backup: ProxmoxBackupInfo) => {
    const target = backup.name || backup.volid
    const base = {
      provider: 'proxmox' as const,
      resourceType: 'backup',
      resourceId: backup.volid,
      args: {
        node: backup.node,
        name: target,
        archive: backup.volid,
        kind: backup.kind,
        vmid: backup.vmid,
        storage: backup.storage,
      },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {controlButton(target, { ...base, action: 'restore' }, 'danger')}
        {controlButton(target, { ...base, action: 'delete-backup' }, 'danger')}
      </div>
    )
  }

  const storageActions = (storage: ProxmoxStorageInfo) => {
    const target = `${storage.name} (${storage.node})`
    const base = {
      provider: 'proxmox' as const,
      resourceType: 'storage',
      resourceId: storage.name,
      args: { node: storage.node, name: storage.name, storage: storage.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {storage.enabled
          ? controlButton(target, { ...base, action: 'disable-storage' }, 'danger')
          : controlButton(target, { ...base, action: 'enable-storage' })}
      </div>
    )
  }

  const haActions = (resource: ProxmoxHaResourceInfo) => {
    const base = {
      provider: 'proxmox' as const,
      resourceType: 'ha',
      resourceId: resource.sid,
      args: { name: resource.sid, sid: resource.sid, state: resource.state || 'started' },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {controlButton(resource.sid, { ...base, action: 'set-ha-state' })}
        {controlButton(resource.sid, { ...base, action: 'remove-ha' }, 'danger')}
      </div>
    )
  }

  const taskActions = (task: ProxmoxTaskInfo) => {
    const target = task.id || task.upid
    const base = {
      provider: 'proxmox' as const,
      resourceType: 'task',
      resourceId: task.upid,
      args: { node: task.node, name: target },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {controlButton(target, { ...base, action: 'task-status' })}
        {controlButton(target, { ...base, action: 'task-log' })}
        {!task.endtime ? controlButton(target, { ...base, action: 'stop-task' }, 'danger') : null}
      </div>
    )
  }

  const systemActions = (system: HomelabSystemInfo) => {
    if (system.status !== 'configured' || !system.actions.length) {
      return (
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>{system.status}</span>
      )
    }
    const base = {
      provider: 'system' as const,
      resourceType: 'system',
      resourceId: system.id,
      args: { name: system.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {system.actions.includes('open') ? controlButton(system.name, { ...base, action: 'open' }) : null}
        {system.actions.includes('healthcheck') ? controlButton(system.name, { ...base, action: 'healthcheck' }) : null}
      </div>
    )
  }

  const opnsenseServiceActions = (service: OPNsenseServiceInfo) => {
    const target = service.name || service.id
    const base = {
      provider: 'opnsense' as const,
      resourceType: 'service',
      resourceId: service.id,
      args: { service: service.id, name: target },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {service.running ? (
          <>
            {controlButton(target, { ...base, action: 'restart' }, 'danger')}
            {controlButton(target, { ...base, action: 'stop' }, 'danger')}
          </>
        ) : (
          controlButton(target, { ...base, action: 'start' })
        )}
      </div>
    )
  }

  const containerActions = (container: DockerContainerInfo) => {
    const target = container.name || shortId(container.id)
    const endpointId = container.endpoint_id
    const provider = container.instance_id ? ('portainer' as const) : ('docker-ssh' as const)
    const base = {
      provider,
      instanceId: container.instance_id || container.host_id,
      resourceType: 'container',
      resourceId: container.id,
      args: { endpoint_id: endpointId, name: target },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {controlButton(target, { ...base, action: 'logs' })}
        {controlButton(target, { ...base, action: 'inspect' })}
        {controlButton(target, { ...base, action: 'stats' })}
        {provider === 'portainer' &&
          controlButton(target, { ...base, action: 'exec', args: { ...base.args, command: 'id' } })}
        {provider === 'portainer' && controlButton(target, { ...base, action: 'rename' })}
        {provider === 'portainer' && controlButton(target, { ...base, action: 'duplicate' })}
        {provider === 'portainer' && controlButton(target, { ...base, action: 'recreate' }, 'danger')}
        {provider === 'portainer' && controlButton(target, { ...base, action: 'update-restart-policy' })}
        {provider === 'portainer' && controlButton(target, { ...base, action: 'update-resources' })}
        {container.state === 'running' ? (
          <>
            {controlButton(target, { ...base, action: 'restart' }, 'danger')}
            {controlButton(target, { ...base, action: 'stop' }, 'danger')}
            {controlButton(target, { ...base, action: 'kill' }, 'danger')}
          </>
        ) : (
          controlButton(target, { ...base, action: 'start' })
        )}
        {container.state === 'running'
          ? controlButton(target, { ...base, action: 'pause' })
          : controlButton(target, { ...base, action: 'unpause' })}
        {controlButton(target, { ...base, action: 'remove' }, 'danger')}
      </div>
    )
  }

  const endpointActions = (endpoint: PortainerEndpointInfo, instance: PortainerInstanceInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: instance.id,
      resourceType: 'endpoint',
      resourceId: String(endpoint.id),
      args: { name: endpoint.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(endpoint.name, { ...base, action: 'inspect-endpoint' })}
        {controlButton(endpoint.name, {
          ...base,
          action: 'pull-image',
          args: { ...base.args, image: '', tag: 'latest' },
        })}
        {controlButton(endpoint.name, {
          ...base,
          action: 'create-container',
          args: { ...base.args, name: '', image: '', restart_policy: 'unless-stopped' },
        })}
        <button
          key={`create-stack-${instance.id}-${endpoint.id}`}
          onClick={() =>
            openCreateStackEditor(endpoint.name, {
              ...base,
              action: 'create-stack',
              args: { ...base.args, name: '', stack_file_content: '' },
            })
          }
          disabled={busyAction !== null}
          style={{
            padding: '5px 9px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            fontFamily: 'monospace',
            cursor: busyAction ? 'not-allowed' : 'pointer',
            opacity: busyAction ? 0.55 : 1,
          }}
        >
          create-stack
        </button>
        {controlButton(endpoint.name, {
          ...base,
          action: 'create-volume',
          args: { ...base.args, name: '', driver: 'local' },
        })}
        {controlButton(endpoint.name, {
          ...base,
          action: 'create-network',
          args: { ...base.args, name: '', driver: 'bridge' },
        })}
        {controlButton(endpoint.name, {
          ...base,
          action: 'create-secret',
          args: { ...base.args, name: '', data: '' },
        })}
        {controlButton(endpoint.name, {
          ...base,
          action: 'create-config',
          args: { ...base.args, name: '', data: '' },
        })}
        {controlButton(endpoint.name, { ...base, action: 'prune-containers' }, 'danger')}
        {controlButton(endpoint.name, { ...base, action: 'prune-images' }, 'danger')}
        {controlButton(endpoint.name, { ...base, action: 'prune-volumes' }, 'danger')}
        {controlButton(endpoint.name, { ...base, action: 'prune-networks' }, 'danger')}
      </div>
    )
  }

  const instanceActions = (instance: PortainerInstanceInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: instance.id,
      resourceType: 'registry',
      resourceId: instance.id,
      args: { name: `${instance.name}-registry`, type: 1 },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(instance.name, { ...base, action: 'create-registry' })}
      </div>
    )
  }

  const imageActions = (image: PortainerImageInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: image.instance_id,
      resourceType: 'image',
      resourceId: image.id,
      args: { endpoint_id: image.endpoint_id, name: image.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(image.name, { ...base, action: 'inspect-image' })}
        {controlButton(image.name, { ...base, action: 'history-image' })}
        {controlButton(image.name, { ...base, action: 'tag-image' })}
        {controlButton(image.name, { ...base, action: 'remove-image' }, 'danger')}
      </div>
    )
  }

  const volumeActions = (volume: PortainerVolumeInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: volume.instance_id,
      resourceType: 'volume',
      resourceId: volume.name,
      args: { endpoint_id: volume.endpoint_id, name: volume.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(volume.name, { ...base, action: 'inspect-volume' })}
        {controlButton(volume.name, { ...base, action: 'remove-volume' }, 'danger')}
      </div>
    )
  }

  const networkActions = (network: PortainerNetworkInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: network.instance_id,
      resourceType: 'network',
      resourceId: network.id,
      args: { endpoint_id: network.endpoint_id, name: network.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(network.name, { ...base, action: 'inspect-network' })}
        {controlButton(network.name, { ...base, action: 'connect-container' })}
        {controlButton(network.name, { ...base, action: 'disconnect-container' }, 'danger')}
        {controlButton(network.name, { ...base, action: 'remove-network' }, 'danger')}
      </div>
    )
  }

  const secretActions = (secret: PortainerSecretInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: secret.instance_id,
      resourceType: 'secret',
      resourceId: secret.id,
      args: { endpoint_id: secret.endpoint_id, name: secret.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(secret.name, { ...base, action: 'inspect-secret' })}
        {controlButton(secret.name, { ...base, action: 'remove-secret' }, 'danger')}
      </div>
    )
  }

  const configActions = (config: PortainerConfigAssetInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: config.instance_id,
      resourceType: 'config',
      resourceId: config.id,
      args: { endpoint_id: config.endpoint_id, name: config.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(config.name, { ...base, action: 'inspect-config' })}
        {controlButton(config.name, { ...base, action: 'remove-config' }, 'danger')}
      </div>
    )
  }

  const registryActions = (registry: PortainerRegistryInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: registry.instance_id,
      resourceType: 'registry',
      resourceId: String(registry.id),
      args: { name: registry.name, url: registry.url, type: registry.type, authentication: registry.authentication },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(registry.name, { ...base, action: 'inspect-registry' })}
        {controlButton(registry.name, { ...base, action: 'update-registry' })}
        {controlButton(registry.name, { ...base, action: 'remove-registry' }, 'danger')}
      </div>
    )
  }

  const stackActions = (stack: PortainerStackInfo) => {
    const base = {
      provider: 'portainer' as const,
      instanceId: stack.instance_id,
      resourceType: 'stack',
      resourceId: String(stack.id),
      args: { endpoint_id: stack.endpoint_id, name: stack.name },
    }
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {controlButton(stack.name, { ...base, action: 'inspect-stack' })}
        {controlButton(stack.name, { ...base, action: 'stack-file' })}
        {controlButton(stack.name, { ...base, action: 'stack-logs' })}
        {controlButton(stack.name, { ...base, action: 'start-stack' })}
        {controlButton(stack.name, { ...base, action: 'stop-stack' }, 'danger')}
        <button
          key={`update-stack-${stack.id}`}
          onClick={() => void openStackEditor(stack.name, { ...base, action: 'update-stack' })}
          disabled={busyAction !== null}
          style={{
            padding: '5px 9px',
            borderRadius: '6px',
            border: '1px solid var(--red-500-a25)',
            background: 'var(--red-500-a12)',
            color: 'var(--red-bright)',
            fontSize: '11px',
            fontFamily: 'monospace',
            cursor: busyAction ? 'not-allowed' : 'pointer',
            opacity: busyAction ? 0.55 : 1,
          }}
        >
          {busyAction === `portainer:stack:${stack.id}:stack-file` ? '...' : 'update-stack'}
        </button>
        {controlButton(stack.name, { ...base, action: 'redeploy' }, 'danger')}
        {controlButton(stack.name, { ...base, action: 'delete' }, 'danger')}
      </div>
    )
  }

  // Keep legacy section contracts type-checked while native consoles own Portainer/Proxmox rendering.
  const legacyControlCompatibility = {
    PortainerSection,
    ProxmoxSection,
    instanceActions,
    containerActions,
    stackActions,
    endpointActions,
    imageActions,
    volumeActions,
    networkActions,
    secretActions,
    configActions,
    registryActions,
    vmActions,
    nodeActions,
    serviceActions,
    storageActions,
    haActions,
    backupActions,
    taskActions,
  }
  void legacyControlCompatibility

  return (
    <div style={{ padding: '32px', maxWidth: '1180px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '22px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Desktop size={22} style={{ color: 'var(--accent)' }} />
          <PageHeader
            defaultTitle="Home Lab Control Center"
            defaultSubtitle="Full homelab control for Portainer, Proxmox, network, storage, power, and host services"
          />
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}
        >
          {data && (
            <>
              {statusChip('Proxmox', proxmoxLive, data.proxmox.source)}
              {statusChip('OPNsense', opnsenseLive, data.opnsense.source)}
              {statusChip('Portainer', portainerLive, portainer?.source)}
              {statusChip('Docker', dockerLive, portainer?.source ?? 'portainer')}
            </>
          )}
          {lastUpdated && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => refetch()} style={smallButtonStyle}>
            Refresh
          </button>
        </div>
      </div>

      {loading && !demo && (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>
          Loading homelab control data...
        </div>
      )}
      {demo && (
        <InfoPanel
          title="Homelab not configured"
          text="Connect Proxmox, OPNsense, and Portainer instances in Settings to control infrastructure from here."
        />
      )}
      {!demo && error && <ErrorState resource="homelab" onRetry={() => refetch()} />}
      {data?.mock && (
        <InfoPanel
          title="Partial fallback active"
          text="Some homelab providers are using fallback data until credentials are saved."
          tone="warn"
        />
      )}
      {actionStatus && (
        <InfoPanel
          title="Control"
          text={actionStatus}
          tone={actionStatus.startsWith('Control failed') ? 'error' : 'ok'}
        />
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '10px' }}>
            {runtimeNotes.map(note => (
              <RuntimeCard key={note.label} {...note} />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            {!module ? (
              <div
                role="tablist"
                aria-label="Homelab sections"
                style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
              >
                {(Object.entries(moduleLabels) as Array<[HomeLabModuleKey, string]>).map(([key, title]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      ...smallButtonStyle,
                      background: activeTab === key ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: activeTab === key ? 'var(--text-on-color)' : 'var(--text-secondary)',
                    }}
                  >
                    {title}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>
                HomeLab / {moduleLabels[activeTab]}
              </div>
            )}
            <input
              value={resourceFilter}
              onChange={event => setResourceFilter(event.target.value)}
              placeholder="Filter resources"
              aria-label="Filter homelab resources"
              style={{
                width: 'min(260px, 100%)',
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '12px',
              }}
            />
          </div>

          {activeTab === 'overview' && (
            <OverviewSection data={data} portainerInstances={portainerInstances} dockerContainers={dockerContainers} />
          )}
          {activeTab === 'portainer' && (
            <NativePortainerConsole
              instances={portainerInstances}
              filter={resourceFilter}
              busyAction={busyAction}
              onRun={runPreparedControl}
              onOpenStackEditor={openStackEditor}
            />
          )}
          {activeTab === 'proxmox' && (
            <NativeProxmoxConsole
              data={data}
              filter={resourceFilter}
              busyAction={busyAction}
              onRun={runPreparedControl}
            />
          )}
          {activeTab === 'network' && <NetworkSection data={data} opnsenseServiceActions={opnsenseServiceActions} />}
          {activeTab === 'storage' && (
            <StorageBackupsSection
              data={data}
              filter={resourceFilter}
              systems={data.systems ?? []}
              storageActions={storageActions}
              backupActions={backupActions}
              systemActions={systemActions}
            />
          )}
          {activeTab === 'power' && (
            <SystemsSection
              systems={data.systems ?? []}
              filter={resourceFilter}
              module="power"
              systemActions={systemActions}
            />
          )}
          {activeTab === 'services' && (
            <SystemsSection
              systems={data.systems ?? []}
              filter={resourceFilter}
              module="services"
              systemActions={systemActions}
            />
          )}
          {activeTab === 'activity' && (
            <ActivitySettingsSection
              data={data}
              configInfo={configInfo}
              syncStatusText={syncStatusText}
              auditEntries={auditEntries}
            />
          )}
        </div>
      )}

      {logText !== null && (
        <div style={drawerBackdropStyle} onClick={() => setLogText(null)}>
          <div style={drawerStyle} onClick={event => event.stopPropagation()}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Container Logs</div>
              <button onClick={() => setLogText(null)} style={smallButtonStyle}>
                Close
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: 1.5,
                fontFamily: 'monospace',
              }}
            >
              {logText}
            </pre>
          </div>
        </div>
      )}
      {stackEditor !== null && (
        <div style={drawerBackdropStyle} onClick={() => setStackEditor(null)}>
          <div style={drawerStyle} onClick={event => event.stopPropagation()}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {stackEditor.input.action === 'create-stack'
                  ? `Create stack on ${stackEditor.targetLabel}`
                  : `Edit ${stackEditor.targetLabel}`}
              </div>
              <button onClick={() => setStackEditor(null)} style={smallButtonStyle}>
                Close
              </button>
            </div>
            {stackEditor.input.action === 'create-stack' && (
              <>
                <label style={{ ...label, display: 'block', marginBottom: '6px' }}>Stack Name</label>
                <input
                  value={stackEditor.stackName}
                  onChange={event =>
                    setStackEditor(current =>
                      current ? { ...current, stackName: event.target.value, error: undefined } : current,
                    )
                  }
                  placeholder="infra-stack"
                  style={{ ...editorInputStyle, marginBottom: '14px' }}
                />
              </>
            )}
            <label style={{ ...label, display: 'block', marginBottom: '6px' }}>Compose YAML</label>
            <textarea
              aria-label="Compose YAML"
              value={stackEditor.compose}
              onChange={event =>
                setStackEditor(current =>
                  current ? { ...current, compose: event.target.value, error: undefined } : current,
                )
              }
              spellCheck={false}
              style={editorTextareaStyle}
            />
            <label style={{ ...label, display: 'block', marginTop: '14px', marginBottom: '6px' }}>Environment</label>
            <input
              value={stackEditor.env}
              onChange={event =>
                setStackEditor(current =>
                  current ? { ...current, env: event.target.value, error: undefined } : current,
                )
              }
              placeholder="KEY=value, comma separated"
              style={editorInputStyle}
            />
            {stackEditor.input.action === 'update-stack' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '14px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                }}
              >
                <input
                  type="checkbox"
                  checked={stackEditor.prune}
                  onChange={event =>
                    setStackEditor(current => (current ? { ...current, prune: event.target.checked } : current))
                  }
                />
                Prune services removed from the compose file
              </label>
            )}
            {stackEditor.error && (
              <div style={{ marginTop: '12px', color: 'var(--red-bright)', fontSize: '12px' }}>{stackEditor.error}</div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setStackEditor(null)} style={smallButtonStyle}>
                Cancel
              </button>
              <button
                onClick={() => void submitStackEditor()}
                disabled={
                  busyAction !== null ||
                  !stackEditor.compose.trim() ||
                  (stackEditor.input.action === 'create-stack' && !stackEditor.stackName.trim())
                }
                style={{
                  ...smallButtonStyle,
                  borderColor: stackEditor.input.action === 'update-stack' ? 'var(--red-500-a25)' : 'var(--border)',
                  background: stackEditor.input.action === 'update-stack' ? 'var(--red-500-a12)' : 'var(--accent)',
                  color: stackEditor.input.action === 'update-stack' ? 'var(--red-bright)' : 'var(--text-on-color)',
                  opacity:
                    busyAction !== null ||
                    !stackEditor.compose.trim() ||
                    (stackEditor.input.action === 'create-stack' && !stackEditor.stackName.trim())
                      ? 0.55
                      : 1,
                }}
              >
                {busyAction ===
                `${stackEditor.input.provider}:${stackEditor.input.resourceType}:${stackEditor.input.resourceId}:${stackEditor.input.action}`
                  ? 'Saving...'
                  : stackEditor.input.action === 'create-stack'
                    ? 'Create stack'
                    : 'Save stack'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
