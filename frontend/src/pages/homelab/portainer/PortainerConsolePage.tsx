import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { api, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { Desktop } from '@phosphor-icons/react'
import '@xterm/xterm/css/xterm.css'

import { NativePortainerConsole } from '../NativeControls'
import type {
  ApiSuccess,
  HomelabAuditEntry,
  HomelabControlInput,
  HomelabControlResult,
  HomelabData,
  PortainerEndpointInfo,
  PortainerInstanceInfo,
} from '../types'
import { formatBytes, matchesQuery, normalizeFilter } from '../helpers'
import { StatusDot, card, editorInputStyle, editorTextareaStyle, label, smallButtonStyle } from '../components'

type PortainerView = 'dashboard' | 'docker' | 'swarm' | 'kubernetes' | 'aci' | 'admin' | 'activity' | 'operations' | 'parity'

type StackEditorState = {
  targetLabel: string
  input: HomelabControlInput
  stackName: string
  compose: string
  env: string
  prune: boolean
  applyStrategy?: 'upsert' | 'create' | 'replace'
  previewOutput?: string
  preview?: KubernetesManifestPreview
  error?: string
}

type KubernetesManifestPreview = {
  strategy?: string
  resourceCount?: number
  resources?: KubernetesManifestPreviewResource[]
}

type KubernetesManifestPreviewResource = {
  kind?: string
  name?: string
  namespace?: string | null
  strategy?: string
  collectionPath?: string
  resourcePath?: string
  diff?: {
    exists?: boolean
    diffStatus?: string
    changeCount?: number | null
    changedPaths?: string[]
    liveResourceVersion?: string | number | null
  }
}

type PortainerTerminalState = {
  targetLabel: string
  input: HomelabControlInput
}

type PortainerOutputState = {
  action: string
  title: string
  text: string
}

type DockerEventRow = {
  status?: string
  id?: string
  Type?: string
  Action?: string
  Actor?: {
    ID?: string
    Attributes?: Record<string, string>
  }
  time?: number
  timeNano?: number
}

type PortainerTerminalSessionResponse = {
  sessionId: string
  websocketUrl: string
  expiresInSeconds?: number
  mode?: string
  terminal?: string
}

interface PortainerSurface {
  id: PortainerView
  label: string
  status: 'pass' | 'fail' | 'blocked-upstream' | 'be-only'
  summary: string
}

const TARGET_PORTAINER_VERSION = 'CE 2.39 LTS'

const surfaces: PortainerSurface[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    status: 'fail',
    summary: 'Multi-instance inventory foundation is present; version/capability certification is still required.',
  },
  {
    id: 'docker',
    label: 'Docker',
    status: 'fail',
    summary: 'Containers, stacks, images, volumes, networks, secrets, configs, and registries need live-certified parity.',
  },
  {
    id: 'swarm',
    label: 'Swarm',
    status: 'fail',
    summary: 'Services, tasks, nodes, swarm stacks, secrets, and configs need dedicated Portainer-style workflows.',
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    status: 'fail',
    summary: 'Namespaces, apps, pods, services, ingresses, configmaps, secrets, volumes, CRDs, Helm, and shell are not certified.',
  },
  {
    id: 'aci',
    label: 'ACI',
    status: 'fail',
    summary: 'Container group inventory, deployment, lifecycle, logs, and sizing are not certified.',
  },
  {
    id: 'admin',
    label: 'Admin',
    status: 'fail',
    summary: 'Environment groups, tags, users/teams, settings, templates, registries, and activity need parity evidence.',
  },
  {
    id: 'activity',
    label: 'Activity',
    status: 'fail',
    summary: 'Portainer mutations must be visible in an auditable, filterable activity view with live evidence.',
  },
  {
    id: 'operations',
    label: 'Operations',
    status: 'fail',
    summary: 'Existing Portainer control actions are exposed while live logs, xterm exec, and CodeMirror editors are completed.',
  },
  {
    id: 'parity',
    label: 'Parity Gate',
    status: 'fail',
    summary: 'The gate remains red until every CE parity row is pass, be-only, or blocked-upstream with evidence.',
  },
]

const shellStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(250px, 320px) minmax(0, 1fr)',
  gap: '16px',
  alignItems: 'start',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '12px',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
}

const cellStyle: CSSProperties = {
  padding: '9px 10px',
  borderTop: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  verticalAlign: 'top',
}

const drawerBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'flex-end',
}

const drawerStyle: CSSProperties = {
  width: 'min(860px, 94vw)',
  height: '100%',
  overflow: 'auto',
  background: 'var(--bg-card)',
  borderLeft: '1px solid var(--border)',
  padding: '20px',
}

const portainerEditorTheme = EditorView.theme({
  '&': {
    minHeight: '220px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: '12px',
  },
  '&.cm-focused': {
    outline: '1px solid var(--accent)',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '10px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
  },
  '.cm-selectionBackground': {
    background: 'var(--accent-a15) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: 'var(--accent-a30) !important',
  },
  '.cm-activeLine': {
    background: 'var(--hover-bg)',
  },
  '.cm-gutters': {
    background: 'var(--bg-card)',
    borderRight: '1px solid var(--border)',
    color: 'var(--text-muted)',
  },
  '.cm-scroller': {
    minHeight: '220px',
    maxHeight: '50vh',
    overflow: 'auto',
  },
})

function unwrapHomelabData(response: ApiSuccess<HomelabData> | HomelabData | undefined): HomelabData | undefined {
  if (response && 'data' in response) return response.data
  return response
}

function statusTone(status: PortainerSurface['status']): string {
  if (status === 'pass') return 'var(--secondary-bright)'
  if (status === 'be-only' || status === 'blocked-upstream') return 'var(--gold)'
  return 'var(--red-bright)'
}

function countRows(instances: PortainerInstanceInfo[]) {
  return instances.reduce(
    (acc, instance) => {
      acc.endpoints += instance.endpoints.length
      acc.stacks += instance.stacks.length
      acc.containers += instance.containers.length
      acc.images += instance.images?.length ?? 0
      acc.volumes += instance.volumes?.length ?? 0
      acc.networks += instance.networks?.length ?? 0
      acc.secrets += instance.secrets?.length ?? 0
      acc.configs += instance.configs?.length ?? 0
      acc.registries += instance.registries?.length ?? 0
      acc.swarmServices += instance.swarm_services?.length ?? 0
      acc.swarmNodes += instance.swarm_nodes?.length ?? 0
      acc.swarmTasks += instance.swarm_tasks?.length ?? 0
      acc.kubernetesNamespaces += instance.kubernetes_namespaces?.length ?? 0
      acc.kubernetesApplications += instance.kubernetes_applications?.length ?? 0
      acc.kubernetesPods += instance.kubernetes_pods?.length ?? 0
      acc.kubernetesServices += instance.kubernetes_services?.length ?? 0
      acc.kubernetesIngresses += instance.kubernetes_ingresses?.length ?? 0
      acc.kubernetesConfigmaps += instance.kubernetes_configmaps?.length ?? 0
      acc.kubernetesSecrets += instance.kubernetes_secrets?.length ?? 0
      acc.kubernetesVolumes += instance.kubernetes_volumes?.length ?? 0
      acc.kubernetesCrds += instance.kubernetes_crds?.length ?? 0
      acc.kubernetesHelmReleases += instance.kubernetes_helm_releases?.length ?? 0
      acc.aciSubscriptions += instance.aci_subscriptions?.length ?? 0
      acc.aciResourceGroups += instance.aci_resource_groups?.length ?? 0
      acc.aciContainerGroups += instance.aci_container_groups?.length ?? 0
      acc.users += instance.users?.length ?? 0
      acc.teams += instance.teams?.length ?? 0
      acc.appTemplates += instance.app_templates?.length ?? 0
      acc.customTemplates += instance.custom_templates?.length ?? 0
      return acc
    },
    {
      endpoints: 0,
      stacks: 0,
      containers: 0,
      images: 0,
      volumes: 0,
      networks: 0,
      secrets: 0,
      configs: 0,
      registries: 0,
      swarmServices: 0,
      swarmNodes: 0,
      swarmTasks: 0,
      kubernetesNamespaces: 0,
      kubernetesApplications: 0,
      kubernetesPods: 0,
      kubernetesServices: 0,
      kubernetesIngresses: 0,
      kubernetesConfigmaps: 0,
      kubernetesSecrets: 0,
      kubernetesVolumes: 0,
      kubernetesCrds: 0,
      kubernetesHelmReleases: 0,
      aciSubscriptions: 0,
      aciResourceGroups: 0,
      aciContainerGroups: 0,
      users: 0,
      teams: 0,
      appTemplates: 0,
      customTemplates: 0,
    },
  )
}

function needsTypedConfirmation(action: string): boolean {
  return (
    action === 'delete' ||
    action === 'remove' ||
    action === 'update-stack' ||
    action === 'recreate' ||
    action === 'rollback-helm-release' ||
    action === 'uninstall-helm-release' ||
    action.startsWith('prune') ||
    action.startsWith('remove-')
  )
}

function actionKey(input: HomelabControlInput): string {
  return `${input.provider}:${input.resourceType}:${input.resourceId}:${input.action}`
}

function stackEditorPayload(
  stackEditor: StackEditorState,
  actionOverride?: string,
  confirmation?: string,
): HomelabControlInput {
  const isManifest = stackEditor.input.action === 'apply-kubernetes-manifest'
  return {
    ...stackEditor.input,
    action: actionOverride ?? stackEditor.input.action,
    args: {
      ...(stackEditor.input.args ?? {}),
      name: isManifest ? stackEditor.targetLabel : stackEditor.stackName.trim() || stackEditor.targetLabel,
      namespace: isManifest ? stackEditor.stackName.trim() || 'default' : undefined,
      stack_file_content: stackEditor.input.action === 'update-stack' ? stackEditor.compose : undefined,
      manifest: isManifest ? stackEditor.compose : undefined,
      apply_strategy: isManifest ? stackEditor.applyStrategy ?? 'upsert' : undefined,
      env: stackEditor.env.trim(),
      prune: stackEditor.prune,
    },
    confirmation,
  }
}

function unwrapApiData<T>(response: ApiSuccess<T> | T): T {
  return response && typeof response === 'object' && 'data' in response ? response.data : response
}

function unwrapAuditEntries(response: ApiSuccess<HomelabAuditEntry[]> | HomelabAuditEntry[] | unknown): HomelabAuditEntry[] {
  const value = response && typeof response === 'object' && 'data' in response ? (response as ApiSuccess<HomelabAuditEntry[]>).data : response
  return Array.isArray(value) ? value.filter((entry): entry is HomelabAuditEntry => Boolean(entry && typeof entry === 'object' && 'id' in entry)) : []
}

function isPortainerAuditEntry(entry: HomelabAuditEntry): boolean {
  return entry.details?.provider === 'portainer'
}

function isKubernetesManifestPreview(value: unknown): value is KubernetesManifestPreview {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as KubernetesManifestPreview).resources))
}

function diffTone(status?: string): string {
  if (status === 'create') return 'var(--secondary-bright)'
  if (status === 'unchanged') return 'var(--text-muted)'
  if (status === 'replace') return 'var(--gold)'
  return 'var(--text-secondary)'
}

function portainerWsUrl(relativeUrl: string): string {
  const [path, rawQuery = ''] = relativeUrl.split('?')
  const params = new URLSearchParams(rawQuery)
  const apiKey = getRequestApiKeyForPath(path)
  if (apiKey) params.set('apiKey', apiKey)
  const query = params.toString()
  return `${getRequestBaseForPath(path).replace(/^http/, 'ws')}${path}${query ? `?${query}` : ''}`
}

function endpointLabel(endpoint: PortainerEndpointInfo): string {
  return endpoint.status === 1 ? 'up' : endpoint.status === 2 ? 'down' : 'unknown'
}

function capabilitySummary(instance?: PortainerInstanceInfo): string {
  const capabilities = instance?.capabilities
  if (!capabilities) return 'unknown'
  const labels = [
    capabilities.docker ? 'Docker' : null,
    capabilities.swarm ? 'Swarm' : null,
    capabilities.kubernetes ? 'Kubernetes' : null,
    capabilities.aci ? 'ACI' : null,
  ].filter(Boolean)
  return labels.length ? labels.join(', ') : 'none detected'
}

function endpointPlatform(endpoint: PortainerEndpointInfo): string {
  const platform = endpoint.platform ?? 'unknown'
  return endpoint.features?.includes('swarm') ? `${platform} + swarm` : platform
}

function dockerEngineSummary(endpoint: PortainerEndpointInfo): string {
  const info = endpoint.docker_info
  if (!info) return '-'
  const version = info.server_version ? `Docker ${info.server_version}` : null
  const host = info.name && info.name !== endpoint.name ? info.name : null
  return [version, host].filter(Boolean).join(' · ') || '-'
}

function dockerSystemSummary(endpoint: PortainerEndpointInfo): string {
  const info = endpoint.docker_info
  if (!info) return '-'
  return [info.operating_system, info.os_type, info.architecture].filter(Boolean).join(' · ') || '-'
}

function dockerResourceSummary(endpoint: PortainerEndpointInfo): string {
  const info = endpoint.docker_info
  if (!info) return '-'
  const cpu = typeof info.cpus === 'number' ? `${info.cpus} CPUs` : null
  const memory = typeof info.memory_bytes === 'number' ? `${formatBytes(info.memory_bytes)} RAM` : null
  return [cpu, memory].filter(Boolean).join(' · ') || '-'
}

function dockerObjectSummary(endpoint: PortainerEndpointInfo): string {
  const info = endpoint.docker_info
  if (!info) return '-'
  const containers = typeof info.containers === 'number'
    ? `${info.containers} containers (${info.containers_running ?? 0} running)`
    : null
  const images = typeof info.images === 'number' ? `${info.images} images` : null
  return [containers, images].filter(Boolean).join(' · ') || '-'
}

function dockerStorageSummary(endpoint: PortainerEndpointInfo): string {
  const info = endpoint.docker_info
  if (!info) return '-'
  return [info.driver, info.docker_root_dir].filter(Boolean).join(' · ') || '-'
}

function formatUnixSeconds(value?: number | null): string {
  if (!value) return '-'
  return new Date(value * 1000).toLocaleString()
}

function parseDockerEvents(text: string): DockerEventRow[] | null {
  const rows: DockerEventRow[] = []
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      rows.push(parsed as DockerEventRow)
    } catch {
      return null
    }
  }
  return rows
}

function dockerEventTimestamp(event: DockerEventRow): string {
  if (typeof event.time === 'number') return formatUnixSeconds(event.time)
  if (typeof event.timeNano === 'number' && Number.isFinite(event.timeNano)) {
    return new Date(Math.floor(event.timeNano / 1_000_000)).toLocaleString()
  }
  return '-'
}

function dockerEventTarget(event: DockerEventRow): string {
  return event.Actor?.Attributes?.name ?? event.Actor?.ID ?? event.id ?? '-'
}

function dockerEventAttributes(event: DockerEventRow): string {
  const attributes = event.Actor?.Attributes
  if (!attributes) return '-'
  const pairs = Object.entries(attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
  return pairs.length ? pairs.join(' · ') : '-'
}

function dockerEventSearchText(event: DockerEventRow): string {
  return [
    event.Type,
    event.Action,
    event.status,
    event.id,
    event.Actor?.ID,
    dockerEventTarget(event),
    dockerEventAttributes(event),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function dockerEventViewLabel(event: DockerEventRow): string {
  return `View event ${dockerEventTarget(event)} ${event.Action ?? event.status ?? ''}`.trim()
}

function containerMetadataSummary(container: PortainerInstanceInfo['containers'][number]): string {
  const networks = container.network_names?.length ? container.network_names.join(', ') : null
  const mounts = typeof container.mount_count === 'number' ? `${container.mount_count} mounts` : null
  const labels = container.labels && typeof container.labels === 'object'
    ? `${Object.keys(container.labels).length} labels`
    : null
  return [networks, mounts, labels].filter(Boolean).join(' · ') || '-'
}

function networkFlagSummary(network: NonNullable<PortainerInstanceInfo['networks']>[number]): string {
  const flags = [
    network.attachable ? 'attachable' : null,
    network.internal ? 'internal' : null,
    network.ingress ? 'ingress' : null,
    network.enable_ipv6 ? 'IPv6' : null,
  ].filter(Boolean)
  return flags.length ? flags.join(', ') : '-'
}

function volumeMetaSummary(volume: NonNullable<PortainerInstanceInfo['volumes']>[number]): string {
  const labels = `${volume.labels_count ?? 0} labels`
  const options = `${volume.options_count ?? 0} options`
  const refs = typeof volume.usage_ref_count === 'number' ? `${volume.usage_ref_count} refs` : null
  const size = typeof volume.usage_size === 'number' && volume.usage_size >= 0 ? formatBytes(volume.usage_size) : null
  return [volume.scope, labels, options, refs, size].filter(Boolean).join(' · ') || '-'
}

function imageMetaSummary(image: NonNullable<PortainerInstanceInfo['images']>[number]): string {
  const containers = typeof image.containers === 'number' ? `${image.containers} containers` : null
  const labels = `${image.labels_count ?? 0} labels`
  const virtualSize = typeof image.virtual_size === 'number' && image.virtual_size >= 0 ? `virtual ${formatBytes(image.virtual_size)}` : null
  const sharedSize = typeof image.shared_size === 'number' && image.shared_size >= 0 ? `shared ${formatBytes(image.shared_size)}` : null
  return [containers, labels, virtualSize, sharedSize].filter(Boolean).join(' · ') || '-'
}

function shortId(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value)
  return text ? text.slice(0, 12) : '-'
}

function CodeMirrorTextEditor({
  value,
  onChange,
  ariaLabel,
  minHeight = 220,
  testId,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  minHeight?: number
  testId: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return
    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString())
    })
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          indentOnInput(),
          closeBrackets(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...closeBracketsKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.editorAttributes.of({ 'aria-label': ariaLabel }),
          portainerEditorTheme,
          updateListener,
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [ariaLabel])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return (
    <div
      ref={hostRef}
      data-testid={testId}
      style={{
        minHeight,
        marginTop: '6px',
        marginBottom: '12px',
      }}
    />
  )
}

function PortainerXtermTerminal({
  terminal,
  onClose,
}: {
  terminal: PortainerTerminalState
  onClose: () => void
}) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed' | 'error'>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined
    const target = targetRef.current
    if (!target) return
    target.innerHTML = ''
    setStatus('connecting')
    setError(null)

    async function connect() {
      try {
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }, response] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
          api.post<ApiSuccess<PortainerTerminalSessionResponse> | PortainerTerminalSessionResponse>(
            '/api/homelab/portainer/terminal/session',
            terminal.input,
          ),
        ])
        if (cancelled || !target) return
        const session = unwrapApiData(response)
        const acceptsStdin = ['exec', 'kubernetes-pod-exec'].includes(terminal.input.action)
        const term = new Terminal({
          cursorBlink: false,
          convertEol: true,
          disableStdin: !acceptsStdin,
          fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, monospace)',
          fontSize: 13,
          theme: { background: '#05070a', foreground: '#d6deeb', cursor: '#f29f05' },
        })
        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(new WebLinksAddon())
        term.open(target)
        fitAddon.fit()
        const ws = new WebSocket(portainerWsUrl(session.websocketUrl))
        socketRef.current = ws
        const resizeObserver = new ResizeObserver(() => {
          try {
            fitAddon.fit()
          } catch {
            // xterm fit can fail while the drawer is closing.
          }
        })
        resizeObserver.observe(target)
        ws.onopen = () => {
          setStatus('connected')
          setError(null)
        }
        const dataDisposable = acceptsStdin
          ? term.onData(data => {
              if (ws.readyState === WebSocket.OPEN) ws.send(data)
            })
          : undefined
        ws.onmessage = event => {
          if (event.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(event.data))
          } else if (event.data instanceof Blob) {
            void event.data.arrayBuffer().then(buffer => term.write(new Uint8Array(buffer)))
          } else {
            term.write(String(event.data))
          }
        }
        ws.onerror = () => {
          setStatus('error')
          setError('Portainer terminal websocket failed.')
        }
        ws.onclose = () => {
          if (!cancelled) setStatus(previous => previous === 'error' ? 'error' : 'closed')
        }
        cleanup = () => {
          dataDisposable?.dispose()
          resizeObserver.disconnect()
          ws.close()
          term.dispose()
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
    }
  }, [terminal, reconnectKey])

  return (
    <div role="dialog" aria-modal="true" aria-label="Portainer terminal" style={drawerBackdropStyle}>
      <div style={{ ...drawerStyle, width: 'min(980px, 96vw)', display: 'grid', gridTemplateRows: '38px minmax(0, 1fr)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            {terminal.targetLabel} {terminal.input.action}
          </div>
          <span style={{ color: status === 'error' ? 'var(--red-bright)' : 'var(--text-muted)', fontSize: '12px' }}>
            {error ?? status}
          </span>
          <button type="button" style={{ ...smallButtonStyle, marginLeft: 'auto' }} onClick={() => setReconnectKey(key => key + 1)}>
            Reconnect
          </button>
          <button type="button" style={smallButtonStyle} onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={targetRef} data-testid="portainer-xterm-terminal" style={{ minHeight: 0, background: '#05070a', padding: '8px' }} />
      </div>
    </div>
  )
}

function KubernetesManifestPreviewPanel({ preview, raw }: { preview?: KubernetesManifestPreview; raw: string }) {
  const resources = preview?.resources ?? []
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ ...label, display: 'block', marginBottom: '8px' }}>Manifest preview</div>
      {resources.length ? (
        <div style={{ ...card, padding: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <Badge label={`${preview?.resourceCount ?? resources.length} resources`} tone="ok" />
            <Badge label={`strategy ${preview?.strategy ?? 'upsert'}`} tone="warn" />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Resource', 'Namespace', 'Diff', 'Live version', 'Changed paths'].map(header => (
                    <th key={header} style={{ ...cellStyle, color: 'var(--text-muted)', textAlign: 'left', borderTop: 'none' }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources.map((resource, index) => {
                  const changedPaths = resource.diff?.changedPaths ?? []
                  return (
                    <tr key={`${resource.kind ?? 'resource'}-${resource.name ?? index}`}>
                      <td style={cellStyle}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>
                          {resource.kind ?? 'Resource'}/{resource.name ?? '-'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', overflowWrap: 'anywhere' }}>
                          {resource.resourcePath ?? resource.collectionPath ?? '-'}
                        </div>
                      </td>
                      <td style={cellStyle}>{resource.namespace ?? 'cluster'}</td>
                      <td style={{ ...cellStyle, color: diffTone(resource.diff?.diffStatus), fontWeight: 800 }}>
                        {resource.diff?.diffStatus ?? 'unknown'}
                        {typeof resource.diff?.changeCount === 'number' ? ` (${resource.diff.changeCount})` : ''}
                      </td>
                      <td style={cellStyle}>{resource.diff?.liveResourceVersion ?? '-'}</td>
                      <td style={cellStyle}>
                        {changedPaths.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {changedPaths.slice(0, 8).map(path => (
                              <code key={path} style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                                {path}
                              </code>
                            ))}
                            {changedPaths.length > 8 ? <span style={{ color: 'var(--text-muted)' }}>+{changedPaths.length - 8} more</span> : null}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>none</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <details>
        <summary style={{ color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '6px' }}>Raw preview payload</summary>
        <pre style={{ ...editorTextareaStyle, minHeight: '140px', whiteSpace: 'pre-wrap' }}>{raw}</pre>
      </details>
    </div>
  )
}

function DockerEventsOutput({ text }: { text: string }) {
  const [eventFilter, setEventFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const events = parseDockerEvents(text)
  if (!events) return <pre style={{ ...editorTextareaStyle, whiteSpace: 'pre-wrap' }}>{text}</pre>
  const normalizedEventFilter = eventFilter.trim().toLowerCase()
  const visibleEvents = normalizedEventFilter
    ? events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => dockerEventSearchText(event).includes(normalizedEventFilter))
    : events.map((event, index) => ({ event, index }))
  const selectedEvent = visibleEvents.find(({ index }) => index === selectedIndex)?.event ?? visibleEvents[0]?.event
  const selectedAttributes = selectedEvent?.Actor?.Attributes ? Object.entries(selectedEvent.Actor.Attributes).sort(([left], [right]) => left.localeCompare(right)) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Docker events</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          {visibleEvents.length} of {events.length} event{events.length === 1 ? '' : 's'} matched
        </div>
      </div>
      <label style={{ display: 'block' }}>
        <span style={{ ...label, display: 'block', marginBottom: '6px' }}>Filter displayed events</span>
        <input
          aria-label="Filter displayed Docker events"
          value={eventFilter}
          onChange={event => setEventFilter(event.currentTarget.value)}
          placeholder="type, action, target, label, image"
          style={editorInputStyle}
        />
      </label>
      {visibleEvents.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(260px, 0.8fr)', gap: '12px', alignItems: 'start' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Time', 'Type', 'Action / status', 'Target', 'Attributes', 'Detail'].map(header => (
                    <th key={header} style={{ ...cellStyle, color: 'var(--text-muted)', textAlign: 'left', borderTop: 'none' }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map(({ event, index }) => (
                  <tr key={`${event.id ?? event.Actor?.ID ?? 'event'}-${event.time ?? event.timeNano ?? index}`}>
                    <td style={cellStyle}>{dockerEventTimestamp(event)}</td>
                    <td style={cellStyle}>{event.Type ?? '-'}</td>
                    <td style={{ ...cellStyle, color: 'var(--text-primary)', fontWeight: 800 }}>{event.Action ?? event.status ?? '-'}</td>
                    <td style={cellStyle}>{dockerEventTarget(event)}</td>
                    <td style={{ ...cellStyle, overflowWrap: 'anywhere' }}>{dockerEventAttributes(event)}</td>
                    <td style={cellStyle}>
                      <button type="button" aria-label={dockerEventViewLabel(event)} style={smallButtonStyle} onClick={() => setSelectedIndex(index)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedEvent ? (
            <div style={{ ...card, padding: '12px' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Event detail</div>
              <table style={tableStyle}>
                <tbody>
                  <KeyRow name="Time" value={dockerEventTimestamp(selectedEvent)} />
                  <KeyRow name="Type" value={selectedEvent.Type ?? '-'} />
                  <KeyRow name="Action" value={selectedEvent.Action ?? selectedEvent.status ?? '-'} />
                  <KeyRow name="Target" value={dockerEventTarget(selectedEvent)} />
                  <KeyRow name="ID" value={selectedEvent.id ?? selectedEvent.Actor?.ID ?? '-'} />
                </tbody>
              </table>
              {selectedAttributes.length ? (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ ...label, marginBottom: '6px' }}>Attributes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {selectedAttributes.map(([key, value]) => (
                      <code key={key} style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                        {key}={value}
                      </code>
                    ))}
                  </div>
                </div>
              ) : null}
              <details style={{ marginTop: '10px' }}>
                <summary style={{ color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '6px' }}>Raw event JSON</summary>
                <pre style={{ ...editorTextareaStyle, minHeight: '120px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(selectedEvent, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </div>
      ) : (
        <StatusPanel text={events.length ? 'No Docker events match the current filter.' : 'No Docker events returned.'} />
      )}
      <details>
        <summary style={{ color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '6px' }}>Raw event stream</summary>
        <pre style={{ ...editorTextareaStyle, minHeight: '140px', whiteSpace: 'pre-wrap' }}>{text}</pre>
      </details>
    </div>
  )
}

export default function PortainerConsolePage() {
  const {
    data: homelabResponse,
    isLoading,
    error,
    refetch,
  } = useTauriQuery<ApiSuccess<HomelabData> | HomelabData>(['homelab'], '/api/homelab', {
    refetchInterval: 30000,
  })
  const data = unwrapHomelabData(homelabResponse)
  const instances = data?.portainer?.instances ?? []
  const [activeView, setActiveView] = useState<PortainerView>('dashboard')
  const [selectedInstanceId, setSelectedInstanceId] = useState('')
  const [filter, setFilter] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [outputState, setOutputState] = useState<PortainerOutputState | null>(null)
  const [stackEditor, setStackEditor] = useState<StackEditorState | null>(null)
  const [terminal, setTerminal] = useState<PortainerTerminalState | null>(null)
  const [auditEntries, setAuditEntries] = useState<HomelabAuditEntry[]>([])
  const [auditError, setAuditError] = useState<string | null>(null)

  const selectedInstance = instances.find(instance => instance.id === selectedInstanceId) ?? instances[0]
  const query = normalizeFilter(filter)
  const filteredInstances = useMemo(
    () =>
      instances.filter(instance =>
        matchesQuery(
          query,
          instance.name,
          instance.url,
          instance.endpoints.map(endpoint => endpoint.name).join(' '),
          instance.containers.map(container => `${container.name} ${container.image}`).join(' '),
          instance.stacks.map(stack => stack.name).join(' '),
          (instance.swarm_services ?? []).map(service => `${service.name} ${service.image ?? ''}`).join(' '),
          (instance.swarm_nodes ?? []).map(node => node.hostname).join(' '),
          (instance.swarm_tasks ?? []).map(task => `${task.id} ${task.state ?? ''}`).join(' '),
          (instance.kubernetes_helm_releases ?? []).map(release => `${release.name} ${release.namespace ?? ''} ${release.chart ?? ''}`).join(' '),
          (instance.aci_container_groups ?? []).map(group => `${group.name} ${group.image ?? ''} ${group.resource_group ?? ''} ${group.subscription_name ?? ''}`).join(' '),
          (instance.users ?? []).map(user => user.username).join(' '),
          (instance.teams ?? []).map(team => team.name).join(' '),
          (instance.app_templates ?? []).map(template => template.title).join(' '),
          (instance.custom_templates ?? []).map(template => template.title).join(' '),
        ),
      ),
    [instances, query],
  )
  const counts = useMemo(() => countRows(instances), [instances])
  const selectedCounts = useMemo(() => countRows(selectedInstance ? [selectedInstance] : []), [selectedInstance])
  const liveInstances = instances.filter(instance => instance.available).length
  const failCount = surfaces.filter(surface => surface.status === 'fail').length

  async function loadAuditEntries() {
    try {
      const response = await api.get<ApiSuccess<HomelabAuditEntry[]> | HomelabAuditEntry[]>('/api/audit-log?resource_type=homelab_control&limit=25')
      setAuditEntries(unwrapAuditEntries(response).filter(isPortainerAuditEntry))
      setAuditError(null)
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (activeView === 'activity') void loadAuditEntries()
  }, [activeView])

  async function runControl(input: HomelabControlInput, targetLabel: string) {
    if (
      (input.resourceType === 'container' && ['logs', 'exec'].includes(input.action)) ||
      (input.resourceType === 'endpoint' && input.action === 'events-follow') ||
      (input.resourceType === 'kubernetes-pod' && input.action === 'kubernetes-pod-exec')
    ) {
      setTerminal({ targetLabel, input })
      setActionStatus(null)
      return
    }
    const confirmation =
      needsTypedConfirmation(input.action) && typeof window !== 'undefined'
        ? window.prompt(`Type ${targetLabel} to ${input.action}.`)
        : undefined
    if (confirmation === null) return
    const payload = confirmation ? { ...input, confirmation } : input
    setBusyAction(actionKey(input))
    setActionStatus(null)
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/portainer/action', payload)
      const result = response.data as { response?: { logs?: string; output?: string } | unknown }
      if (['logs', 'events', 'service-logs', 'task-logs', 'kubernetes-pod-logs', 'inspect', 'stats', 'processes', 'changes', 'exec', 'stack-file', 'stack-logs', 'inspect-stack', 'inspect-image', 'history-image', 'inspect-volume', 'inspect-network', 'inspect-secret', 'inspect-config', 'inspect-registry', 'inspect-service', 'inspect-node', 'inspect-task', 'inspect-kubernetes-namespace', 'inspect-kubernetes-application', 'inspect-kubernetes-pod', 'inspect-kubernetes-service', 'inspect-kubernetes-ingress', 'inspect-kubernetes-configmap', 'inspect-kubernetes-secret', 'inspect-kubernetes-volume', 'inspect-kubernetes-crd', 'inspect-helm-release', 'helm-release-history', 'inspect-aci-container-group'].includes(input.action)) {
        const output =
          result.response && typeof result.response === 'object'
            ? 'logs' in result.response
              ? String((result.response as { logs?: string }).logs ?? '')
              : 'output' in result.response
                ? String((result.response as { output?: string }).output ?? '')
                : JSON.stringify(result.response, null, 2)
            : JSON.stringify(response.data, null, 2)
        setOutputState({ action: input.action, title: `${input.action} output`, text: output || 'No data returned.' })
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

  async function openStackEditor(targetLabel: string, input: HomelabControlInput) {
    if (input.action === 'apply-kubernetes-manifest') {
      setStackEditor({
        targetLabel,
        input,
        stackName: String(input.args?.namespace ?? 'default'),
        compose: String(input.args?.manifest ?? 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: apps\n'),
        env: '',
        prune: false,
        applyStrategy: String(input.args?.apply_strategy ?? 'upsert') as StackEditorState['applyStrategy'],
      })
      return
    }
    const key = actionKey({ ...input, action: 'stack-file' })
    setBusyAction(key)
    setActionStatus(null)
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/portainer/action', {
        ...input,
        action: 'stack-file',
      })
      const result = response.data as { response?: { logs?: string } | unknown }
      const compose =
        result.response && typeof result.response === 'object' && 'logs' in result.response
          ? String((result.response as { logs?: string }).logs ?? '')
          : ''
      setStackEditor({
        targetLabel,
        input: { ...input, action: 'update-stack' },
        stackName: targetLabel,
        compose,
        env: String(input.args?.env ?? ''),
        prune: true,
        error: compose.trim() ? undefined : 'Stack file returned empty content.',
      })
    } catch (e) {
      setActionStatus(`Stack file load failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function submitStackEditor() {
    if (!stackEditor) return
    const confirmation =
      stackEditor.input.action === 'update-stack' && typeof window !== 'undefined'
        ? window.prompt(`Type ${stackEditor.targetLabel} to update-stack.`)
        : undefined
    if (confirmation === null) return
    const payload = stackEditorPayload(stackEditor, undefined, confirmation)
    setBusyAction(actionKey(payload))
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/portainer/action', payload)
      setActionStatus(`${payload.action} sent to ${stackEditor.targetLabel} via ${response.data.mode}`)
      setStackEditor(null)
      await refetch()
    } catch (e) {
      setStackEditor(current => (current ? { ...current, error: e instanceof Error ? e.message : String(e) } : current))
    } finally {
      setBusyAction(null)
    }
  }

  async function previewStackEditor() {
    if (!stackEditor || stackEditor.input.action !== 'apply-kubernetes-manifest') return
    const payload = stackEditorPayload(stackEditor, 'preview-kubernetes-manifest')
    setBusyAction(actionKey(payload))
    try {
      const response = await api.post<ApiSuccess<HomelabControlResult>>('/api/homelab/portainer/action', payload)
      const result = response.data as { response?: unknown }
      const preview = result.response
      setStackEditor(current =>
        current
          ? {
              ...current,
              previewOutput: JSON.stringify(preview ?? response.data, null, 2),
              preview: isKubernetesManifestPreview(preview) ? preview : undefined,
              error: undefined,
            }
          : current,
      )
    } catch (e) {
      setStackEditor(current => (current ? { ...current, error: e instanceof Error ? e.message : String(e) } : current))
    } finally {
      setBusyAction(null)
    }
  }

  if (isLoading && !data) {
    return <div role="status">Loading Portainer parity console...</div>
  }
  if (error) {
    return <ErrorState />
  }

  return (
    <div data-testid="portainer-parity-console" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageHeader defaultTitle="HomeLab / Portainer" />
      <div style={card}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Portainer parity console
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
              Target {TARGET_PORTAINER_VERSION}. Completion requires zero fail or missing-evidence parity rows.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Badge label={`${liveInstances}/${instances.length} instances live`} tone={liveInstances === instances.length && instances.length > 0 ? 'ok' : 'warn'} />
            <Badge label={`${failCount} parity rows failing`} tone="fail" />
            <Badge label="tokens server-side" tone="ok" />
          </div>
        </div>
      </div>

      {!instances.length ? (
        <EmptyState icon={Desktop} title="No Portainer providers" description="Add Portainer credentials in HomeLab settings." />
      ) : (
        <div style={shellStyle}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              aria-label="Filter Portainer resources"
              placeholder="Filter instances, endpoints, resources"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              style={editorInputStyle}
            />
            <div style={card}>
              <div style={{ ...label, marginBottom: '10px' }}>Instances</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredInstances.map(instance => (
                  <button
                    key={instance.id}
                    type="button"
                    onClick={() => setSelectedInstanceId(instance.id)}
                    style={{
                      ...smallButtonStyle,
                      textAlign: 'left',
                      background: selectedInstance?.id === instance.id ? 'var(--accent-a10)' : 'var(--bg-elevated)',
                      borderColor: selectedInstance?.id === instance.id ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StatusDot status={instance.available ? 'online' : 'offline'} />
                      <span>{instance.name}</span>
                    </span>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                      {instance.endpoints.length} environments
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={card}>
              <div style={{ ...label, marginBottom: '10px' }}>Views</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {surfaces.map(surface => (
                  <button
                    key={surface.id}
                    type="button"
                    onClick={() => setActiveView(surface.id)}
                    style={{
                      ...smallButtonStyle,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: activeView === surface.id ? 'var(--accent-a10)' : 'var(--bg-elevated)',
                    }}
                  >
                    <span>{surface.label}</span>
                    <span style={{ color: statusTone(surface.status), fontSize: '10px', fontFamily: 'monospace' }}>
                      {surface.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
            {actionStatus ? <StatusPanel text={actionStatus} /> : null}
            {renderView(activeView, {
              instances,
              selectedInstance,
              counts,
              selectedCounts,
              busyAction,
              filter,
              onRun: runControl,
              onOpenStackEditor: openStackEditor,
              auditEntries,
              auditError,
              onRefreshAudit: loadAuditEntries,
            })}
          </main>
        </div>
      )}

      {outputState ? (
        <div role="dialog" aria-modal="true" style={drawerBackdropStyle}>
          <div style={drawerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{outputState.title}</div>
              <button type="button" style={{ ...smallButtonStyle, marginLeft: 'auto' }} onClick={() => setOutputState(null)}>
                Close
              </button>
            </div>
            {outputState.action === 'events' ? (
              <DockerEventsOutput text={outputState.text} />
            ) : (
              <pre style={{ ...editorTextareaStyle, whiteSpace: 'pre-wrap' }}>{outputState.text}</pre>
            )}
          </div>
        </div>
      ) : null}

      {stackEditor ? (
        <div role="dialog" aria-modal="true" aria-label={stackEditor.input.action === 'apply-kubernetes-manifest' ? 'Deploy Kubernetes manifest' : 'Edit Portainer stack'} style={drawerBackdropStyle}>
          <div style={drawerStyle}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{stackEditor.input.action === 'apply-kubernetes-manifest' ? 'Manifest editor' : 'Stack editor'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{stackEditor.targetLabel}</div>
              </div>
              <button type="button" style={{ ...smallButtonStyle, marginLeft: 'auto' }} onClick={() => setStackEditor(null)}>
                Cancel
              </button>
              {stackEditor.input.action === 'apply-kubernetes-manifest' ? (
                <button
                  type="button"
                  style={smallButtonStyle}
                  disabled={!stackEditor.compose.trim() || busyAction !== null}
                  onClick={() => void previewStackEditor()}
                >
                  {busyAction === actionKey(stackEditorPayload(stackEditor, 'preview-kubernetes-manifest')) ? 'Previewing...' : 'Preview Manifest'}
                </button>
              ) : null}
              <button
                type="button"
                style={smallButtonStyle}
                disabled={!stackEditor.compose.trim() || busyAction !== null}
                onClick={() => void submitStackEditor()}
              >
                {busyAction === actionKey(stackEditor.input) ? 'Saving...' : stackEditor.input.action === 'apply-kubernetes-manifest' ? 'Deploy Manifest' : 'Update Stack'}
              </button>
            </div>
            {stackEditor.error ? <StatusPanel text={stackEditor.error} tone="fail" /> : null}
            <label style={{ ...label, display: 'block' }} htmlFor="portainer-stack-name">
              {stackEditor.input.action === 'apply-kubernetes-manifest' ? 'Default namespace' : 'Stack name'}
            </label>
            <input
              id="portainer-stack-name"
              value={stackEditor.stackName}
              onChange={event => setStackEditor(current => (current ? { ...current, stackName: event.target.value } : current))}
              style={{ ...editorInputStyle, marginBottom: '12px' }}
            />
            {stackEditor.input.action === 'apply-kubernetes-manifest' ? (
              <label style={{ display: 'block', marginBottom: '12px' }}>
                <span style={{ ...label, display: 'block', marginBottom: '6px' }}>Apply strategy</span>
                <select
                  aria-label="Apply strategy"
                  value={stackEditor.applyStrategy ?? 'upsert'}
                  onChange={event =>
                    setStackEditor(current =>
                      current
                        ? {
                            ...current,
                            applyStrategy: event.target.value as StackEditorState['applyStrategy'],
                            previewOutput: undefined,
                            preview: undefined,
                          }
                        : current,
                    )
                  }
                  style={editorInputStyle}
                >
                  <option value="upsert">Upsert existing resources</option>
                  <option value="create">Create only</option>
                  <option value="replace">Replace existing resources</option>
                </select>
              </label>
            ) : null}
            <div style={{ ...label, display: 'block' }}>
              {stackEditor.input.action === 'apply-kubernetes-manifest' ? 'Manifest YAML' : 'Compose YAML'}
            </div>
            <CodeMirrorTextEditor
              value={stackEditor.compose}
              onChange={value => setStackEditor(current => (current ? { ...current, compose: value, error: undefined, previewOutput: undefined, preview: undefined } : current))}
              ariaLabel={stackEditor.input.action === 'apply-kubernetes-manifest' ? 'Manifest YAML' : 'Compose YAML'}
              minHeight={340}
              testId={stackEditor.input.action === 'apply-kubernetes-manifest' ? 'portainer-manifest-codemirror' : 'portainer-compose-codemirror'}
            />
            {stackEditor.previewOutput ? (
              <KubernetesManifestPreviewPanel preview={stackEditor.preview} raw={stackEditor.previewOutput} />
            ) : null}
            {stackEditor.input.action === 'update-stack' ? (
              <>
                <div style={{ ...label, display: 'block', marginTop: '12px' }}>
                  Environment
                </div>
                <CodeMirrorTextEditor
                  value={stackEditor.env}
                  onChange={value => setStackEditor(current => (current ? { ...current, env: value } : current))}
                  ariaLabel="Environment"
                  minHeight={120}
                  testId="portainer-env-codemirror"
                />
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={stackEditor.prune}
                    onChange={event => setStackEditor(current => (current ? { ...current, prune: event.target.checked } : current))}
                  />
                  Prune services removed from compose
                </label>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {terminal ? <PortainerXtermTerminal terminal={terminal} onClose={() => setTerminal(null)} /> : null}
    </div>
  )
}

function renderView(
  view: PortainerView,
  props: {
    instances: PortainerInstanceInfo[]
    selectedInstance?: PortainerInstanceInfo
    counts: ReturnType<typeof countRows>
    selectedCounts: ReturnType<typeof countRows>
    busyAction: string | null
    filter: string
    auditEntries: HomelabAuditEntry[]
    auditError: string | null
    onRun: (input: HomelabControlInput, targetLabel: string) => Promise<void>
    onOpenStackEditor: (targetLabel: string, input: HomelabControlInput) => Promise<void>
    onRefreshAudit: () => Promise<void>
  },
) {
  if (view === 'operations') {
    return (
      <NativePortainerConsole
        instances={props.instances}
        filter={props.filter}
        busyAction={props.busyAction}
        onRun={props.onRun}
        onOpenStackEditor={props.onOpenStackEditor}
      />
    )
  }
  if (view === 'parity') return <ParityGate />
  if (view === 'dashboard') return <DashboardView {...props} />
  if (view === 'docker') return <DockerView instance={props.selectedInstance} counts={props.selectedCounts} />
  if (view === 'swarm') return <SwarmView instance={props.selectedInstance} counts={props.selectedCounts} />
  if (view === 'kubernetes') return <KubernetesView instance={props.selectedInstance} counts={props.selectedCounts} />
  if (view === 'aci') return <AciView instance={props.selectedInstance} counts={props.selectedCounts} />
  if (view === 'activity') return <ActivityView entries={props.auditEntries} error={props.auditError} onRefresh={props.onRefreshAudit} />
  return <AdminView instance={props.selectedInstance} />
}

function DashboardView({
  instances,
  selectedInstance,
  counts,
}: {
  instances: PortainerInstanceInfo[]
  selectedInstance?: PortainerInstanceInfo
  counts: ReturnType<typeof countRows>
}) {
  return (
    <>
      <div style={gridStyle}>
        <Metric title="Instances" value={`${instances.filter(instance => instance.available).length}/${instances.length}`} />
        <Metric title="Environments" value={String(counts.endpoints)} />
        <Metric title="Containers" value={String(counts.containers)} />
        <Metric title="Stacks" value={String(counts.stacks)} />
        <Metric title="Assets" value={`${counts.images + counts.volumes + counts.networks}`} />
        <Metric title="Parity Gate" value="fail" tone="fail" />
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Selected instance</div>
        {selectedInstance ? (
          <table style={tableStyle}>
            <tbody>
              <KeyRow name="Name" value={selectedInstance.name} />
              <KeyRow name="URL" value={selectedInstance.url} />
              <KeyRow name="Status" value={selectedInstance.available ? 'available' : selectedInstance.error || 'offline'} />
              <KeyRow name="Version" value={selectedInstance.capabilities?.version ?? 'unknown'} />
              <KeyRow name="Edition" value={selectedInstance.capabilities?.edition ?? 'unknown'} />
              <KeyRow name="Platforms" value={capabilitySummary(selectedInstance)} />
              <KeyRow name="Environments" value={String(selectedInstance.endpoints.length)} />
              <KeyRow name="Groups / tags" value={`${selectedInstance.capabilities?.groups ?? 0} / ${selectedInstance.capabilities?.tags ?? 0}`} />
              <KeyRow name="Users / teams" value={`${selectedInstance.capabilities?.users ?? selectedInstance.users?.length ?? 0} / ${selectedInstance.capabilities?.teams ?? selectedInstance.teams?.length ?? 0}`} />
              <KeyRow name="Templates" value={`${selectedInstance.capabilities?.app_templates ?? selectedInstance.app_templates?.length ?? 0} app / ${selectedInstance.capabilities?.custom_templates ?? selectedInstance.custom_templates?.length ?? 0} custom`} />
              <KeyRow name="Settings probe" value={selectedInstance.capabilities?.settings ? 'available' : 'missing'} />
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Portainer instance selected.</div>
        )}
      </div>
      {selectedInstance ? <EnvironmentTable instance={selectedInstance} /> : null}
    </>
  )
}

function DockerView({ instance, counts }: { instance?: PortainerInstanceInfo; counts: ReturnType<typeof countRows> }) {
  const dockerEndpoints = (instance?.endpoints ?? []).filter(endpoint => endpoint.platform === 'docker')
  return (
    <>
      <div style={gridStyle}>
        <Metric title="Containers" value={String(counts.containers)} />
        <Metric title="Stacks" value={String(counts.stacks)} />
        <Metric title="Images" value={String(counts.images)} />
        <Metric title="Volumes" value={String(counts.volumes)} />
        <Metric title="Networks" value={String(counts.networks)} />
        <Metric title="Registries" value={String(counts.registries)} />
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Docker environments</div>
        {dockerEndpoints.length ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Engine</HeaderCell>
                <HeaderCell>OS</HeaderCell>
                <HeaderCell>Resources</HeaderCell>
                <HeaderCell>Objects</HeaderCell>
                <HeaderCell>Storage</HeaderCell>
                <HeaderCell>Connection</HeaderCell>
                <HeaderCell>Group</HeaderCell>
                <HeaderCell>Features</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {dockerEndpoints.map(endpoint => (
                <tr key={`docker-endpoint:${endpoint.id}`}>
                  <td style={cellStyle}>{endpoint.name}</td>
                  <td style={cellStyle}>{endpointLabel(endpoint)}</td>
                  <td style={cellStyle}>{dockerEngineSummary(endpoint)}</td>
                  <td style={cellStyle}>{dockerSystemSummary(endpoint)}</td>
                  <td style={cellStyle}>{dockerResourceSummary(endpoint)}</td>
                  <td style={cellStyle}>{dockerObjectSummary(endpoint)}</td>
                  <td style={cellStyle}>{dockerStorageSummary(endpoint)}</td>
                  <td style={cellStyle}>{endpoint.connection ?? endpoint.type ?? '-'}</td>
                  <td style={cellStyle}>{endpoint.group_id ?? '-'}</td>
                  <td style={cellStyle}>{formatList(endpoint.features)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Docker environments reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Containers and stacks</div>
        {instance ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Kind</HeaderCell>
                <HeaderCell>Endpoint</HeaderCell>
                <HeaderCell>Image</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Ports</HeaderCell>
                <HeaderCell>Networks / mounts / labels</HeaderCell>
                <HeaderCell>Created</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {instance.containers.map(container => (
                <tr key={`container:${container.id}`}>
                  <td style={cellStyle}>{container.name}</td>
                  <td style={cellStyle}>container</td>
                  <td style={cellStyle}>{container.endpoint_name ?? container.endpoint_id ?? '-'}</td>
                  <td style={cellStyle}>{container.image || '-'}</td>
                  <td style={cellStyle}>{container.state}</td>
                  <td style={cellStyle}>{container.ports || '-'}</td>
                  <td style={cellStyle}>{containerMetadataSummary(container)}</td>
                  <td style={cellStyle}>{formatUnixSeconds(container.created)}</td>
                </tr>
              ))}
              {instance.stacks.map(stack => (
                <tr key={`stack:${stack.id}`}>
                  <td style={cellStyle}>{stack.name}</td>
                  <td style={cellStyle}>stack</td>
                  <td style={cellStyle}>{stack.endpoint_id ?? '-'}</td>
                  <td style={cellStyle}>-</td>
                  <td style={cellStyle}>managed</td>
                  <td style={cellStyle}>-</td>
                  <td style={cellStyle}>-</td>
                  <td style={cellStyle}>-</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Docker resources reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Images</div>
        {(instance?.images?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Tags</HeaderCell>
                <HeaderCell>Digests</HeaderCell>
                <HeaderCell>Size</HeaderCell>
                <HeaderCell>Metadata</HeaderCell>
                <HeaderCell>Created</HeaderCell>
                <HeaderCell>Endpoint</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.images ?? []).map(image => (
                <tr key={`image:${image.endpoint_id}:${image.id}`}>
                  <td style={cellStyle}>{image.name}</td>
                  <td style={cellStyle}>{formatList(image.tags)}</td>
                  <td style={cellStyle}>{formatList(image.digests)}</td>
                  <td style={cellStyle}>{formatBytes(image.size)}</td>
                  <td style={cellStyle}>{imageMetaSummary(image)}</td>
                  <td style={cellStyle}>{formatUnixSeconds(image.created)}</td>
                  <td style={cellStyle}>{image.endpoint_name ?? image.endpoint_id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Docker images reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Volumes and networks</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Kind</HeaderCell>
              <HeaderCell>Driver</HeaderCell>
              <HeaderCell>Scope / mount</HeaderCell>
              <HeaderCell>Volume metadata</HeaderCell>
              <HeaderCell>IPAM</HeaderCell>
              <HeaderCell>Flags</HeaderCell>
              <HeaderCell>Containers</HeaderCell>
              <HeaderCell>Endpoint</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(instance?.volumes ?? []).map(volume => (
              <tr key={`volume:${volume.endpoint_id}:${volume.name}`}>
                <td style={cellStyle}>{volume.name}</td>
                <td style={cellStyle}>volume</td>
                <td style={cellStyle}>{volume.driver || '-'}</td>
                <td style={cellStyle}>{volume.mountpoint || '-'}</td>
                <td style={cellStyle}>{volumeMetaSummary(volume)}</td>
                <td style={cellStyle}>-</td>
                <td style={cellStyle}>-</td>
                <td style={cellStyle}>-</td>
                <td style={cellStyle}>{volume.endpoint_name ?? volume.endpoint_id ?? '-'}</td>
              </tr>
            ))}
            {(instance?.networks ?? []).map(network => (
              <tr key={`network:${network.endpoint_id}:${network.id}`}>
                <td style={cellStyle}>{network.name}</td>
                <td style={cellStyle}>network</td>
                <td style={cellStyle}>{network.driver || '-'}</td>
                <td style={cellStyle}>{network.scope || '-'}</td>
                <td style={cellStyle}>-</td>
                <td style={cellStyle}>{network.ipam || '-'}</td>
                <td style={cellStyle}>{networkFlagSummary(network)}</td>
                <td style={cellStyle}>{network.containers_count ?? 0}</td>
                <td style={cellStyle}>{network.endpoint_name ?? network.endpoint_id ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Secrets and configs</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Kind</HeaderCell>
              <HeaderCell>Created</HeaderCell>
              <HeaderCell>Updated</HeaderCell>
              <HeaderCell>Endpoint</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(instance?.secrets ?? []).map(secret => (
              <tr key={`secret:${secret.endpoint_id}:${secret.id}`}>
                <td style={cellStyle}>{secret.name}</td>
                <td style={cellStyle}>secret</td>
                <td style={cellStyle}>{secret.created_at || '-'}</td>
                <td style={cellStyle}>{secret.updated_at || '-'}</td>
                <td style={cellStyle}>{secret.endpoint_name ?? secret.endpoint_id ?? '-'}</td>
              </tr>
            ))}
            {(instance?.configs ?? []).map(config => (
              <tr key={`config:${config.endpoint_id}:${config.id}`}>
                <td style={cellStyle}>{config.name}</td>
                <td style={cellStyle}>config</td>
                <td style={cellStyle}>{config.created_at || '-'}</td>
                <td style={cellStyle}>{config.updated_at || '-'}</td>
                <td style={cellStyle}>{config.endpoint_name ?? config.endpoint_id ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StatusPanel text="Docker parity remains fail: Docker environments now include normalized engine, OS, CPU, memory, object, and storage data from /docker/info; containers, stacks, images, volumes, networks, secrets, and configs are visible, and inspect/history output is surfaced for Docker asset actions. Live certification, volume browser, event follow, deep stats/detail tabs, and every lifecycle workflow are still incomplete." tone="fail" />
    </>
  )
}

function SwarmView({ instance, counts }: { instance?: PortainerInstanceInfo; counts: ReturnType<typeof countRows> }) {
  const detected = Boolean(instance?.capabilities?.swarm)
  return (
    <>
      <div style={gridStyle}>
        <Metric title="Swarm" value={detected ? 'detected' : 'missing'} tone={detected ? 'normal' : 'fail'} />
        <Metric title="Services" value={String(counts.swarmServices)} />
        <Metric title="Nodes" value={String(counts.swarmNodes)} />
        <Metric title="Tasks" value={String(counts.swarmTasks)} />
        <Metric title="Secrets" value={String(counts.secrets)} />
        <Metric title="Configs" value={String(counts.configs)} />
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Swarm services</div>
        {(instance?.swarm_services?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Image</HeaderCell>
                <HeaderCell>Mode</HeaderCell>
                <HeaderCell>Replicas</HeaderCell>
                <HeaderCell>Endpoint</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.swarm_services ?? []).map(service => (
                <tr key={`swarm-service:${service.id}`}>
                  <td style={cellStyle}>{service.name}</td>
                  <td style={cellStyle}>{service.image || '-'}</td>
                  <td style={cellStyle}>{service.mode || '-'}</td>
                  <td style={cellStyle}>{service.replicas ?? '-'}</td>
                  <td style={cellStyle}>{service.endpoint_name ?? service.endpoint_id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Swarm services reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Swarm nodes</div>
        {(instance?.swarm_nodes?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Hostname</HeaderCell>
                <HeaderCell>State</HeaderCell>
                <HeaderCell>Availability</HeaderCell>
                <HeaderCell>Role</HeaderCell>
                <HeaderCell>Manager</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.swarm_nodes ?? []).map(node => (
                <tr key={`swarm-node:${node.id}`}>
                  <td style={cellStyle}>{node.hostname}</td>
                  <td style={cellStyle}>{node.state || '-'}</td>
                  <td style={cellStyle}>{node.availability || '-'}</td>
                  <td style={cellStyle}>{node.role || '-'}</td>
                  <td style={cellStyle}>{node.leader ? 'leader' : node.manager_reachability || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Swarm nodes reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Swarm tasks</div>
        {(instance?.swarm_tasks?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>ID</HeaderCell>
                <HeaderCell>Service</HeaderCell>
                <HeaderCell>Node</HeaderCell>
                <HeaderCell>Desired</HeaderCell>
                <HeaderCell>State</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.swarm_tasks ?? []).map(task => (
                <tr key={`swarm-task:${task.id}`}>
                  <td style={cellStyle}>{shortId(task.id)}</td>
                  <td style={cellStyle}>{shortId(task.service_id)}</td>
                  <td style={cellStyle}>{shortId(task.node_id)}</td>
                  <td style={cellStyle}>{task.desired_state || '-'}</td>
                  <td style={cellStyle}>{task.state || task.message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Swarm tasks reported.</div>
        )}
      </div>
      <StatusPanel text="Swarm parity remains fail until live certification is complete; services now expose create/update/scale/rollback/remove plus logs and inspect, while nodes and tasks expose their current operations." tone="fail" />
    </>
  )
}

function KubernetesView({ instance, counts }: { instance?: PortainerInstanceInfo; counts: ReturnType<typeof countRows> }) {
  const detected = Boolean(instance?.capabilities?.kubernetes)
  return (
    <>
      <div style={gridStyle}>
        <Metric title="Kubernetes" value={detected ? 'detected' : 'missing'} tone={detected ? 'normal' : 'fail'} />
        <Metric title="Namespaces" value={String(counts.kubernetesNamespaces)} />
        <Metric title="Applications" value={String(counts.kubernetesApplications)} />
        <Metric title="Pods" value={String(counts.kubernetesPods)} />
        <Metric title="Services" value={String(counts.kubernetesServices)} />
        <Metric title="Config/Secret" value={`${counts.kubernetesConfigmaps}/${counts.kubernetesSecrets}`} />
        <Metric title="Helm Releases" value={String(counts.kubernetesHelmReleases)} />
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Kubernetes namespaces</div>
        {(instance?.kubernetes_namespaces?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Endpoint</HeaderCell>
                <HeaderCell>Created</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.kubernetes_namespaces ?? []).map(namespace => (
                <tr key={`k8s-ns:${namespace.endpoint_id}:${namespace.name}`}>
                  <td style={cellStyle}>{namespace.name}</td>
                  <td style={cellStyle}>{namespace.status || '-'}</td>
                  <td style={cellStyle}>{namespace.endpoint_name ?? namespace.endpoint_id ?? '-'}</td>
                  <td style={cellStyle}>{namespace.created_at || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Kubernetes namespaces reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Kubernetes applications</div>
        {(instance?.kubernetes_applications?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Kind</HeaderCell>
                <HeaderCell>Namespace</HeaderCell>
                <HeaderCell>Ready</HeaderCell>
                <HeaderCell>Replicas</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.kubernetes_applications ?? []).map(app => (
                <tr key={`k8s-app:${app.endpoint_id}:${app.namespace}:${app.kind}:${app.name}`}>
                  <td style={cellStyle}>{app.name}</td>
                  <td style={cellStyle}>{app.kind || '-'}</td>
                  <td style={cellStyle}>{app.namespace || '-'}</td>
                  <td style={cellStyle}>{app.ready ?? '-'}</td>
                  <td style={cellStyle}>{app.replicas ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Kubernetes applications reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Kubernetes pods and services</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Kind</HeaderCell>
              <HeaderCell>Namespace</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Detail</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(instance?.kubernetes_pods ?? []).map(pod => (
              <tr key={`k8s-pod:${pod.endpoint_id}:${pod.namespace}:${pod.name}`}>
                <td style={cellStyle}>{pod.name}</td>
                <td style={cellStyle}>Pod</td>
                <td style={cellStyle}>{pod.namespace || '-'}</td>
                <td style={cellStyle}>{pod.status || '-'}</td>
                <td style={cellStyle}>{pod.node || `${pod.restart_count ?? 0} restarts`}</td>
              </tr>
            ))}
            {(instance?.kubernetes_services ?? []).map(service => (
              <tr key={`k8s-svc:${service.endpoint_id}:${service.namespace}:${service.name}`}>
                <td style={cellStyle}>{service.name}</td>
                <td style={cellStyle}>Service</td>
                <td style={cellStyle}>{service.namespace || '-'}</td>
                <td style={cellStyle}>{service.service_type || '-'}</td>
                <td style={cellStyle}>{service.cluster_ip || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Helm releases</div>
        {(instance?.kubernetes_helm_releases?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Namespace</HeaderCell>
                <HeaderCell>Chart</HeaderCell>
                <HeaderCell>Revision</HeaderCell>
                <HeaderCell>Status</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.kubernetes_helm_releases ?? []).map(release => (
                <tr key={`helm:${release.endpoint_id}:${release.namespace}:${release.name}`}>
                  <td style={cellStyle}>{release.name}</td>
                  <td style={cellStyle}>{release.namespace || '-'}</td>
                  <td style={cellStyle}>{release.chart || '-'}</td>
                  <td style={cellStyle}>{release.revision ?? '-'}</td>
                  <td style={cellStyle}>{release.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Helm releases reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Ingress, config, secrets, storage, CRDs</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Kind</HeaderCell>
              <HeaderCell>Namespace</HeaderCell>
              <HeaderCell>Detail</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(instance?.kubernetes_ingresses ?? []).map(ingress => (
              <tr key={`k8s-ing:${ingress.endpoint_id}:${ingress.namespace}:${ingress.name}`}>
                <td style={cellStyle}>{ingress.name}</td>
                <td style={cellStyle}>Ingress</td>
                <td style={cellStyle}>{ingress.namespace || '-'}</td>
                <td style={cellStyle}>{ingress.hosts || ingress.class_name || '-'}</td>
              </tr>
            ))}
            {(instance?.kubernetes_configmaps ?? []).map(configmap => (
              <tr key={`k8s-cm:${configmap.endpoint_id}:${configmap.namespace}:${configmap.name}`}>
                <td style={cellStyle}>{configmap.name}</td>
                <td style={cellStyle}>ConfigMap</td>
                <td style={cellStyle}>{configmap.namespace || '-'}</td>
                <td style={cellStyle}>{configmap.keys ?? 0} keys</td>
              </tr>
            ))}
            {(instance?.kubernetes_secrets ?? []).map(secret => (
              <tr key={`k8s-secret:${secret.endpoint_id}:${secret.namespace}:${secret.name}`}>
                <td style={cellStyle}>{secret.name}</td>
                <td style={cellStyle}>Secret</td>
                <td style={cellStyle}>{secret.namespace || '-'}</td>
                <td style={cellStyle}>{secret.secret_type || `${secret.keys ?? 0} keys`}</td>
              </tr>
            ))}
            {(instance?.kubernetes_volumes ?? []).map(volume => (
              <tr key={`k8s-volume:${volume.endpoint_id}:${volume.kind}:${volume.namespace}:${volume.name}`}>
                <td style={cellStyle}>{volume.name}</td>
                <td style={cellStyle}>{volume.kind || 'Volume'}</td>
                <td style={cellStyle}>{volume.namespace || '-'}</td>
                <td style={cellStyle}>{[volume.status, volume.storage_class, volume.capacity].filter(Boolean).join(' · ') || '-'}</td>
              </tr>
            ))}
            {(instance?.kubernetes_crds ?? []).map(crd => (
              <tr key={`k8s-crd:${crd.endpoint_id}:${crd.name}`}>
                <td style={cellStyle}>{crd.name}</td>
                <td style={cellStyle}>CRD</td>
                <td style={cellStyle}>{crd.scope || '-'}</td>
                <td style={cellStyle}>{crd.kind || crd.group || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StatusPanel text="Kubernetes parity remains fail: namespaces, applications, pods, services, ingresses, configmaps, secrets, volumes, CRDs, and Helm releases are visible; Helm install/inspect/history/rollback/uninstall are wired, but chart search/show, upgrade/deep editor, kubeconfig, and live certification are still missing." tone="fail" />
    </>
  )
}

function formatAciPorts(ports: unknown[] | undefined): string {
  if (!ports?.length) return '-'
  return ports
    .map(port => {
      if (port && typeof port === 'object') {
        const row = port as { port?: string | number; protocol?: string }
        return `${row.port ?? '-'}${row.protocol ? `/${row.protocol}` : ''}`
      }
      return String(port)
    })
    .join(', ')
}

function AciView({ instance, counts }: { instance?: PortainerInstanceInfo; counts: ReturnType<typeof countRows> }) {
  const detected = Boolean(instance?.capabilities?.aci)
  return (
    <>
      <div style={gridStyle}>
        <Metric title="Azure ACI" value={detected ? 'detected' : 'missing'} tone={detected ? 'normal' : 'fail'} />
        <Metric title="Subscriptions" value={String(counts.aciSubscriptions)} />
        <Metric title="Resource Groups" value={String(counts.aciResourceGroups)} />
        <Metric title="Container Groups" value={String(counts.aciContainerGroups)} />
        <Metric title="Public IPs" value={String((instance?.aci_container_groups ?? []).filter(group => group.ip_type === 'Public').length)} />
        <Metric title="Running" value={String((instance?.aci_container_groups ?? []).filter(group => group.status === 'Running').length)} />
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>ACI inventory</div>
        {instance ? (
          <table style={tableStyle}>
            <tbody>
              <KeyRow name="Instance" value={instance.name} />
              <KeyRow name="Detected" value={detected ? 'yes' : 'no'} />
              <KeyRow name="Subscriptions" value={String(instance.aci_subscriptions?.length ?? 0)} />
              <KeyRow name="Resource groups" value={String(instance.aci_resource_groups?.length ?? 0)} />
              <KeyRow name="Container groups" value={String(instance.aci_container_groups?.length ?? 0)} />
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Portainer instance selected.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>ACI container groups</div>
        {(instance?.aci_container_groups?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Image</HeaderCell>
                <HeaderCell>Location</HeaderCell>
                <HeaderCell>Resource group</HeaderCell>
                <HeaderCell>IP / ports</HeaderCell>
                <HeaderCell>CPU / memory</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.aci_container_groups ?? []).map(group => (
                <tr key={`aci-group:${group.id}`}>
                  <td style={cellStyle}>{group.name}</td>
                  <td style={cellStyle}>{group.status || '-'}</td>
                  <td style={cellStyle}>{group.image || '-'}</td>
                  <td style={cellStyle}>{group.location || '-'}</td>
                  <td style={cellStyle}>{group.resource_group || '-'}</td>
                  <td style={cellStyle}>{[group.ip_address, formatAciPorts(group.ports)].filter(Boolean).join(' · ') || '-'}</td>
                  <td style={cellStyle}>{`${group.cpu ?? '-'} / ${group.memory_gb ?? '-'} GB`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No ACI container groups reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>ACI subscriptions and resource groups</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Kind</HeaderCell>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Subscription</HeaderCell>
              <HeaderCell>Location</HeaderCell>
              <HeaderCell>Endpoint</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(instance?.aci_subscriptions ?? []).map(subscription => (
              <tr key={`aci-sub:${subscription.id}`}>
                <td style={cellStyle}>subscription</td>
                <td style={cellStyle}>{subscription.name || subscription.id}</td>
                <td style={cellStyle}>{subscription.id}</td>
                <td style={cellStyle}>-</td>
                <td style={cellStyle}>{subscription.endpoint_name ?? subscription.endpoint_id ?? '-'}</td>
              </tr>
            ))}
            {(instance?.aci_resource_groups ?? []).map(group => (
              <tr key={`aci-rg:${group.id ?? group.name}`}>
                <td style={cellStyle}>resource group</td>
                <td style={cellStyle}>{group.name}</td>
                <td style={cellStyle}>{group.subscription_name || group.subscription_id || '-'}</td>
                <td style={cellStyle}>{group.location || '-'}</td>
                <td style={cellStyle}>{group.endpoint_name ?? group.endpoint_id ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StatusPanel text="Azure ACI parity remains fail: subscriptions, resource groups, container-group inventory, create, inspect, and delete are wired through Portainer's Azure proxy; edit, lifecycle start/stop/restart, logs, and live certification are still missing or need upstream evidence." tone="fail" />
    </>
  )
}

function CapabilityView({
  title,
  surface,
  instance,
  flag,
}: {
  title: string
  surface: string
  instance?: PortainerInstanceInfo
  flag: 'swarm' | 'kubernetes' | 'aci'
}) {
  const detected = Boolean(instance?.capabilities?.[flag])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={card}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
          <Badge label={detected ? `${flag} detected` : `${flag} not detected`} tone={detected ? 'ok' : 'warn'} />
        </div>
        <div style={{ color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
          Required surface: {surface}. Runtime detection is now wired; this area remains `fail` until inventory, actions,
          tests, screenshots, and live certification are complete.
        </div>
      </div>
      {instance ? <EnvironmentTable instance={instance} /> : null}
    </div>
  )
}

function AdminView({ instance }: { instance?: PortainerInstanceInfo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={gridStyle}>
        <Metric title="Groups" value={String(instance?.groups?.length ?? instance?.capabilities?.groups ?? 0)} />
        <Metric title="Tags" value={String(instance?.tags?.length ?? instance?.capabilities?.tags ?? 0)} />
        <Metric title="Users" value={String(instance?.users?.length ?? instance?.capabilities?.users ?? 0)} />
        <Metric title="Teams" value={String(instance?.teams?.length ?? instance?.capabilities?.teams ?? 0)} />
        <Metric title="App Templates" value={String(instance?.app_templates?.length ?? instance?.capabilities?.app_templates ?? 0)} />
        <Metric title="Custom Templates" value={String(instance?.custom_templates?.length ?? instance?.capabilities?.custom_templates ?? 0)} />
        <Metric title="Registries" value={String(instance?.registries?.length ?? 0)} />
        <Metric title="Settings Probe" value={instance?.capabilities?.settings ? 'ok' : 'fail'} tone={instance?.capabilities?.settings ? 'normal' : 'fail'} />
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Runtime capability detection</div>
        {instance ? (
          <table style={tableStyle}>
            <tbody>
              <KeyRow name="Instance" value={instance.name} />
              <KeyRow name="Version" value={instance.capabilities?.version ?? 'unknown'} />
              <KeyRow name="Edition" value={instance.capabilities?.edition ?? 'unknown'} />
              <KeyRow name="Platforms" value={capabilitySummary(instance)} />
              <KeyRow name="System status" value={instance.capabilities?.system_status ? 'available' : 'missing'} />
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Portainer instance selected.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Users and teams</div>
        {(instance?.users?.length ?? 0) + (instance?.teams?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Kind</HeaderCell>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Role</HeaderCell>
                <HeaderCell>Teams</HeaderCell>
                <HeaderCell>ID</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.users ?? []).map(user => (
                <tr key={`user:${user.id}`}>
                  <td style={cellStyle}>user</td>
                  <td style={cellStyle}>{user.username}</td>
                  <td style={cellStyle}>{formatPortainerRole(user.role)}</td>
                  <td style={cellStyle}>{formatList(user.teams)}</td>
                  <td style={cellStyle}>{user.id ?? '-'}</td>
                </tr>
              ))}
              {(instance?.teams ?? []).map(team => (
                <tr key={`team:${team.id}`}>
                  <td style={cellStyle}>team</td>
                  <td style={cellStyle}>{team.name}</td>
                  <td style={cellStyle}>-</td>
                  <td style={cellStyle}>-</td>
                  <td style={cellStyle}>{team.id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No users or teams reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>App templates</div>
        {(instance?.app_templates?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Title</HeaderCell>
                <HeaderCell>Description</HeaderCell>
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>Platform</HeaderCell>
                <HeaderCell>Categories</HeaderCell>
                <HeaderCell>Image</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.app_templates ?? []).map(template => (
                <tr key={`app-template:${template.id}`}>
                  <td style={cellStyle}>{template.title}</td>
                  <td style={cellStyle}>{template.description || '-'}</td>
                  <td style={cellStyle}>{template.type ?? '-'}</td>
                  <td style={cellStyle}>{template.platform ?? '-'}</td>
                  <td style={cellStyle}>{(template.categories ?? []).join(', ') || '-'}</td>
                  <td style={cellStyle}>{template.image ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No app templates reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Custom templates</div>
        {(instance?.custom_templates?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Title</HeaderCell>
                <HeaderCell>Description</HeaderCell>
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>Platform</HeaderCell>
                <HeaderCell>ID</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.custom_templates ?? []).map(template => (
                <tr key={`template:${template.id}`}>
                  <td style={cellStyle}>{template.title}</td>
                  <td style={cellStyle}>{template.description || '-'}</td>
                  <td style={cellStyle}>{template.type ?? '-'}</td>
                  <td style={cellStyle}>{template.platform ?? '-'}</td>
                  <td style={cellStyle}>{template.id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No custom templates reported.</div>
        )}
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Groups and tags</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Kind</HeaderCell>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>ID</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(instance?.groups ?? []).map(group => (
              <tr key={`group:${group.id}`}>
                <td style={cellStyle}>group</td>
                <td style={cellStyle}>{group.name ?? '-'}</td>
                <td style={cellStyle}>{group.id ?? '-'}</td>
              </tr>
            ))}
            {(instance?.tags ?? []).map(tag => (
              <tr key={`tag:${tag.id}`}>
                <td style={cellStyle}>tag</td>
                <td style={cellStyle}>{tag.name ?? '-'}</td>
                <td style={cellStyle}>{tag.id ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={card}>
        <div style={{ ...label, marginBottom: '10px' }}>Registries</div>
        {(instance?.registries?.length ?? 0) > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>URL</HeaderCell>
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>Auth</HeaderCell>
                <HeaderCell>ID</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {(instance?.registries ?? []).map(registry => (
                <tr key={`registry:${registry.id}`}>
                  <td style={cellStyle}>{registry.name}</td>
                  <td style={cellStyle}>{registry.url ?? '-'}</td>
                  <td style={cellStyle}>{registry.type ?? '-'}</td>
                  <td style={cellStyle}>{registry.authentication ? 'enabled' : 'disabled'}</td>
                  <td style={cellStyle}>{registry.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No registries reported.</div>
        )}
      </div>
      <StatusPanel text="Admin parity remains fail: users, teams, registries, app templates, and custom templates are visible, and native controls cover several mutations, but access controls, full template deploys, diagnostics, and activity certification are still incomplete." tone="fail" />
    </div>
  )
}

function ActivityView({
  entries,
  error,
  onRefresh,
}: {
  entries: HomelabAuditEntry[]
  error: string | null
  onRefresh: () => Promise<void>
}) {
  const destructive = entries.filter(entry => entry.details?.destructive).length
  const confirmed = entries.filter(entry => entry.details?.confirmation_supplied).length
  const latest = entries[0]?.created_at ? new Date(entries[0].created_at).toLocaleString() : 'none'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={gridStyle}>
        <Metric title="Portainer Audit" value={String(entries.length)} />
        <Metric title="Destructive" value={String(destructive)} tone={destructive ? 'fail' : 'normal'} />
        <Metric title="Confirmed" value={String(confirmed)} />
        <Metric title="Latest" value={latest} />
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div>
            <div style={{ ...label, marginBottom: '4px' }}>Portainer control audit</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Server-side audit entries from HomeLab control mutations where provider is Portainer.
            </div>
          </div>
          <button type="button" style={smallButtonStyle} onClick={() => void onRefresh()}>
            Refresh Audit
          </button>
        </div>
        {error ? <StatusPanel text={`Audit load failed: ${error}`} tone="fail" /> : null}
        {entries.length ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <HeaderCell>Action</HeaderCell>
                <HeaderCell>Target</HeaderCell>
                <HeaderCell>Resource</HeaderCell>
                <HeaderCell>Context</HeaderCell>
                <HeaderCell>Guardrail</HeaderCell>
                <HeaderCell>Created</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const details = entry.details ?? {}
                const action = details.action ?? entry.action
                const target = details.target_name ?? details.resource_id ?? entry.resource_id ?? '-'
                const resource = details.resource_type ?? entry.resource_type
                const context = [
                  details.instance_id ? `instance ${details.instance_id}` : null,
                  details.endpoint_id ? `endpoint ${details.endpoint_id}` : null,
                  details.node ? `node ${details.node}` : null,
                  details.kind ? `kind ${details.kind}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <tr key={entry.id}>
                    <td style={{ ...cellStyle, color: 'var(--text-primary)', fontWeight: 800 }}>{action}</td>
                    <td style={cellStyle}>{target}</td>
                    <td style={cellStyle}>{resource}</td>
                    <td style={cellStyle}>{context || '-'}</td>
                    <td style={cellStyle}>
                      {details.destructive ? 'destructive' : 'standard'}
                      {details.confirmation_supplied ? ' · confirmed' : ''}
                    </td>
                    <td style={cellStyle}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No Portainer control audit entries reported.</div>
        )}
      </div>
      <StatusPanel text="Activity parity remains fail: Portainer control audit entries are visible and refreshable, but live certification, filtering, export, and correlation to Portainer activity/events are still missing." tone="fail" />
    </div>
  )
}

function formatPortainerRole(role: number | string | null | undefined): string {
  if (role === 1 || role === '1') return 'administrator'
  if (role === 2 || role === '2') return 'standard'
  return role == null ? '-' : String(role)
}

function formatList(values: Array<number | string> | undefined): string {
  return values?.length ? values.map(value => String(value)).join(', ') : '-'
}

function ParityGate() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <StatusPanel
        text="Completion gate is red: every Portainer CE row must be pass, be-only, or blocked-upstream with evidence before this goal can be marked complete."
        tone="fail"
      />
      <div style={card}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <HeaderCell>Surface</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Requirement</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {surfaces.map(surface => (
              <tr key={surface.id}>
                <td style={cellStyle}>{surface.label}</td>
                <td style={{ ...cellStyle, color: statusTone(surface.status), fontFamily: 'monospace' }}>{surface.status}</td>
                <td style={cellStyle}>{surface.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EnvironmentTable({ instance }: { instance: PortainerInstanceInfo }) {
  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: '10px' }}>Environments</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <HeaderCell>Name</HeaderCell>
            <HeaderCell>ID</HeaderCell>
            <HeaderCell>Status</HeaderCell>
            <HeaderCell>Platform</HeaderCell>
            <HeaderCell>Group</HeaderCell>
            <HeaderCell>URL</HeaderCell>
          </tr>
        </thead>
        <tbody>
          {instance.endpoints.map(endpoint => (
            <tr key={endpoint.id}>
              <td style={cellStyle}>{endpoint.name}</td>
              <td style={cellStyle}>{endpoint.id}</td>
              <td style={cellStyle}>{endpointLabel(endpoint)}</td>
              <td style={cellStyle}>{endpointPlatform(endpoint)}</td>
              <td style={cellStyle}>{endpoint.group_id ?? '-'}</td>
              <td style={cellStyle}>{endpoint.url ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeaderCell({ children }: { children: string }) {
  return (
    <th style={{ ...cellStyle, color: 'var(--text-muted)', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase' }}>
      {children}
    </th>
  )
}

function KeyRow({ name, value }: { name: string; value: string }) {
  return (
    <tr>
      <td style={{ ...cellStyle, color: 'var(--text-muted)', width: '170px' }}>{name}</td>
      <td style={cellStyle}>{value}</td>
    </tr>
  )
}

function Metric({ title, value, tone = 'normal' }: { title: string; value: string; tone?: 'normal' | 'fail' }) {
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ color: tone === 'fail' ? 'var(--red-bright)' : 'var(--text-primary)', fontSize: '22px', fontWeight: 800 }}>
        {value}
      </div>
    </div>
  )
}

function Badge({ label: badgeLabel, tone }: { label: string; tone: 'ok' | 'warn' | 'fail' }) {
  const color = tone === 'ok' ? 'var(--secondary-bright)' : tone === 'warn' ? 'var(--gold)' : 'var(--red-bright)'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        borderRadius: '999px',
        padding: '5px 9px',
        color,
        fontSize: '11px',
        fontFamily: 'monospace',
      }}
    >
      {badgeLabel}
    </span>
  )
}

function StatusPanel({ text, tone = 'ok' }: { text: string; tone?: 'ok' | 'fail' }) {
  return (
    <div
      style={{
        ...card,
        borderColor: tone === 'fail' ? 'var(--red-500-a25)' : 'var(--secondary-a25)',
        background: tone === 'fail' ? 'var(--red-500-a12)' : 'var(--secondary-a08)',
        color: tone === 'fail' ? 'var(--red-bright)' : 'var(--text-secondary)',
        fontSize: '13px',
      }}
    >
      {text}
    </div>
  )
}
