import type { VaultNote } from './types'
import { buildVaultDataRows } from './dataMode'

export interface VaultPluginDefinition {
  id: string
  label: string
  description: string
  permissions?: VaultPluginPermission[]
  template?: string
  runtime?: VaultPluginRuntime
  enabled?: boolean
  version?: string
  author?: string
  apiVersion?: string
  minAppVersion?: string
  license?: string
  homepage?: string
  repository?: string
  keywords?: string[]
  commands?: VaultPluginCommand[]
  checksum?: string
  expectedChecksum?: string
  integrity?: VaultPluginIntegrity
}

export type VaultPluginIntegrity = 'built-in' | 'verified' | 'signed' | 'mismatch' | 'unsigned'

export interface VaultPluginConfig {
  plugin?: string
  title?: string
  query?: string
  limit?: number
  includeDisabled?: boolean
}

export interface VaultPluginRuntime {
  language: 'claw-script'
  code: string
}

export interface VaultPluginCommand {
  id: string
  name: string
  description?: string
  config?: Omit<VaultPluginConfig, 'plugin'>
}

export interface VaultPluginCommandContribution {
  id: string
  pluginId: string
  pluginLabel: string
  label: string
  detail: string
  config: VaultPluginConfig
}

export type VaultPluginPermission =
  | 'read:vault-stats'
  | 'read:recent-notes'
  | 'read:tags'
  | 'read:files'
  | 'read:current-note'
  | 'read:metadata'
  | 'read:plugin-data'
  | 'write:files'
  | 'write:metadata'
  | 'write:plugin-data'

export interface VaultPluginRegistryEntry {
  plugin: VaultPluginDefinition
  source: 'built-in' | 'vault'
  sourceNoteId?: string
  sourceTitle?: string
  enabled: boolean
  permissions: VaultPluginPermission[]
  checksum: string
  expectedChecksum?: string
  integrity: VaultPluginIntegrity
}

export interface VaultPluginPackageSignature {
  signer: string
  checksum: string
  signature: string
  publicKey?: JsonWebKey
}

export interface VaultPluginMarketplacePackage {
  packageId: string
  plugin: VaultPluginDefinition
  sourceNoteId?: string
  sourceTitle?: string
  sourceUrl?: string
  checksum: string
  expectedChecksum?: string
  signature?: VaultPluginPackageSignature
  integrity: Exclude<VaultPluginIntegrity, 'built-in'>
}

export interface VaultPluginTrustedPublisher {
  signer: string
  publicKey: JsonWebKey
  keyId: string
  revoked?: boolean
  rotatedToKeyId?: string
  expiresAt?: string
  sourceNoteId?: string
  sourceTitle?: string
}

export interface VaultPluginDataRecord {
  plugin: string
  data: unknown
  checksum: string
  sourceNoteId?: string
  sourceTitle?: string
}

export type VaultPluginWriteAction = 'create' | 'modify' | 'trash' | 'rename' | 'frontmatter'

export interface VaultPluginWriteRecord {
  plugin: string
  action: VaultPluginWriteAction
  path: string
  content?: string
  newPath?: string
  frontmatter?: Record<string, unknown>
  checksum: string
  sourceNoteId?: string
  sourceTitle?: string
}

export interface VaultPluginWriteAppliedChange {
  record: VaultPluginWriteRecord
  noteId: string
  nextNoteId: string
  checkpointNoteId?: string
}

export interface VaultPluginWriteSkippedChange {
  record: VaultPluginWriteRecord
  reason: string
}

export interface VaultPluginWriteApplyPlan {
  notes: VaultNote[]
  applied: VaultPluginWriteAppliedChange[]
  skipped: VaultPluginWriteSkippedChange[]
  checkpointNoteIds: string[]
}

export type VaultPluginMarketplaceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

const MAX_VAULT_PLUGIN_RUNTIME_CODE_LENGTH = 16000
const VAULT_PLUGIN_SCOPE_NOTICE =
  '> Scope: local clawctrl plugin manifests run through a permission-scoped Obsidian compatibility facade; arbitrary native/community Obsidian plugins are not executed.'

const ALLOWED_PLUGIN_PERMISSIONS = new Set<VaultPluginPermission>([
  'read:vault-stats',
  'read:recent-notes',
  'read:tags',
  'read:files',
  'read:current-note',
  'read:metadata',
  'read:plugin-data',
  'write:files',
  'write:metadata',
  'write:plugin-data',
])

const BLOCKED_RUNTIME_TOKENS = [
  'Array',
  'Blob',
  'BroadcastChannel',
  'Date',
  'EventSource',
  'Function',
  'Promise',
  'RegExp',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
  'constructor',
  'document',
  'eval',
  'fetch',
  'for',
  'globalThis',
  'history',
  'import',
  'indexedDB',
  'localStorage',
  'location',
  'navigator',
  'process',
  'require',
  'sessionStorage',
  'setInterval',
  'setTimeout',
  'while',
  'window',
]

export const LOCAL_VAULT_PLUGINS: VaultPluginDefinition[] = [
  {
    id: 'vault.stats',
    label: 'Vault stats',
    description: 'Summarizes local notes, tags, tasks, attachments, and trash state.',
    permissions: ['read:vault-stats'],
  },
  {
    id: 'vault.recent',
    label: 'Recent notes',
    description: 'Lists recently updated notes from the local vault.',
    permissions: ['read:recent-notes'],
  },
  {
    id: 'vault.tags',
    label: 'Tag index',
    description: 'Renders local tag counts without remote indexing.',
    permissions: ['read:tags'],
  },
  {
    id: 'vault.plugins',
    label: 'Plugin registry',
    description: 'Lists local vault plugins, sources, permissions, and enablement state.',
    permissions: [],
  },
  {
    id: 'vault.marketplace',
    label: 'Plugin marketplace',
    description: 'Renders a local marketplace catalog from vault-stored plugin manifests.',
    permissions: [],
  },
  {
    id: 'vault.plugin-writes',
    label: 'Plugin write review',
    description: 'Audits reviewable local vault write intents emitted by permission-scoped plugins.',
    permissions: [],
  },
]

export function renderVaultPluginBlocks(markdown: string, notes: VaultNote[], currentId?: string): string {
  if (!markdown.includes('```claw-plugin')) return markdown
  const installedPlugins = installedVaultPlugins(notes)
  const rendered = markdown.replace(/```claw-plugin\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    const config = parseVaultPluginConfig(source)
    if (!config.plugin) return '> Local plugin block is missing a plugin id.'
    const plugin = installedPlugins.find(plugin => plugin.id === config.plugin)
    if (!plugin) {
      return `> Local plugin is not installed: ${escapeMarkdown(config.plugin)}`
    }
    if (config.plugin === 'vault.stats') return renderStatsPlugin(notes, config)
    if (config.plugin === 'vault.recent') return renderRecentPlugin(notes, config, currentId)
    if (config.plugin === 'vault.tags') return renderTagsPlugin(notes, config)
    if (config.plugin === 'vault.plugins') return renderPluginRegistryPlugin(notes, config)
    if (config.plugin === 'vault.marketplace') return renderPluginMarketplacePlugin(notes, config)
    if (config.plugin === 'vault.plugin-writes') return renderPluginWriteReviewPlugin(notes, config)
    if (plugin.template) return renderTemplatePlugin(notes, config, plugin, currentId)
    if (plugin.runtime) return renderRuntimePlugin(notes, config, plugin, currentId)
    return `> Local plugin is not available: ${escapeMarkdown(config.plugin)}`
  })
  return renderVaultPluginWriteBlocks(rendered)
}

export function installedVaultPlugins(notes: VaultNote[]): VaultPluginDefinition[] {
  return buildVaultPluginRegistry(notes)
    .filter(entry => entry.enabled)
    .map(entry => entry.plugin)
}

export function buildVaultPluginCommandContributions(notes: VaultNote[]): VaultPluginCommandContribution[] {
  return installedVaultPlugins(notes)
    .flatMap(plugin =>
      (plugin.commands ?? []).map(command => {
        const title = command.config?.title ?? command.name ?? plugin.label
        return {
          id: `vault-plugin-command:${plugin.id}:${command.id}`,
          pluginId: plugin.id,
          pluginLabel: plugin.label,
          label: command.name,
          detail: command.description || plugin.description || plugin.id,
          config: {
            ...command.config,
            plugin: plugin.id,
            title,
          },
        }
      }),
    )
    .slice(0, 50)
}

export function buildVaultPluginRegistry(notes: VaultNote[]): VaultPluginRegistryEntry[] {
  const registry = new Map<string, VaultPluginRegistryEntry>()
  for (const plugin of LOCAL_VAULT_PLUGINS) {
    registry.set(plugin.id, {
      plugin: { ...plugin, enabled: true },
      source: 'built-in',
      enabled: true,
      permissions: plugin.permissions ?? [],
      checksum: vaultPluginManifestChecksum(plugin),
      integrity: 'built-in',
    })
  }
  for (const note of notes) {
    if (note.type !== 'note' || isTrashed(note)) continue
    for (const manifest of parseVaultPluginManifests(note.content)) {
      registry.set(manifest.id, {
        plugin: manifest,
        source: 'vault',
        sourceNoteId: note._id,
        sourceTitle: note.title,
        enabled: manifest.enabled !== false,
        permissions: manifest.permissions ?? [],
        checksum: manifest.checksum ?? vaultPluginManifestChecksum(manifest),
        expectedChecksum: manifest.expectedChecksum,
        integrity: manifest.integrity ?? 'unsigned',
      })
    }
  }
  return [...registry.values()].sort((left, right) => {
    if (left.source !== right.source) return left.source === 'built-in' ? -1 : 1
    return left.plugin.id.localeCompare(right.plugin.id)
  })
}

export function buildVaultPluginMarketplacePackages(notes: VaultNote[]): VaultPluginMarketplacePackage[] {
  const packages: VaultPluginMarketplacePackage[] = []
  for (const note of notes) {
    if (note.type !== 'note' || isTrashed(note)) continue
    packages.push(
      ...parseVaultPluginPackages(note.content).map(pkg => ({
        ...pkg,
        sourceNoteId: note._id,
        sourceTitle: note.title,
      })),
    )
  }
  return packages.sort((left, right) => {
    if (left.plugin.id !== right.plugin.id) return left.plugin.id.localeCompare(right.plugin.id)
    return (right.plugin.version ?? '').localeCompare(left.plugin.version ?? '')
  })
}

export function buildVaultPluginTrustedPublishers(notes: VaultNote[]): VaultPluginTrustedPublisher[] {
  const publishers: VaultPluginTrustedPublisher[] = []
  for (const note of notes) {
    if (note.type !== 'note' || isTrashed(note)) continue
    publishers.push(
      ...parseVaultPluginTrustedPublishers(note.content).map(publisher => ({
        ...publisher,
        sourceNoteId: note._id,
        sourceTitle: note.title,
      })),
    )
  }
  return publishers.sort((left, right) => {
    if (left.signer !== right.signer) return left.signer.localeCompare(right.signer)
    return left.keyId.localeCompare(right.keyId)
  })
}

export function buildVaultPluginDataRecords(notes: VaultNote[]): VaultPluginDataRecord[] {
  const records: VaultPluginDataRecord[] = []
  const liveNotes = notes
    .filter(note => note.type === 'note' && !isTrashed(note))
    .sort((left, right) => left.updated_at - right.updated_at || left._id.localeCompare(right._id))
  for (const note of liveNotes) {
    records.push(
      ...parseVaultPluginDataBlocks(note.content).map(record => ({
        ...record,
        sourceNoteId: note._id,
        sourceTitle: note.title,
      })),
    )
  }
  return records
}

export function buildVaultPluginDataStore(notes: VaultNote[]): Readonly<Record<string, unknown>> {
  const store: Record<string, unknown> = {}
  for (const record of buildVaultPluginDataRecords(notes)) {
    store[record.plugin] = freezePluginData(record.data)
  }
  return freezeRecord(store)
}

export function buildVaultPluginWriteRecords(notes: VaultNote[]): VaultPluginWriteRecord[] {
  const records: VaultPluginWriteRecord[] = []
  const liveNotes = notes
    .filter(note => note.type === 'note' && !isTrashed(note))
    .sort((left, right) => left.updated_at - right.updated_at || left._id.localeCompare(right._id))
  for (const note of liveNotes) {
    records.push(
      ...parseVaultPluginWriteBlocks(note.content).map(record => ({
        ...record,
        sourceNoteId: note._id,
        sourceTitle: note.title,
      })),
    )
  }
  return records
}

export function removeAppliedVaultPluginWriteBlocks(markdown: string, checksums: Iterable<string>): string {
  const appliedChecksums = new Set(checksums)
  if (appliedChecksums.size === 0 || !markdown.includes('```claw-plugin-write')) return markdown
  const next = markdown.replace(/```claw-plugin-write\s*\n([\s\S]*?)```/gi, (match: string) => {
    const records = parseVaultPluginWriteBlocks(match)
    return records.length > 0 && records.every(record => appliedChecksums.has(record.checksum)) ? '' : match
  })
  return next.replace(/\n{3,}/g, '\n\n').trimEnd()
}

export function planVaultPluginWriteApply(
  notes: VaultNote[],
  records: VaultPluginWriteRecord[],
  now = Date.now(),
): VaultPluginWriteApplyPlan {
  const nextNotes: VaultNote[] = notes.map(note => ({ ...note, tags: [...note.tags], links: [...note.links], aliases: [...(note.aliases ?? [])], properties: { ...(note.properties ?? {}) } }))
  const noteById = new Map<string, VaultNote>(nextNotes.map(note => [note._id, note]))
  const applied: VaultPluginWriteAppliedChange[] = []
  const skipped: VaultPluginWriteSkippedChange[] = []
  const checkpointNoteIds = new Set<string>()

  const skip = (record: VaultPluginWriteRecord, reason: string) => skipped.push({ record, reason })
  for (const record of records) {
    const path = sanitizePluginWritePath(record.path)
    if (!path || path !== record.path) {
      skip(record, 'unsafe path')
      continue
    }
    const existing = noteById.get(path)
    if (record.action === 'create') {
      if (noteById.has(path)) {
        skip(record, 'target exists')
        continue
      }
      const note = pluginWriteCreatedNote(record, now)
      nextNotes.push(note)
      noteById.set(note._id, note)
      applied.push({ record, noteId: note._id, nextNoteId: note._id })
      continue
    }
    if (!existing || existing.type !== 'note' || isTrashed(existing)) {
      skip(record, 'source missing')
      continue
    }
    checkpointNoteIds.add(existing._id)
    if (record.action === 'modify') {
      existing.content = record.content ?? ''
      existing.updated_at = now
      applied.push({ record, noteId: path, nextNoteId: path, checkpointNoteId: path })
      continue
    }
    if (record.action === 'trash') {
      const origin = existing.trash_origin_path ?? existing.folder ?? parentFolderPath(existing._id)
      existing.folder = origin ? `Trash/${normalizePluginPath(origin)}` : 'Trash'
      existing.trash_origin_path = origin
      existing.trashed_at = now
      existing.updated_at = now
      applied.push({ record, noteId: path, nextNoteId: path, checkpointNoteId: path })
      continue
    }
    if (record.action === 'rename') {
      const newPath = sanitizePluginWritePath(record.newPath)
      if (!newPath || newPath === path || noteById.has(newPath)) {
        skip(record, newPath === path ? 'target unchanged' : 'target exists')
        continue
      }
      noteById.delete(path)
      existing._id = newPath
      existing.folder = parentFolderPath(newPath)
      existing.title = newPath.split('/').pop()?.replace(/\.md$/i, '') || existing.title
      existing.updated_at = now
      noteById.set(newPath, existing)
      applied.push({ record, noteId: path, nextNoteId: newPath, checkpointNoteId: path })
      continue
    }
    if (record.action === 'frontmatter') {
      const frontmatter = sanitizePluginFrontmatter(record.frontmatter) ?? {}
      existing.content = applyPluginFrontmatterToContent(existing.content, frontmatter)
      existing.aliases = frontmatterValues(frontmatter.aliases)
      existing.tags = frontmatterValues(frontmatter.tags).map(tag => tag.replace(/^#/, ''))
      existing.properties = pluginWriteProperties(frontmatter)
      existing.updated_at = now
      applied.push({ record, noteId: path, nextNoteId: path, checkpointNoteId: path })
    }
  }

  return {
    notes: nextNotes,
    applied,
    skipped,
    checkpointNoteIds: [...checkpointNoteIds],
  }
}

export function parseVaultPluginManifests(markdown: string): VaultPluginDefinition[] {
  const manifests: VaultPluginDefinition[] = []
  markdown.replace(/```claw-plugin-manifest\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>
      const manifest = parseVaultPluginDefinition(parsed)
      const expectedChecksum = typeof parsed.checksum === 'string' ? normalizePluginChecksum(parsed.checksum) : undefined
      if (manifest) {
        const checksum = vaultPluginManifestChecksum(manifest)
        manifests.push({
          ...manifest,
          checksum,
          expectedChecksum,
          integrity: expectedChecksum ? (expectedChecksum === checksum ? 'verified' : 'mismatch') : 'unsigned',
        })
      }
    } catch {
      return ''
    }
    return ''
  })
  return manifests
}

export function parseVaultPluginDataBlocks(markdown: string): VaultPluginDataRecord[] {
  const records: VaultPluginDataRecord[] = []
  markdown.replace(/```claw-plugin-data\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>
      const plugin = typeof parsed.plugin === 'string' ? parsed.plugin.trim() : ''
      if (!/^local\.[a-zA-Z0-9._-]{1,80}$/.test(plugin)) return ''
      const data = sanitizePluginData(parsed.data)
      const checksum = pluginDataChecksum(plugin, data)
      const expectedChecksum = typeof parsed.checksum === 'string' ? normalizePluginChecksum(parsed.checksum) : undefined
      if (expectedChecksum && expectedChecksum !== checksum) return ''
      records.push({ plugin, data: freezePluginData(data), checksum })
    } catch {
      return ''
    }
    return ''
  })
  return records
}

export function parseVaultPluginWriteBlocks(markdown: string): VaultPluginWriteRecord[] {
  const records: VaultPluginWriteRecord[] = []
  markdown.replace(/```claw-plugin-write\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>
      const plugin = typeof parsed.plugin === 'string' ? parsed.plugin.trim() : ''
      if (!/^local\.[a-zA-Z0-9._-]{1,80}$/.test(plugin)) return ''
      const action = sanitizePluginWriteAction(parsed.action)
      const path = sanitizePluginWritePath(parsed.path)
      if (!action || !path) return ''
      const content = action === 'create' || action === 'modify' ? sanitizePluginWriteContent(parsed.content) : undefined
      if ((action === 'create' || action === 'modify') && content === undefined) return ''
      const newPath = action === 'rename' ? sanitizePluginWritePath(parsed.newPath) : undefined
      if (action === 'rename' && !newPath) return ''
      const frontmatter = action === 'frontmatter' ? sanitizePluginFrontmatter(parsed.frontmatter) : undefined
      if (action === 'frontmatter' && !frontmatter) return ''
      const record: Omit<VaultPluginWriteRecord, 'checksum'> = {
        plugin,
        action,
        path,
        content,
        newPath,
        frontmatter,
      }
      const checksum = pluginWriteChecksum(record)
      const expectedChecksum = typeof parsed.checksum === 'string' ? normalizePluginChecksum(parsed.checksum) : undefined
      if (expectedChecksum && expectedChecksum !== checksum) return ''
      records.push({ ...record, checksum })
    } catch {
      return ''
    }
    return ''
  })
  return records
}

export function parseVaultPluginTrustedPublishers(markdown: string): VaultPluginTrustedPublisher[] {
  const publishers: VaultPluginTrustedPublisher[] = []
  markdown.replace(/```claw-plugin-trust\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>
      const signer = typeof parsed.signer === 'string' ? parsed.signer.trim().slice(0, 120) : ''
      const publicKey = parseVaultPluginSignaturePublicKey(parsed.publicKey)
      const rotatedToKeyId =
        typeof parsed.rotatedToKeyId === 'string' ? parsed.rotatedToKeyId.trim().slice(0, 120) : undefined
      const expiresAt = typeof parsed.expiresAt === 'string' ? parsed.expiresAt.trim().slice(0, 80) : undefined
      if (signer && publicKey) {
        publishers.push({
          signer,
          publicKey,
          keyId: vaultPluginPublicKeyId(publicKey),
          revoked: parsed.revoked === true,
          rotatedToKeyId: rotatedToKeyId || undefined,
          expiresAt: expiresAt || undefined,
        })
      }
    } catch {
      return ''
    }
    return ''
  })
  return publishers
}

export function parseVaultPluginPackages(markdown: string): VaultPluginMarketplacePackage[] {
  const packages: VaultPluginMarketplacePackage[] = []
  markdown.replace(/```claw-plugin-package\s*\n([\s\S]*?)```/gi, (_match, source: string) => {
    try {
      const pkg = parseVaultPluginPackagePayload(JSON.parse(source))
      if (pkg) packages.push(pkg)
    } catch {
      return ''
    }
    return ''
  })
  return packages
}

export function parseVaultPluginMarketplaceFeed(
  payload: unknown,
  sourceUrl?: string,
): VaultPluginMarketplacePackage[] {
  const packageSources =
    Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).packages)
        ? ((payload as Record<string, unknown>).packages as unknown[])
        : []
  return packageSources
    .map(item => parseVaultPluginPackagePayload(item, sourceUrl))
    .filter((pkg): pkg is VaultPluginMarketplacePackage => Boolean(pkg))
}

export async function fetchVaultPluginMarketplaceFeed(
  url: string,
  fetchImpl: VaultPluginMarketplaceFetch = fetch,
  trustedPublishers: VaultPluginTrustedPublisher[] = [],
): Promise<VaultPluginMarketplacePackage[]> {
  const feedUrl = normalizePluginMarketplaceFeedUrl(url)
  const response = await fetchImpl(feedUrl, {
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Plugin marketplace feed returned ${response.status}`)
  const payload = await response.json()
  const packages = parseVaultPluginMarketplaceFeed(payload, feedUrl)
  return Promise.all(packages.map(pkg => verifyVaultPluginMarketplacePackageSignature(pkg, trustedPublishers)))
}

export async function verifyVaultPluginMarketplacePackageSignature(
  pkg: VaultPluginMarketplacePackage,
  trustedPublishers: VaultPluginTrustedPublisher[] = [],
): Promise<VaultPluginMarketplacePackage> {
  if (!pkg.signature?.publicKey) return pkg
  const verified = await verifyVaultPluginSignaturePayload(
    pkg.signature.publicKey,
    pkg.signature.signature,
    vaultPluginPackageSigningPayload(pkg),
  )
  const trusted = trustedPublishers.some(
    publisher =>
      vaultPluginTrustedPublisherActive(publisher) &&
      publisher.signer === pkg.signature?.signer &&
      publisher.keyId === vaultPluginPublicKeyId(pkg.signature.publicKey as JsonWebKey),
  )
  const integrity: Exclude<VaultPluginIntegrity, 'built-in'> = verified ? (trusted ? 'verified' : 'signed') : 'mismatch'
  return {
    ...pkg,
    integrity,
    plugin: {
      ...pkg.plugin,
      integrity,
    },
  }
}

function vaultPluginTrustedPublisherActive(publisher: VaultPluginTrustedPublisher): boolean {
  if (publisher.revoked) return false
  if (!publisher.expiresAt) return true
  const expiresAt = Date.parse(publisher.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

export function vaultPluginPackageSigningPayload(pkg: VaultPluginMarketplacePackage): string {
  return [
    'clawctrl-vault-plugin-package-v1',
    pkg.packageId,
    pkg.checksum,
    stablePluginManifestJson(pkg.plugin),
  ].join('\n')
}

export function vaultPluginPublicKeyId(publicKey: JsonWebKey): string {
  const normalized = parseVaultPluginSignaturePublicKey(publicKey)
  if (!normalized) return ''
  return `p256:${normalized.x}.${normalized.y}`
}

export function vaultPluginMarketplacePackagesMarkdown(packages: VaultPluginMarketplacePackage[]): string {
  return packages
    .map(pkg =>
      [
        '```claw-plugin-package',
        JSON.stringify(vaultPluginPackageBlockPayload(pkg), null, 2),
        '```',
      ].join('\n'),
    )
    .join('\n\n')
}

export function parseVaultPluginConfig(source: string): VaultPluginConfig {
  try {
    const parsed = JSON.parse(source) as Record<string, unknown>
    return {
      plugin: typeof parsed.plugin === 'string' ? parsed.plugin : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      query: typeof parsed.query === 'string' ? parsed.query : undefined,
      limit: clampLimit(parsed.limit),
      includeDisabled: parsed.includeDisabled === true,
    }
  } catch {
    const plugin = source.trim()
    return { plugin: plugin || undefined, limit: 10 }
  }
}

function vaultPluginMetrics(notes: VaultNote[]) {
  const live = notes.filter(note => !isTrashed(note))
  const taskTotals = live.reduce(
    (totals, note) => {
      if (note.type !== 'note') return totals
      for (const line of note.content.split('\n')) {
        const match = line.match(/^\s*[-*]\s+\[( |x|X)\]/)
        if (!match) continue
        totals.total += 1
        if (match[1].toLowerCase() === 'x') totals.done += 1
      }
      return totals
    },
    { done: 0, total: 0 },
  )
  const tags = new Set(live.flatMap(note => note.tags))
  return {
    live,
    noteCount: live.filter(note => note.type === 'note').length,
    attachmentCount: live.filter(note => note.type === 'attachment').length,
    tagCount: tags.size,
    taskDone: taskTotals.done,
    taskTotal: taskTotals.total,
    trashCount: notes.filter(isTrashed).length,
  }
}

function renderStatsPlugin(notes: VaultNote[], config: VaultPluginConfig): string {
  const metrics = vaultPluginMetrics(notes)
  return [
    heading(config.title ?? 'Vault stats'),
    '| Metric | Value |',
    '| --- | --- |',
    `| Notes | ${metrics.noteCount} |`,
    `| Attachments | ${metrics.attachmentCount} |`,
    `| Tags | ${metrics.tagCount} |`,
    `| Tasks | ${metrics.taskDone}/${metrics.taskTotal} |`,
    `| Trash | ${metrics.trashCount} |`,
  ].join('\n')
}

function renderRecentPlugin(notes: VaultNote[], config: VaultPluginConfig, currentId?: string): string {
  const rows = buildVaultDataRows(notes, config.query ?? '')
    .filter(row => row.id !== currentId && !row.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, config.limit ?? 10)
  if (rows.length === 0) return '> No matching local notes.'
  return [
    heading(config.title ?? 'Recent notes'),
    ...rows.map(
      row => `- [[${row.id}|${escapeMarkdown(row.title)}]]${row.folder ? ` · ${escapeMarkdown(row.folder)}` : ''}`,
    ),
  ].join('\n')
}

function renderTagsPlugin(notes: VaultNote[], config: VaultPluginConfig): string {
  const counts = new Map<string, number>()
  for (const note of notes) {
    if (isTrashed(note)) continue
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, config.limit ?? 20)
  if (rows.length === 0) return '> No local tags.'
  return [heading(config.title ?? 'Tags'), ...rows.map(([tag, count]) => `- #${escapeMarkdown(tag)} (${count})`)].join(
    '\n',
  )
}

function renderPluginRegistryPlugin(notes: VaultNote[], config: VaultPluginConfig): string {
  const rows = buildVaultPluginRegistry(notes)
    .filter(entry => config.includeDisabled || entry.enabled)
    .slice(0, config.limit ?? 50)
  if (rows.length === 0) return '> No local plugins.'
  return [
    heading(config.title ?? 'Plugin registry'),
    VAULT_PLUGIN_SCOPE_NOTICE,
    '',
    '| Plugin | State | Integrity | Source | Permissions |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(entry => {
      const source =
        entry.source === 'built-in'
          ? 'built-in'
          : entry.sourceNoteId
            ? `[[${entry.sourceNoteId}|${escapeMarkdown(entry.sourceTitle ?? entry.sourceNoteId)}]]`
            : 'vault'
      return [
        `\`${escapeMarkdown(entry.plugin.id)}\` ${escapeMarkdown(entry.plugin.label)}`,
        entry.enabled ? 'enabled' : 'disabled',
        pluginIntegrityLabel(entry),
        source,
        entry.permissions.length ? entry.permissions.map(permission => `\`${permission}\``).join(', ') : 'none',
      ].join(' | ')
    }).map(row => `| ${row} |`),
  ].join('\n')
}

function renderPluginMarketplacePlugin(notes: VaultNote[], config: VaultPluginConfig): string {
  const rows = buildVaultPluginRegistry(notes)
    .filter(entry => config.includeDisabled || entry.enabled)
    .slice(0, config.limit ?? 50)
  const packages = buildVaultPluginMarketplacePackages(notes).slice(0, config.limit ?? 50)
  if (rows.length === 0 && packages.length === 0) return '> No local marketplace plugins.'
  const installedById = new Map(rows.map(entry => [entry.plugin.id, entry]))
  return [
    heading(config.title ?? 'Plugin marketplace'),
    VAULT_PLUGIN_SCOPE_NOTICE,
    '',
    '| Plugin | Version | Trust | Compatibility | Install |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(entry => {
      const plugin = entry.plugin
      const trust = pluginIntegrityLabel(entry)
      const compatibility = plugin.apiVersion
        ? `API ${escapeMarkdown(plugin.apiVersion)}${plugin.minAppVersion ? ` · app ${escapeMarkdown(plugin.minAppVersion)}+` : ''}`
        : entry.source === 'built-in'
          ? 'built-in'
          : 'unspecified'
      const install =
        entry.source === 'built-in'
          ? 'built-in'
          : `\`${escapeMarkdown(JSON.stringify({ plugin: plugin.id, title: plugin.label }))}\``
      const label = [
        `\`${escapeMarkdown(plugin.id)}\` ${escapeMarkdown(plugin.label)}`,
        plugin.description ? `<br>${escapeMarkdown(plugin.description)}` : '',
        plugin.author ? `<br>by ${escapeMarkdown(plugin.author)}` : '',
        plugin.keywords?.length ? `<br>${plugin.keywords.map(keyword => `#${escapeMarkdown(keyword)}`).join(' ')}` : '',
      ].join('')
      return [
        label,
        escapeMarkdown(plugin.version ?? 'local'),
        trust,
        compatibility,
        install,
      ].join(' | ')
    }).map(row => `| ${row} |`),
    ...packages.map(pkg => {
      const installed = installedById.get(pkg.plugin.id)
      const compatibility = pkg.plugin.apiVersion
        ? `API ${escapeMarkdown(pkg.plugin.apiVersion)}${pkg.plugin.minAppVersion ? ` · app ${escapeMarkdown(pkg.plugin.minAppVersion)}+` : ''}`
        : 'unspecified'
      const source = pkg.sourceNoteId
        ? `[[${pkg.sourceNoteId}|${escapeMarkdown(pkg.sourceTitle ?? pkg.sourceNoteId)}]]`
        : pkg.sourceUrl
          ? escapeMarkdown(pkg.sourceUrl)
          : 'feed'
      const state = installed
        ? installed.checksum === pkg.checksum
          ? 'installed'
          : 'update'
        : 'install'
      const label = [
        `\`${escapeMarkdown(pkg.plugin.id)}\` ${escapeMarkdown(pkg.plugin.label)}`,
        pkg.plugin.description ? `<br>${escapeMarkdown(pkg.plugin.description)}` : '',
        pkg.plugin.author ? `<br>by ${escapeMarkdown(pkg.plugin.author)}` : '',
        `<br>source: ${source}`,
      ].join('')
      return `| ${label} | ${escapeMarkdown(pkg.plugin.version ?? 'package')} | ${pluginIntegrityText(pkg.integrity, pkg.checksum)} | ${compatibility} | ${state} below |`
    }),
    ...packages.flatMap(pkg => [
      '',
      `#### ${escapeMarkdown(pkg.plugin.label)} ${installedById.get(pkg.plugin.id)?.checksum === pkg.checksum ? 'installed package' : 'install package'}`,
      '```claw-plugin-manifest',
      JSON.stringify(vaultPluginInstallManifest(pkg.plugin), null, 2),
      '```',
    ]),
  ].join('\n')
}

function renderPluginWriteReviewPlugin(notes: VaultNote[], config: VaultPluginConfig): string {
  const rows = buildVaultPluginWriteRecords(notes).slice(0, config.limit ?? 50)
  if (rows.length === 0) return '> No pending plugin write requests.'
  return [
    heading(config.title ?? 'Plugin write review'),
    '| Plugin | Action | Path | Details | Source | Checksum |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => renderPluginWriteRecordTableRow(row)),
  ].join('\n')
}

function renderVaultPluginWriteBlocks(markdown: string): string {
  return markdown.replace(/```claw-plugin-write\s*\n([\s\S]*?)```/gi, (match: string) => {
    const rows = parseVaultPluginWriteBlocks(match)
    if (rows.length === 0) return '> Invalid or tampered plugin write request.'
    return [
      heading('Plugin write request'),
      '| Plugin | Action | Path | Details | Checksum |',
      '| --- | --- | --- | --- | --- |',
      ...rows.map(row => renderPluginWriteRecordTableRow(row, false)),
    ].join('\n')
  })
}

function renderPluginWriteRecordTableRow(row: VaultPluginWriteRecord, includeSource = true): string {
  const details =
    row.action === 'rename'
      ? `to \`${escapeMarkdown(row.newPath ?? '')}\``
      : row.action === 'frontmatter'
        ? Object.keys(row.frontmatter ?? {}).sort().map(key => `\`${escapeMarkdown(key)}\``).join(', ') || 'no keys'
        : row.action === 'create' || row.action === 'modify'
          ? `${row.content?.length ?? 0} chars`
          : 'move to Trash'
  const cells = [
    `\`${escapeMarkdown(row.plugin)}\``,
    `\`${row.action}\``,
    `\`${escapeMarkdown(row.path)}\``,
    details,
  ]
  if (includeSource) {
    cells.push(
      row.sourceNoteId
        ? `[[${row.sourceNoteId}|${escapeMarkdown(row.sourceTitle ?? row.sourceNoteId)}]]`
        : 'inline',
    )
  }
  cells.push(`\`${row.checksum}\``)
  return `| ${cells.join(' | ')} |`
}

function renderTemplatePlugin(
  notes: VaultNote[],
  config: VaultPluginConfig,
  plugin: VaultPluginDefinition,
  currentId?: string,
): string {
  const metrics = vaultPluginMetrics(notes)
  const recentRows = buildVaultDataRows(notes, config.query ?? '')
    .filter(row => row.id !== currentId && !row.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, config.limit ?? 10)
  const tagRows = [...metrics.live.flatMap(note => note.tags).reduce((counts, tag) => {
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return counts
  }, new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, config.limit ?? 20)
  const replacements: Record<string, string> = {
    title: config.title ?? '',
    noteCount: permittedPluginValue(plugin, 'read:vault-stats', String(metrics.noteCount)),
    attachmentCount: permittedPluginValue(plugin, 'read:vault-stats', String(metrics.attachmentCount)),
    tagCount: permittedPluginValue(plugin, 'read:vault-stats', String(metrics.tagCount)),
    taskDone: permittedPluginValue(plugin, 'read:vault-stats', String(metrics.taskDone)),
    taskTotal: permittedPluginValue(plugin, 'read:vault-stats', String(metrics.taskTotal)),
    trashCount: permittedPluginValue(plugin, 'read:vault-stats', String(metrics.trashCount)),
    recentList: permittedPluginValue(
      plugin,
      'read:recent-notes',
      recentRows.map(row => `- [[${row.id}|${escapeMarkdown(row.title)}]]`).join('\n'),
    ),
    tagList: permittedPluginValue(
      plugin,
      'read:tags',
      tagRows.map(([tag, count]) => `- #${escapeMarkdown(tag)} (${count})`).join('\n'),
    ),
  }
  return (plugin.template ?? '').replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => replacements[key] ?? '',
  )
}

function renderRuntimePlugin(
  notes: VaultNote[],
  config: VaultPluginConfig,
  plugin: VaultPluginDefinition,
  currentId?: string,
): string {
  const result = runVaultPluginRuntime(notes, config, plugin, currentId)
  if (!result.ok) return `> Local plugin blocked: ${escapeMarkdown(result.error)}`
  return result.markdown
}

export function runVaultPluginRuntime(
  notes: VaultNote[],
  config: VaultPluginConfig,
  plugin: VaultPluginDefinition,
  currentId?: string,
): { ok: true; markdown: string } | { ok: false; error: string } {
  if (!plugin.runtime) return { ok: false, error: 'missing runtime' }
  if (plugin.runtime.language !== 'claw-script') return { ok: false, error: 'unsupported runtime' }
  const unsafeToken = findBlockedRuntimeToken(plugin.runtime.code)
  if (unsafeToken) return { ok: false, error: `blocked token "${unsafeToken}"` }

  const metrics = vaultPluginMetrics(notes)
  const recentRows = permittedPluginData(plugin, 'read:recent-notes')
    ? buildVaultDataRows(notes, config.query ?? '')
        .filter(row => row.id !== currentId && !row.trashed)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, config.limit ?? 10)
        .map(row => ({
          id: row.id,
          title: row.title,
          folder: row.folder,
          tags: [...row.tags],
          updatedAt: row.updatedAt,
        }))
    : []
  const tagRows = permittedPluginData(plugin, 'read:tags')
    ? [...metrics.live.flatMap(note => note.tags).reduce((counts, tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
        return counts
      }, new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, config.limit ?? 20)
        .map(([tag, count]) => ({ tag, count }))
    : []
  const stats = permittedPluginData(plugin, 'read:vault-stats')
    ? {
        noteCount: metrics.noteCount,
        attachmentCount: metrics.attachmentCount,
        tagCount: metrics.tagCount,
        taskDone: metrics.taskDone,
        taskTotal: metrics.taskTotal,
        trashCount: metrics.trashCount,
      }
    : null

  const api = Object.freeze({
    heading,
    metricTable: (rows: Array<[string, string | number]>) =>
      ['| Metric | Value |', '| --- | --- |', ...rows.map(([label, value]) => `| ${escapeMarkdown(String(label))} | ${escapeMarkdown(String(value))} |`)].join(
        '\n',
      ),
    recentList: () => recentRows.map(row => `- [[${row.id}|${escapeMarkdown(row.title)}]]`).join('\n'),
    tagList: () => tagRows.map(row => `- #${escapeMarkdown(row.tag)} (${row.count})`).join('\n'),
    MarkdownView: OBSIDIAN_MARKDOWN_VIEW,
    WorkspaceLeaf: OBSIDIAN_WORKSPACE_LEAF,
    TAbstractFile: OBSIDIAN_TABSTRACT_FILE,
    TFile: OBSIDIAN_TFILE,
    TFolder: OBSIDIAN_TFOLDER,
    Vault: OBSIDIAN_VAULT,
    DataAdapter: OBSIDIAN_DATA_ADAPTER,
    MetadataCache: OBSIDIAN_METADATA_CACHE,
    Workspace: OBSIDIAN_WORKSPACE,
    FileManager: OBSIDIAN_FILE_MANAGER,
    Notice: OBSIDIAN_NOTICE,
    Platform: OBSIDIAN_PLATFORM,
    Component: OBSIDIAN_COMPONENT,
    Plugin: OBSIDIAN_PLUGIN,
    PluginSettingTab: OBSIDIAN_PLUGIN_SETTING_TAB,
    Setting: OBSIDIAN_SETTING,
    TextComponent: OBSIDIAN_TEXT_COMPONENT,
    TextAreaComponent: OBSIDIAN_TEXT_AREA_COMPONENT,
    SearchComponent: OBSIDIAN_SEARCH_COMPONENT,
    ToggleComponent: OBSIDIAN_TOGGLE_COMPONENT,
    DropdownComponent: OBSIDIAN_DROPDOWN_COMPONENT,
    ButtonComponent: OBSIDIAN_BUTTON_COMPONENT,
    ExtraButtonComponent: OBSIDIAN_EXTRA_BUTTON_COMPONENT,
    Menu: OBSIDIAN_MENU,
    MenuItem: OBSIDIAN_MENU_ITEM,
    Modal: OBSIDIAN_MODAL,
    FuzzySuggestModal: OBSIDIAN_FUZZY_SUGGEST_MODAL,
    MarkdownRenderer: OBSIDIAN_MARKDOWN_RENDERER,
    normalizePath: normalizePluginPath,
    parseLinktext: parseObsidianLinktext,
    splitSubpath: splitObsidianSubpath,
    getLinkpath: getObsidianLinkpath,
    getAllTags: getAllObsidianTags,
    app: buildObsidianPluginAppFacade(notes, plugin, currentId),
  })
  const context = Object.freeze({
    title: config.title ?? plugin.label,
    limit: config.limit ?? 10,
    query: config.query ?? '',
    stats,
    recent: Object.freeze(recentRows),
    tags: Object.freeze(tagRows),
  })

  try {
    const render = new Function(
      'api',
      'context',
      `"use strict"; const { heading, metricTable, recentList, tagList, app, MarkdownView, WorkspaceLeaf, TAbstractFile, TFile, TFolder, Vault, DataAdapter, MetadataCache, Workspace, FileManager, Notice, Platform, Component, Plugin, PluginSettingTab, Setting, TextComponent, TextAreaComponent, SearchComponent, ToggleComponent, DropdownComponent, ButtonComponent, ExtraButtonComponent, Menu, MenuItem, Modal, FuzzySuggestModal, MarkdownRenderer, normalizePath, parseLinktext, splitSubpath, getLinkpath, getAllTags } = api; const { title, limit, query, stats, recent, tags } = context; ${plugin.runtime.code}`,
    ) as (runtimeApi: typeof api, runtimeContext: typeof context) => unknown
    const output = render(api, context)
    if (typeof output !== 'string') return { ok: false, error: 'runtime must return markdown text' }
    return { ok: true, markdown: output.slice(0, 8000) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'runtime failed' }
  }
}

interface ObsidianPluginFile {
  vault: { getName: () => string }
  path: string
  basename: string
  name: string
  extension: 'md'
  parent: ObsidianPluginFolder | null
  stat: {
    ctime: number
    mtime: number
    size: number
  }
}

interface ObsidianPluginFolder {
  vault: { getName: () => string }
  path: string
  name: string
  parent: ObsidianPluginFolder | null
  children: Array<ObsidianPluginFile | ObsidianPluginFolder>
  isRoot: () => boolean
}

const OBSIDIAN_TFILE = Object.freeze(
  class TFile {
    static [Symbol.hasInstance](value: unknown) {
      return isObsidianPluginFile(value)
    }
  },
)

const OBSIDIAN_TFOLDER = Object.freeze(
  class TFolder {
    static [Symbol.hasInstance](value: unknown) {
      return isObsidianPluginFolder(value)
    }
  },
)

const OBSIDIAN_TABSTRACT_FILE = Object.freeze(
  class TAbstractFile {
    static [Symbol.hasInstance](value: unknown) {
      return isObsidianPluginFile(value) || isObsidianPluginFolder(value)
    }
  },
)

const OBSIDIAN_VAULT = Object.freeze(
  class Vault {
    static [Symbol.hasInstance](value: unknown) {
      return (
        isRecord(value) &&
        typeof value.getName === 'function' &&
        typeof value.getFiles === 'function' &&
        typeof value.getAbstractFileByPath === 'function' &&
        isRecord(value.adapter)
      )
    }
  },
)

const OBSIDIAN_DATA_ADAPTER = Object.freeze(
  class DataAdapter {
    static [Symbol.hasInstance](value: unknown) {
      return (
        isRecord(value) &&
        typeof value.list === 'function' &&
        typeof value.exists === 'function' &&
        typeof value.read === 'function' &&
        typeof value.stat === 'function'
      )
    }
  },
)

const OBSIDIAN_METADATA_CACHE = Object.freeze(
  class MetadataCache {
    static [Symbol.hasInstance](value: unknown) {
      return (
        isRecord(value) &&
        typeof value.getFileCache === 'function' &&
        typeof value.getFirstLinkpathDest === 'function' &&
        typeof value.getBacklinksForFile === 'function'
      )
    }
  },
)

const OBSIDIAN_WORKSPACE = Object.freeze(
  class Workspace {
    static [Symbol.hasInstance](value: unknown) {
      return (
        isRecord(value) &&
        typeof value.getActiveFile === 'function' &&
        typeof value.getLeaf === 'function' &&
        typeof value.openFile === 'function' &&
        typeof value.iterateAllLeaves === 'function'
      )
    }
  },
)

const OBSIDIAN_FILE_MANAGER = Object.freeze(
  class FileManager {
    static [Symbol.hasInstance](value: unknown) {
      return (
        isRecord(value) &&
        typeof value.getNewFileParent === 'function' &&
        typeof value.fileToLinktext === 'function' &&
        typeof value.generateMarkdownLink === 'function'
      )
    }
  },
)

const OBSIDIAN_MARKDOWN_VIEW = Object.freeze(
  class MarkdownView {
    static readonly viewType = 'markdown'

    static [Symbol.hasInstance](value: unknown) {
      return isRecord(value) && isObsidianPluginFile(value.file) && typeof value.getViewType === 'function'
    }
  },
)

const OBSIDIAN_WORKSPACE_LEAF = Object.freeze(
  class WorkspaceLeaf {
    static [Symbol.hasInstance](value: unknown) {
      return isObsidianWorkspaceLeaf(value)
    }
  },
)

const OBSIDIAN_NOTICE = Object.freeze(
  class Notice {
    readonly message: string
    readonly timeout: number

    constructor(message: unknown, timeout = 5000) {
      this.message = String(message ?? '')
      this.timeout = Math.max(0, Math.trunc(Number(timeout) || 0))
    }

    hide() {
      return undefined
    }
  },
)

const OBSIDIAN_PLATFORM = Object.freeze({
  isDesktop: true,
  isDesktopApp: true,
  isMobile: false,
  isMobileApp: false,
  isMacOS: true,
  isWin: false,
  isLinux: false,
})

const OBSIDIAN_COMPONENT = Object.freeze(
  class Component {
    readonly children: unknown[] = []
    readonly events: unknown[] = []

    load() {
      return undefined
    }

    unload() {
      return undefined
    }

    addChild(child: unknown) {
      this.children.push(child)
      return child
    }

    removeChild(child: unknown) {
      const index = this.children.indexOf(child)
      if (index >= 0) this.children.splice(index, 1)
      return child
    }

    register(dispose: unknown) {
      this.events.push(dispose)
      return dispose
    }

    registerEvent(ref: unknown) {
      this.events.push(ref)
      return ref
    }

    registerInterval(id: unknown) {
      this.events.push(id)
      return id
    }

    registerDomEvent(_el: unknown, type: unknown, callback: unknown, options?: unknown) {
      const ref = Object.freeze({ type: String(type ?? ''), callback, options })
      return this.register(ref)
    }
  },
)

const OBSIDIAN_PLUGIN = Object.freeze(
  class Plugin extends OBSIDIAN_COMPONENT {
    readonly app: unknown
    readonly manifest: Record<string, unknown>

    constructor(app: unknown, manifest: Record<string, unknown> = {}) {
      super()
      this.app = app
      this.manifest = Object.freeze({ ...manifest })
    }

    addCommand(command: unknown) {
      return command
    }

    addRibbonIcon(_icon: string, _title: string, callback?: unknown) {
      return Object.freeze({ onClick: typeof callback === 'function' ? callback : () => undefined })
    }

    addSettingTab(tab: unknown) {
      return tab
    }

    registerMarkdownPostProcessor(processor: unknown) {
      return this.register(processor)
    }

    registerExtensions(extensions: unknown, viewType = 'markdown') {
      const ref = Object.freeze({ extensions, viewType: String(viewType ?? 'markdown') })
      return this.register(ref)
    }

    registerEditorExtension(extension: unknown) {
      return this.register(Object.freeze({ extension, viewType: 'markdown' }))
    }

    registerView(type: unknown, creator: unknown) {
      return this.register(Object.freeze({ type: String(type ?? ''), creator }))
    }

    addStatusBarItem() {
      return mutablePluginEl()
    }
  },
)

const OBSIDIAN_PLUGIN_SETTING_TAB = Object.freeze(
  class PluginSettingTab {
    readonly app: unknown
    readonly plugin: unknown
    readonly containerEl = Object.freeze({})

    constructor(app: unknown, plugin: unknown) {
      this.app = app
      this.plugin = plugin
    }

    display() {
      return undefined
    }

    hide() {
      return undefined
    }
  },
)

const OBSIDIAN_TEXT_COMPONENT = Object.freeze(
  class TextComponent {
    readonly inputEl = mutablePluginEl()
    readonly containerEl: unknown
    value = ''
    placeholder = ''
    disabled = false
    private changeHandler: ((value: string) => unknown) | null = null

    constructor(containerEl?: unknown) {
      this.containerEl = containerEl ?? null
    }

    setValue(value: unknown) {
      this.value = String(value ?? '')
      return this
    }

    getValue() {
      return this.value
    }

    setPlaceholder(placeholder: unknown) {
      this.placeholder = String(placeholder ?? '')
      return this
    }

    setDisabled(disabled: unknown) {
      this.disabled = disabled === true
      return this
    }

    onChange(handler: unknown) {
      this.changeHandler = typeof handler === 'function' ? (handler as (value: string) => unknown) : null
      return this
    }

    triggerChange(value: unknown) {
      this.setValue(value)
      this.changeHandler?.(this.value)
      return this
    }
  },
)

const OBSIDIAN_TEXT_AREA_COMPONENT = Object.freeze(
  class TextAreaComponent extends OBSIDIAN_TEXT_COMPONENT {
    readonly inputEl = mutablePluginEl()
  },
)

const OBSIDIAN_SEARCH_COMPONENT = Object.freeze(
  class SearchComponent extends OBSIDIAN_TEXT_COMPONENT {
    readonly inputEl = mutablePluginEl()
  },
)

const OBSIDIAN_TOGGLE_COMPONENT = Object.freeze(
  class ToggleComponent {
    readonly toggleEl = mutablePluginEl()
    readonly containerEl: unknown
    value = false
    disabled = false
    private changeHandler: ((value: boolean) => unknown) | null = null

    constructor(containerEl?: unknown) {
      this.containerEl = containerEl ?? null
    }

    setValue(value: unknown) {
      this.value = value === true
      return this
    }

    getValue() {
      return this.value
    }

    setDisabled(disabled: unknown) {
      this.disabled = disabled === true
      return this
    }

    onChange(handler: unknown) {
      this.changeHandler = typeof handler === 'function' ? (handler as (value: boolean) => unknown) : null
      return this
    }

    triggerChange(value: unknown) {
      this.setValue(value)
      this.changeHandler?.(this.value)
      return this
    }
  },
)

const OBSIDIAN_DROPDOWN_COMPONENT = Object.freeze(
  class DropdownComponent {
    readonly selectEl = mutablePluginEl()
    readonly containerEl: unknown
    readonly options: Record<string, string> = {}
    value = ''
    disabled = false
    private changeHandler: ((value: string) => unknown) | null = null

    constructor(containerEl?: unknown) {
      this.containerEl = containerEl ?? null
    }

    addOption(value: unknown, label: unknown) {
      this.options[String(value ?? '')] = String(label ?? '')
      return this
    }

    addOptions(options: Record<string, unknown>) {
      Object.entries(options ?? {}).forEach(([value, label]) => this.addOption(value, label))
      return this
    }

    setValue(value: unknown) {
      this.value = String(value ?? '')
      return this
    }

    getValue() {
      return this.value
    }

    setDisabled(disabled: unknown) {
      this.disabled = disabled === true
      return this
    }

    onChange(handler: unknown) {
      this.changeHandler = typeof handler === 'function' ? (handler as (value: string) => unknown) : null
      return this
    }

    triggerChange(value: unknown) {
      this.setValue(value)
      this.changeHandler?.(this.value)
      return this
    }
  },
)

const OBSIDIAN_BUTTON_COMPONENT = Object.freeze(
  class ButtonComponent {
    readonly buttonEl = mutablePluginEl()
    readonly containerEl: unknown
    buttonText = ''
    icon = ''
    tooltip = ''
    cta = false
    disabled = false
    private clickHandler: (() => unknown) | null = null

    constructor(containerEl?: unknown) {
      this.containerEl = containerEl ?? null
    }

    setButtonText(value: unknown) {
      this.buttonText = String(value ?? '')
      return this
    }

    setIcon(value: unknown) {
      this.icon = String(value ?? '')
      return this
    }

    setTooltip(value: unknown) {
      this.tooltip = String(value ?? '')
      return this
    }

    setCta() {
      this.cta = true
      return this
    }

    setDisabled(disabled: unknown) {
      this.disabled = disabled === true
      return this
    }

    onClick(handler: unknown) {
      this.clickHandler = typeof handler === 'function' ? (handler as () => unknown) : null
      return this
    }

    trigger() {
      if (!this.disabled) this.clickHandler?.()
      return this
    }
  },
)

const OBSIDIAN_EXTRA_BUTTON_COMPONENT = Object.freeze(
  class ExtraButtonComponent extends OBSIDIAN_BUTTON_COMPONENT {
    readonly extraSettingsEl = mutablePluginEl()
  },
)

const OBSIDIAN_SETTING = Object.freeze(
  class Setting {
    readonly containerEl: unknown
    name = ''
    desc = ''

    constructor(containerEl: unknown) {
      this.containerEl = containerEl
    }

    setName(name: unknown) {
      this.name = String(name ?? '')
      return this
    }

    setDesc(desc: unknown) {
      this.desc = String(desc ?? '')
      return this
    }

    addText(callback?: (component: InstanceType<typeof OBSIDIAN_TEXT_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_TEXT_COMPONENT(this.containerEl))
      return this
    }

    addToggle(callback?: (component: InstanceType<typeof OBSIDIAN_TOGGLE_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_TOGGLE_COMPONENT(this.containerEl))
      return this
    }

    addTextArea(callback?: (component: InstanceType<typeof OBSIDIAN_TEXT_AREA_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_TEXT_AREA_COMPONENT(this.containerEl))
      return this
    }

    addSearch(callback?: (component: InstanceType<typeof OBSIDIAN_SEARCH_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_SEARCH_COMPONENT(this.containerEl))
      return this
    }

    addDropdown(callback?: (component: InstanceType<typeof OBSIDIAN_DROPDOWN_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_DROPDOWN_COMPONENT(this.containerEl))
      return this
    }

    addButton(callback?: (component: InstanceType<typeof OBSIDIAN_BUTTON_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_BUTTON_COMPONENT(this.containerEl))
      return this
    }

    addExtraButton(callback?: (component: InstanceType<typeof OBSIDIAN_EXTRA_BUTTON_COMPONENT>) => unknown) {
      callback?.(new OBSIDIAN_EXTRA_BUTTON_COMPONENT(this.containerEl))
      return this
    }
  },
)

const OBSIDIAN_MENU_ITEM = Object.freeze(
  class MenuItem {
    title = ''
    icon = ''
    checked = false
    disabled = false
    private clickHandler: (() => unknown) | null = null

    setTitle(title: unknown) {
      this.title = String(title ?? '')
      return this
    }

    setIcon(icon: unknown) {
      this.icon = String(icon ?? '')
      return this
    }

    setChecked(checked: unknown) {
      this.checked = checked === true
      return this
    }

    setDisabled(disabled: unknown) {
      this.disabled = disabled === true
      return this
    }

    onClick(callback: unknown) {
      this.clickHandler = typeof callback === 'function' ? (callback as () => unknown) : null
      return this
    }

    trigger() {
      if (!this.disabled) this.clickHandler?.()
      return undefined
    }
  },
)

const OBSIDIAN_MENU = Object.freeze(
  class Menu {
    readonly items: unknown[] = []
    shown = false
    position: { x: number; y: number } | null = null

    addItem(callback?: (item: InstanceType<typeof OBSIDIAN_MENU_ITEM>) => unknown) {
      const item = new OBSIDIAN_MENU_ITEM()
      callback?.(item)
      this.items.push(item)
      return this
    }

    addSeparator() {
      this.items.push(Object.freeze({ separator: true }))
      return this
    }

    showAtMouseEvent(event: { clientX?: number; clientY?: number } | null | undefined) {
      return this.showAtPosition({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 })
    }

    showAtPosition(position: { x?: number; y?: number } | null | undefined) {
      this.shown = true
      this.position = {
        x: Math.trunc(Number(position?.x) || 0),
        y: Math.trunc(Number(position?.y) || 0),
      }
      return this
    }

    hide() {
      this.shown = false
      return this
    }

    setNoIcon() {
      return this
    }

    setUseNativeMenu() {
      return this
    }
  },
)

const OBSIDIAN_MODAL = Object.freeze(
  class Modal {
    readonly app: unknown
    title = ''
    opened = false
    readonly containerEl = mutablePluginEl()
    readonly contentEl = mutablePluginEl()
    readonly modalEl = mutablePluginEl()

    constructor(app: unknown) {
      this.app = app
    }

    setTitle(title: unknown) {
      this.title = String(title ?? '')
      return this
    }

    open() {
      this.opened = true
      this.onOpen()
      return this
    }

    close() {
      this.opened = false
      this.onClose()
      return this
    }

    onOpen() {
      return undefined
    }

    onClose() {
      return undefined
    }
  },
)

const OBSIDIAN_FUZZY_SUGGEST_MODAL = Object.freeze(
  class FuzzySuggestModal<T = unknown> extends OBSIDIAN_MODAL {
    placeholder = ''
    instructions: readonly unknown[] = []

    setPlaceholder(placeholder: unknown) {
      this.placeholder = String(placeholder ?? '')
      return this
    }

    setInstructions(instructions: unknown[]) {
      this.instructions = Array.isArray(instructions) ? Object.freeze([...instructions]) : Object.freeze([])
      return this
    }

    getItems(): T[] {
      return []
    }

    getItemText(item: T): string {
      return String(item ?? '')
    }

    onChooseItem(_item: T, _evt?: unknown) {
      return undefined
    }

    triggerChoose(item?: T) {
      const target = item ?? this.getItems()[0]
      if (target !== undefined) this.onChooseItem(target)
      return this
    }
  },
)

const OBSIDIAN_MARKDOWN_RENDERER = Object.freeze({
  renderMarkdown: (markdown: unknown) => String(markdown ?? '').slice(0, 20_000),
  render: (_app: unknown, markdown: unknown, el?: { setText?: (text: string) => unknown }, _sourcePath?: unknown, _component?: unknown) => {
    const text = String(markdown ?? '').slice(0, 20_000)
    el?.setText?.(text)
    return text
  },
})

function mutablePluginEl() {
  return {
    text: '',
    classes: [] as string[],
    setText(text: unknown) {
      this.text = String(text ?? '')
      return this
    },
    addClass(name: unknown) {
      this.classes.push(String(name ?? ''))
      return this
    },
    remove() {
      return undefined
    },
  }
}

function buildObsidianPluginAppFacade(notes: VaultNote[], plugin: VaultPluginDefinition, currentId?: string) {
  const liveNotes = notes.filter(note => note.type === 'note' && !isTrashed(note))
  const dataStore = buildVaultPluginDataStore(notes)
  const vaultRef = Object.freeze({ getName: () => 'clawctrl Local Vault' })
  const folders = permittedPluginData(plugin, 'read:files') ? buildObsidianFolders(liveNotes, vaultRef) : []
  const folderByPath = new Map(folders.map(folder => [folder.path, folder]))
  const files = permittedPluginData(plugin, 'read:files')
    ? liveNotes.map(note => freezeObsidianFile(note, vaultRef, folderByPath.get(parentFolderPath(note._id)) ?? null))
    : []
  const fileByPath = new Map(files.map(file => [file.path, file]))
  const noteByPath = new Map(liveNotes.map(note => [note._id, note]))
  const abstractFileByPath = new Map<string, ObsidianPluginFile | ObsidianPluginFolder>([
    ...folders.map(folder => [folder.path, folder] as const),
    ...files.map(file => [file.path, file] as const),
  ])
  const rootFolder = Object.freeze({
    vault: vaultRef,
    path: '',
    name: '',
    parent: null,
    children: Object.freeze([...folders.filter(folder => !folder.path.includes('/')), ...files.filter(file => !file.path.includes('/'))]),
    isRoot: () => true,
  }) as ObsidianPluginFolder
  const fileByLink = new Map<string, ObsidianPluginFile>()
  liveNotes.forEach(note => {
    const file = fileByPath.get(note._id)
    if (!file) return
    const keys = [
      note._id,
      note._id.replace(/\.md$/i, ''),
      note.title,
      file.basename,
      ...(note.aliases ?? []),
    ]
    keys.forEach(key => {
      const normalized = normalizeObsidianLinkKey(key)
      if (normalized && !fileByLink.has(normalized)) fileByLink.set(normalized, file)
    })
  })
  const resolveLink = (link: string | null | undefined) => {
    const key = normalizeObsidianLinkKey(String(link ?? '').replace(/^#/, ''))
    return key ? fileByLink.get(key) ?? null : null
  }
  const resolvedLinks = permittedPluginData(plugin, 'read:metadata')
    ? freezeRecord(Object.fromEntries(liveNotes.map(note => [note._id, freezeRecord(resolvedLinkCounts(note, resolveLink))])))
    : Object.freeze({})
  const unresolvedLinks = permittedPluginData(plugin, 'read:metadata')
    ? freezeRecord(Object.fromEntries(liveNotes.map(note => [note._id, freezeRecord(unresolvedLinkCounts(note, resolveLink))])))
    : Object.freeze({})
  const tagCounts = permittedPluginData(plugin, 'read:metadata') ? freezeRecord(obsidianTagCounts(liveNotes)) : Object.freeze({})
  const recentFilePaths = permittedPluginData(plugin, 'read:files')
    ? Object.freeze([...liveNotes].sort((left, right) => right.updated_at - left.updated_at).map(note => note._id))
    : Object.freeze([])
  const activeFile =
    permittedPluginData(plugin, 'read:current-note') && currentId && noteByPath.has(currentId)
      ? fileByPath.get(currentId) ?? freezeObsidianFile(noteByPath.get(currentId)!, vaultRef, null, false)
      : null
  function workspaceFileFor(file: ObsidianPluginFile | string | null | undefined): ObsidianPluginFile | null {
    if (!permittedPluginData(plugin, 'read:files')) return null
    const path = typeof file === 'string' ? normalizePluginPath(file) : file?.path
    return path ? fileByPath.get(path) ?? null : null
  }
  function workspaceLeafFor(file: ObsidianPluginFile | string | null | undefined) {
    const target = workspaceFileFor(file)
    return target ? freezeObsidianWorkspaceLeaf(target, workspaceLeafFor, noteByPath.get(target.path)?.content ?? '') : null
  }
  const activeLeaf = activeFile ? freezeObsidianWorkspaceLeaf(activeFile, workspaceLeafFor, noteByPath.get(activeFile.path)?.content ?? '') : null
  folders.forEach(folder => Object.freeze(folder.children))
  const markdownCommands = new Map<string, { name: string; run: () => string }>([
    [
      'clawctrl:vault-stats',
      {
        name: 'vault stats',
        run: () =>
          permittedPluginData(plugin, 'read:vault-stats')
            ? '{"plugin":"vault.stats"}'
            : '[missing permission: read:vault-stats]',
      },
    ],
    [
      'clawctrl:recent-notes',
      {
        name: 'recent notes',
        run: () =>
          permittedPluginData(plugin, 'read:recent-notes')
            ? '{"plugin":"vault.recent"}'
            : '[missing permission: read:recent-notes]',
      },
    ],
    [
      'clawctrl:tag-index',
      {
        name: 'tag index',
        run: () =>
          permittedPluginData(plugin, 'read:tags')
            ? '{"plugin":"vault.tags"}'
            : '[missing permission: read:tags]',
      },
    ],
  ])
  plugin.commands?.forEach(command => {
    const commandId = `${plugin.id}:${command.id}`
    markdownCommands.set(commandId, {
      name: command.name,
      run: () => JSON.stringify({ ...command.config, plugin: plugin.id, title: command.config?.title ?? command.name }),
    })
  })
  const commandRecord = () =>
    freezeRecord(
      Object.fromEntries(
        [...markdownCommands.entries()].map(([id, command]) => [
          id,
          Object.freeze({
            id,
            name: command.name,
          }),
        ]),
      ),
    )
  const commandById = (id: unknown) => markdownCommands.get(String(id))
  const executeCommand = (command: unknown) => {
    const id = typeof command === 'string' ? command : isRecord(command) ? command.id : ''
    const entry = commandById(id)
    return entry ? entry.run() : ''
  }
  return Object.freeze({
    loadData: () => {
      if (!permittedPluginData(plugin, 'read:plugin-data')) return null
      return dataStore[plugin.id] ?? null
    },
    saveData: (data: unknown) => {
      if (!permittedPluginData(plugin, 'write:plugin-data')) return '[missing permission: write:plugin-data]'
      return vaultPluginDataMarkdown(plugin.id, data)
    },
    vault: Object.freeze({
      getName: () => 'clawctrl Local Vault',
      getMarkdownFiles: () => files,
      getFiles: () => files,
      getAllLoadedFiles: () => Object.freeze([rootFolder, ...folders, ...files]),
      getAllFolders: (includeRoot = false) => (includeRoot ? Object.freeze([rootFolder, ...folders]) : folders),
      getRoot: () => rootFolder,
      recurseChildren: (root: ObsidianPluginFolder | null | undefined, callback: unknown) => {
        if (!permittedPluginData(plugin, 'read:files') || typeof callback !== 'function' || !isObsidianPluginFolder(root)) return
        recurseObsidianChildren(root, callback as (child: ObsidianPluginFile | ObsidianPluginFolder) => unknown)
      },
      getAbstractFileByPath: (path: string) => abstractFileByPath.get(normalizePluginPath(path)) ?? null,
      getFileByPath: (path: string) => fileByPath.get(normalizePluginPath(path)) ?? null,
      getFolderByPath: (path: string) => folderByPath.get(normalizePluginPath(path)) ?? null,
      getAvailablePath: (path: string, extension?: string) => {
        if (!permittedPluginData(plugin, 'read:files')) return normalizePluginPath(path)
        return availableObsidianPath(normalizePluginPath(path), String(extension ?? '').replace(/^\./, ''), abstractFileByPath)
      },
      getAvailablePathForAttachment: (filename: string, _sourcePath?: string) => {
        const name = normalizePluginPath(filename).split('/').filter(Boolean).pop() ?? 'attachment'
        return availableObsidianPath(`Attachments/${name}`, '', abstractFileByPath)
      },
      getResourcePath: (file: ObsidianPluginFile | string | null | undefined) => {
        if (!permittedPluginData(plugin, 'read:files')) return ''
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return ''
        return `/api/vault/local/media?id=${encodeURIComponent(normalizePluginPath(path))}`
      },
      getConfig: (key: string) => {
        const config: Record<string, string | boolean> = {
          attachmentFolderPath: 'Attachments',
          alwaysUpdateLinks: true,
          newFileLocation: 'current',
          useMarkdownLinks: false,
        }
        return config[String(key)] ?? null
      },
      cachedRead: (file: ObsidianPluginFile | string | null | undefined) => {
        if (!permittedPluginData(plugin, 'read:files')) return ''
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return ''
        return noteByPath.get(path)?.content.slice(0, 20_000) ?? ''
      },
      read: (file: ObsidianPluginFile | string | null | undefined) => {
        if (!permittedPluginData(plugin, 'read:files')) return ''
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return ''
        return noteByPath.get(path)?.content.slice(0, 20_000) ?? ''
      },
      create: (path: string, content: unknown) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const normalized = availableObsidianPath(normalizePluginPath(path), 'md', abstractFileByPath)
        return vaultPluginWriteMarkdown(plugin.id, {
          action: 'create',
          path: normalized,
          content: String(content ?? '').slice(0, 20_000),
        })
      },
      modify: (file: ObsidianPluginFile | string | null | undefined, content: unknown) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return '[missing file]'
        return vaultPluginWriteMarkdown(plugin.id, {
          action: 'modify',
          path: normalizePluginPath(path),
          content: String(content ?? '').slice(0, 20_000),
        })
      },
      append: (file: ObsidianPluginFile | string | null | undefined, content: unknown) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return '[missing file]'
        const normalized = normalizePluginPath(path)
        const current = noteByPath.get(normalized)?.content ?? ''
        return vaultPluginWriteMarkdown(plugin.id, {
          action: 'modify',
          path: normalized,
          content: `${current}${String(content ?? '')}`.slice(0, 20_000),
        })
      },
      copy: (file: ObsidianPluginFile | string | null | undefined, newPath: string) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return '[missing file]'
        const source = noteByPath.get(normalizePluginPath(path))
        if (!source) return '[missing file]'
        return vaultPluginWriteMarkdown(plugin.id, {
          action: 'create',
          path: availableObsidianPath(normalizePluginPath(newPath), 'md', abstractFileByPath),
          content: source.content.slice(0, 20_000),
        })
      },
      delete: (file: ObsidianPluginFile | string | null | undefined) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return '[missing file]'
        return vaultPluginWriteMarkdown(plugin.id, { action: 'trash', path: normalizePluginPath(path) })
      },
      trash: (file: ObsidianPluginFile | string | null | undefined) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return '[missing file]'
        return vaultPluginWriteMarkdown(plugin.id, { action: 'trash', path: normalizePluginPath(path) })
      },
      rename: (file: ObsidianPluginFile | string | null | undefined, newPath: string) => {
        if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return '[missing file]'
        return vaultPluginWriteMarkdown(plugin.id, {
          action: 'rename',
          path: normalizePluginPath(path),
          newPath: availableObsidianPath(normalizePluginPath(newPath), 'md', abstractFileByPath),
        })
      },
      adapter: Object.freeze({
        getName: () => 'clawctrl Local Vault',
        getFullPath: (path: string) => normalizePluginPath(path),
        list: (path: string) => {
          if (!permittedPluginData(plugin, 'read:files')) return Object.freeze({ files: Object.freeze([]), folders: Object.freeze([]) })
          const folderPath = normalizePluginPath(path)
          const childFiles = files
            .filter(file => parentFolderPath(file.path) === folderPath)
            .map(file => file.path)
            .sort()
          const childFolders = folders
            .filter(folder => parentFolderPath(folder.path) === folderPath)
            .map(folder => folder.path)
            .sort()
          return Object.freeze({
            files: Object.freeze(childFiles),
            folders: Object.freeze(childFolders),
          })
        },
        exists: (path: string) => permittedPluginData(plugin, 'read:files') && abstractFileByPath.has(normalizePluginPath(path)),
        read: (path: string) => {
          if (!permittedPluginData(plugin, 'read:files')) return ''
          return noteByPath.get(normalizePluginPath(path))?.content.slice(0, 20_000) ?? ''
        },
        write: (path: string, content: unknown) => {
          if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
          const normalized = normalizePluginPath(path)
          const action = noteByPath.has(normalized) ? 'modify' : 'create'
          return vaultPluginWriteMarkdown(plugin.id, {
            action,
            path: action === 'create' ? availableObsidianPath(normalized, 'md', abstractFileByPath) : normalized,
            content: String(content ?? '').slice(0, 20_000),
          })
        },
        append: (path: string, content: unknown) => {
          if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
          const normalized = normalizePluginPath(path)
          const current = noteByPath.get(normalized)?.content ?? ''
          const action = noteByPath.has(normalized) ? 'modify' : 'create'
          return vaultPluginWriteMarkdown(plugin.id, {
            action,
            path: action === 'create' ? availableObsidianPath(normalized, 'md', abstractFileByPath) : normalized,
            content: `${current}${String(content ?? '')}`.slice(0, 20_000),
          })
        },
        copy: (path: string, newPath: string) => {
          if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
          const source = noteByPath.get(normalizePluginPath(path))
          if (!source) return '[missing file]'
          return vaultPluginWriteMarkdown(plugin.id, {
            action: 'create',
            path: availableObsidianPath(normalizePluginPath(newPath), 'md', abstractFileByPath),
            content: source.content.slice(0, 20_000),
          })
        },
        rename: (path: string, newPath: string) => {
          if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
          const normalized = normalizePluginPath(path)
          if (!noteByPath.has(normalized)) return '[missing file]'
          return vaultPluginWriteMarkdown(plugin.id, {
            action: 'rename',
            path: normalized,
            newPath: availableObsidianPath(normalizePluginPath(newPath), 'md', abstractFileByPath),
          })
        },
        remove: (path: string) => {
          if (!permittedPluginData(plugin, 'write:files')) return '[missing permission: write:files]'
          const normalized = normalizePluginPath(path)
          if (!noteByPath.has(normalized)) return '[missing file]'
          return vaultPluginWriteMarkdown(plugin.id, { action: 'trash', path: normalized })
        },
        stat: (path: string) => {
          if (!permittedPluginData(plugin, 'read:files')) return null
          const normalized = normalizePluginPath(path)
          const note = noteByPath.get(normalized)
          if (note) {
            return Object.freeze({
              type: 'file',
              ctime: note.created_at,
              mtime: note.updated_at,
              size: note.content.length,
            })
          }
          if (folderByPath.has(normalized)) {
            return Object.freeze({
              type: 'folder',
              ctime: 0,
              mtime: 0,
              size: 0,
            })
          }
          return null
        },
      }),
      on: (name: string, callback: unknown) => {
        const eventName = String(name)
        if ((eventName === 'modify' || eventName === 'create') && activeFile && typeof callback === 'function') callback(activeFile)
        return freezeWorkspaceEventRef(`vault:${eventName}`)
      },
      offref: (ref: { detach?: () => void } | null | undefined) => {
        ref?.detach?.()
      },
      off: () => undefined,
    }),
    metadataCache: Object.freeze({
      resolvedLinks,
      unresolvedLinks,
      getCachedFiles: () =>
        permittedPluginData(plugin, 'read:metadata')
          ? Object.freeze(liveNotes.map(note => note._id).sort((left, right) => left.localeCompare(right)))
          : Object.freeze([]),
      getTags: () => tagCounts,
      getFileCache: (file: ObsidianPluginFile | string | null | undefined) => {
        if (!permittedPluginData(plugin, 'read:metadata')) return null
        const path = typeof file === 'string' ? normalizePluginPath(file) : file?.path
        const note = path ? noteByPath.get(path) : undefined
        if (!note) return null
        return freezeObsidianMetadataCache(note)
      },
      getCache: (path: string) => {
        if (!permittedPluginData(plugin, 'read:metadata')) return null
        const note = noteByPath.get(normalizePluginPath(path))
        if (!note) return null
        return freezeObsidianMetadataCache(note)
      },
      getFirstLinkpathDest: (linkpath: string) => {
        if (!permittedPluginData(plugin, 'read:metadata')) return null
        return resolveLink(linkpath)
      },
      getLinkpathDest: (linkpath: string, _sourcePath?: string) => {
        if (!permittedPluginData(plugin, 'read:metadata')) return null
        return resolveLink(linkpath)
      },
      getFrontmatterPropertyValuesForKey: (key: string) => {
        if (!permittedPluginData(plugin, 'read:metadata')) return Object.freeze([])
        const values = new Set<string>()
        const propertyKey = String(key)
        for (const note of liveNotes) {
          const value = propertyKey === 'aliases' ? note.aliases : note.properties?.[propertyKey]
          normalizeFrontmatterValues(value).forEach(item => values.add(item))
        }
        return Object.freeze([...values].sort())
      },
      getBacklinksForFile: (file: ObsidianPluginFile | string | null | undefined) => {
        const data = new Map<string, Array<{ link: string; original: string }>>()
        if (!permittedPluginData(plugin, 'read:metadata')) return Object.freeze({ data })
        const path = typeof file === 'string' ? normalizePluginPath(file) : file?.path
        if (!path) return Object.freeze({ data })
        for (const note of liveNotes) {
          const links = note.links.filter(link => resolveLink(link)?.path === path)
          if (links.length > 0) {
            data.set(note._id, links.map(link => Object.freeze({ link, original: `[[${link}]]` })))
          }
        }
        return Object.freeze({ data })
      },
      fileToLinktext: (
        file: ObsidianPluginFile | string | null | undefined,
        sourcePath?: string,
        omitMdExtension = true,
      ) => {
        if (!permittedPluginData(plugin, 'read:files')) return ''
        return obsidianFileLinkText(file, sourcePath, omitMdExtension)
      },
      on: (name: string, callback: unknown) => {
        const eventName = String(name)
        if (!permittedPluginData(plugin, 'read:metadata')) return freezeWorkspaceEventRef(`metadata:${eventName}`)
        if (eventName === 'changed' && activeFile && typeof callback === 'function') {
          const note = noteByPath.get(activeFile.path)
          callback(activeFile, '', note ? freezeObsidianMetadataCache(note) : null)
        }
        if (eventName === 'resolve' && activeFile && typeof callback === 'function') callback(activeFile)
        return freezeWorkspaceEventRef(`metadata:${eventName}`)
      },
      offref: (ref: { detach?: () => void } | null | undefined) => {
        ref?.detach?.()
      },
      off: () => undefined,
    }),
    fileManager: Object.freeze({
      getNewFileParent: (sourcePath?: string, newFilePath?: string) => {
        if (!permittedPluginData(plugin, 'read:files')) return rootFolder
        const parentPath = parentFolderPath(newFilePath || sourcePath || '')
        return parentPath ? folderByPath.get(parentPath) ?? rootFolder : rootFolder
      },
      fileToLinktext: (
        file: ObsidianPluginFile | string | null | undefined,
        sourcePath?: string,
        omitMdExtension = true,
      ) => {
        if (!permittedPluginData(plugin, 'read:files')) return ''
        return obsidianFileLinkText(file, sourcePath, omitMdExtension)
      },
      generateMarkdownLink: (
        file: ObsidianPluginFile | string | null | undefined,
        _sourcePath?: string,
        subpath?: string,
        alias?: string,
      ) => {
        if (!permittedPluginData(plugin, 'read:files')) return ''
        const path = typeof file === 'string' ? file : file?.path
        if (!path) return ''
        const target = `${path.replace(/\.md$/i, '')}${subpath ?? ''}`
        return alias ? `[[${target}|${alias}]]` : `[[${target}]]`
      },
      processFrontMatter: (file: ObsidianPluginFile | string | null | undefined, callback: unknown) => {
        if (!permittedPluginData(plugin, 'write:metadata')) return '[missing permission: write:metadata]'
        const path = typeof file === 'string' ? file : file?.path
        if (!path || typeof callback !== 'function') return '[missing file]'
        const note = noteByPath.get(path)
        const frontmatter = sanitizePluginFrontmatter({
          ...(note?.properties ?? {}),
          aliases: note?.aliases ?? [],
          tags: note?.tags ?? [],
        }) ?? {}
        callback(frontmatter)
        return vaultPluginWriteMarkdown(plugin.id, {
          action: 'frontmatter',
          path: normalizePluginPath(path),
          frontmatter: sanitizePluginFrontmatter(frontmatter) ?? {},
        })
      },
    }),
    workspace: Object.freeze({
      getActiveFile: () => activeFile,
      getActiveLeaf: () => activeLeaf,
      getMostRecentLeaf: () => activeLeaf,
      getLastOpenFiles: () => recentFilePaths,
      getLeaf: (_newLeaf?: unknown) => activeLeaf,
      getRightLeaf: (_split?: unknown) => activeLeaf,
      getLeftLeaf: (_split?: unknown) => activeLeaf,
      getLeafById: (_id?: unknown) => activeLeaf,
      getLayout: () => Object.freeze({ main: Object.freeze({ type: 'split', children: Object.freeze([]) }) }),
      changeLayout: () => undefined,
      getActiveViewOfType: (viewType: unknown) => (isMarkdownViewType(viewType) ? activeLeaf?.view ?? null : null),
      getLeavesOfType: (viewType: string) =>
        isMarkdownViewType(viewType) && activeLeaf ? Object.freeze([activeLeaf]) : Object.freeze([]),
      openLinkText: (linktext: string, _sourcePath?: string, _newLeaf?: unknown) => {
        if (!permittedPluginData(plugin, 'read:files')) return null
        return workspaceLeafFor(resolveLink(linktext))
      },
      openFile: (file: ObsidianPluginFile | string | null | undefined, _openState?: unknown) => workspaceLeafFor(file),
      iterateAllLeaves: (callback: unknown) => {
        if (activeLeaf && typeof callback === 'function') callback(activeLeaf)
      },
      onLayoutReady: (callback: unknown) => {
        if (typeof callback === 'function') callback()
        return freezeWorkspaceEventRef('layout-ready')
      },
      on: (name: string, callback: unknown) => {
        const eventName = String(name)
        if (eventName === 'file-open' && activeFile && typeof callback === 'function') callback(activeFile)
        if (eventName === 'active-leaf-change' && activeLeaf && typeof callback === 'function') callback(activeLeaf)
        return freezeWorkspaceEventRef(eventName)
      },
      offref: (ref: { detach?: () => void } | null | undefined) => {
        ref?.detach?.()
      },
      off: () => undefined,
      trigger: () => undefined,
      requestSaveLayout: () => undefined,
      revealLeaf: () => undefined,
      detachLeavesOfType: () => undefined,
    }),
    commands: Object.freeze({
      commands: commandRecord(),
      listCommands: () => Object.freeze(Object.values(commandRecord())),
      listCommandIds: () => Object.freeze([...markdownCommands.keys()]),
      findCommand: (id: string) => commandRecord()[String(id)] ?? null,
      executeCommand,
      executeCommandById: (id: string) => executeCommand(id),
      on: (name: string) => freezeWorkspaceEventRef(`commands:${String(name)}`),
      offref: (ref: { detach?: () => void } | null | undefined) => {
        ref?.detach?.()
      },
      off: () => undefined,
    }),
    hotkeyManager: Object.freeze({
      getHotkeys: (_commandId: string) => Object.freeze([]),
      getDefaultHotkeys: (_commandId: string) => Object.freeze([]),
      setHotkeys: () => undefined,
      removeHotkeys: () => undefined,
    }),
  })
}

function buildObsidianFolders(
  notes: VaultNote[],
  vaultRef: { getName: () => string },
): ObsidianPluginFolder[] {
  const paths = new Set<string>()
  for (const note of notes) {
    const folder = note.folder || parentFolderPath(note._id)
    if (!folder) continue
    const parts = normalizePluginPath(folder).split('/').filter(Boolean)
    for (let index = 1; index <= parts.length; index += 1) {
      paths.add(parts.slice(0, index).join('/'))
    }
  }
  const folders = [...paths].sort((left, right) => left.localeCompare(right))
  const folderByPath = new Map<string, ObsidianPluginFolder>()
  for (const path of folders) {
    const parentPath = parentFolderPath(path)
    const folder = Object.freeze({
      vault: vaultRef,
      path,
      name: path.split('/').pop() || path,
      parent: parentPath ? folderByPath.get(parentPath) ?? null : null,
      children: [] as Array<ObsidianPluginFile | ObsidianPluginFolder>,
      isRoot: () => false,
    }) as ObsidianPluginFolder
    folderByPath.set(path, folder)
  }
  for (const folder of folderByPath.values()) {
    folder.parent?.children.push(folder)
  }
  return [...folderByPath.values()]
}

function freezeObsidianFile(
  note: VaultNote,
  vaultRef: { getName: () => string },
  parent: ObsidianPluginFolder | null,
  registerWithParent = true,
): ObsidianPluginFile {
  const name = note._id.split('/').pop() || note._id
  const file = Object.freeze({
    vault: vaultRef,
    path: note._id,
    basename: name.replace(/\.md$/i, ''),
    name,
    extension: 'md' as const,
    parent,
    stat: Object.freeze({
      ctime: note.created_at,
      mtime: note.updated_at,
      size: note.content.length,
    }),
  })
  if (registerWithParent) parent?.children.push(file)
  return file
}

function freezeObsidianWorkspaceLeaf(
  file: ObsidianPluginFile,
  openFile?: (file: ObsidianPluginFile | string | null | undefined) => unknown,
  content = '',
) {
  const view = Object.freeze({
    file,
    editor: freezeObsidianEditor(content),
    getViewType: () => 'markdown',
  })
  return Object.freeze({
    view,
    getViewState: () => Object.freeze({ type: 'markdown', state: Object.freeze({ file: file.path }) }),
    setViewState: () => undefined,
    openFile: (nextFile: ObsidianPluginFile | string | null | undefined) => openFile?.(nextFile) ?? null,
  })
}

function freezeObsidianEditor(content: string) {
  const text = String(content ?? '').slice(0, 20_000)
  const lines = text.split(/\r?\n/)
  const clampLine = (line: number) => Math.max(0, Math.min(lines.length - 1, Math.trunc(Number(line) || 0)))
  const offsetToPos = (offset: number) => {
    let remaining = Math.max(0, Math.min(text.length, Math.trunc(Number(offset) || 0)))
    for (let line = 0; line < lines.length; line += 1) {
      if (remaining <= lines[line].length) return Object.freeze({ line, ch: remaining })
      remaining -= lines[line].length + 1
    }
    return Object.freeze({ line: Math.max(0, lines.length - 1), ch: lines.at(-1)?.length ?? 0 })
  }
  const posToOffset = (pos: { line?: number; ch?: number } | null | undefined) => {
    const line = clampLine(pos?.line ?? 0)
    const ch = Math.max(0, Math.min(lines[line].length, Math.trunc(Number(pos?.ch) || 0)))
    return lines.slice(0, line).reduce((total, value) => total + value.length + 1, 0) + ch
  }
  return Object.freeze({
    getValue: () => text,
    lineCount: () => lines.length,
    getLine: (line: number) => lines[clampLine(line)] ?? '',
    getSelection: () => '',
    somethingSelected: () => false,
    getCursor: () => Object.freeze({ line: 0, ch: 0 }),
    offsetToPos,
    posToOffset,
    setValue: () => undefined,
    replaceRange: () => undefined,
    replaceSelection: () => undefined,
    setCursor: () => undefined,
  })
}

function freezeObsidianMetadataCache(note: VaultNote) {
  return Object.freeze({
    tags: Object.freeze(note.tags.map(tag => Object.freeze({ tag: `#${tag}` }))),
    links: Object.freeze(note.links.map(link => Object.freeze({ link }))),
    embeds: Object.freeze(obsidianEmbeds(note.content)),
    headings: Object.freeze(obsidianHeadings(note.content)),
    listItems: Object.freeze(obsidianListItems(note.content)),
    sections: Object.freeze(obsidianSections(note.content)),
    frontmatter: Object.freeze({ ...note.properties, aliases: note.aliases }),
  })
}

function obsidianHeadings(content: string) {
  return content
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) return []
      return [
        Object.freeze({
          heading: match[2],
          level: match[1].length,
          position: freezeObsidianLinePosition(index, line),
        }),
      ]
    })
}

function obsidianListItems(content: string) {
  return content
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = line.match(/^\s*(?:[-*+]\s+(?:\[([ xX])\]\s+)?|\d+\.\s+)(.+)$/)
      if (!match) return []
      return [
        Object.freeze({
          task: match[1] ? match[1].toLowerCase() === 'x' ? 'x' : ' ' : undefined,
          position: freezeObsidianLinePosition(index, line),
        }),
      ]
    })
}

function obsidianEmbeds(content: string) {
  return [...content.matchAll(/!\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)].map(match =>
    Object.freeze({
      link: `${match[1]}${match[2] ?? ''}`,
      original: match[0],
      displayText: match[3],
    }),
  )
}

function obsidianSections(content: string) {
  return content.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return []
    const type =
      /^#{1,6}\s+/.test(trimmed)
        ? 'heading'
        : /^```/.test(trimmed)
          ? 'code'
          : /^>\s?/.test(trimmed)
            ? 'blockquote'
            : /^\|.+\|$/.test(trimmed)
              ? 'table'
              : /^([-*+]\s+|\d+\.\s+)/.test(trimmed)
                ? 'list'
                : /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
                  ? 'thematicBreak'
                  : 'paragraph'
    return [Object.freeze({ type, position: freezeObsidianLinePosition(index, line) })]
  })
}

function freezeObsidianLinePosition(lineNumber: number, line: string) {
  return Object.freeze({
    start: Object.freeze({ line: lineNumber, col: 0, offset: 0 }),
    end: Object.freeze({ line: lineNumber, col: line.length, offset: line.length }),
  })
}

function freezeWorkspaceEventRef(name: string) {
  return Object.freeze({
    name,
    detach: () => undefined,
  })
}

function recurseObsidianChildren(
  folder: ObsidianPluginFolder,
  callback: (child: ObsidianPluginFile | ObsidianPluginFolder) => unknown,
) {
  folder.children.forEach(child => {
    callback(child)
    if (isObsidianPluginFolder(child)) recurseObsidianChildren(child, callback)
  })
}

function availableObsidianPath(
  path: string,
  extension: string,
  existing: Map<string, ObsidianPluginFile | ObsidianPluginFolder>,
): string {
  const normalized = normalizePluginPath(path)
  const suffix = extension ? `.${extension}` : ''
  const target = suffix && !normalized.toLowerCase().endsWith(suffix.toLowerCase()) ? `${normalized}${suffix}` : normalized
  if (!existing.has(target)) return target
  const dot = target.lastIndexOf('.')
  const base = dot > 0 ? target.slice(0, dot) : target
  const ext = dot > 0 ? target.slice(dot) : ''
  for (let index = 1; index <= 100; index += 1) {
    const candidate = `${base} ${index}${ext}`
    if (!existing.has(candidate)) return candidate
  }
  return `${base} 101${ext}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isObsidianPluginFile(value: unknown): value is ObsidianPluginFile {
  if (!isRecord(value)) return false
  return (
    typeof value.path === 'string' &&
    typeof value.basename === 'string' &&
    typeof value.name === 'string' &&
    value.extension === 'md' &&
    isRecord(value.stat)
  )
}

function isObsidianPluginFolder(value: unknown): value is ObsidianPluginFolder {
  if (!isRecord(value)) return false
  return (
    typeof value.path === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.children) &&
    typeof value.isRoot === 'function'
  )
}

function isObsidianWorkspaceLeaf(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    isRecord(value.view) &&
    typeof value.getViewState === 'function' &&
    typeof value.setViewState === 'function' &&
    typeof value.openFile === 'function'
  )
}

function isMarkdownViewType(viewType: unknown): boolean {
  if (String(viewType) === 'markdown') return true
  if (typeof viewType === 'function') return viewType.name === 'MarkdownView' || (viewType as { viewType?: unknown }).viewType === 'markdown'
  return isRecord(viewType) && viewType.viewType === 'markdown'
}

function obsidianFileLinkText(
  file: ObsidianPluginFile | string | null | undefined,
  _sourcePath?: string,
  omitMdExtension = true,
): string {
  const path = typeof file === 'string' ? normalizePluginPath(file) : file?.path
  if (!path) return ''
  return omitMdExtension ? path.replace(/\.md$/i, '') : path
}

function parseObsidianLinktext(linktext: unknown) {
  const text = String(linktext ?? '').trim().split('|')[0] ?? ''
  const hash = text.indexOf('#')
  return Object.freeze({
    path: hash >= 0 ? text.slice(0, hash) : text,
    subpath: hash >= 0 ? text.slice(hash) : '',
  })
}

function splitObsidianSubpath(linktext: unknown) {
  return parseObsidianLinktext(linktext)
}

function getObsidianLinkpath(linktext: unknown): string {
  return parseObsidianLinktext(linktext).path
}

function getAllObsidianTags(cache: unknown): string[] {
  if (!isRecord(cache) || !Array.isArray(cache.tags)) return []
  return cache.tags
    .map(tag => (isRecord(tag) && typeof tag.tag === 'string' ? tag.tag : ''))
    .filter(Boolean)
}

function normalizeFrontmatterValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizeFrontmatterValues)
  if (value === null || value === undefined) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

function normalizePluginPath(path: string): string {
  return String(path ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
}

function parentFolderPath(path: string): string {
  const normalized = normalizePluginPath(path)
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function normalizeObsidianLinkKey(value: string): string {
  return value.trim().split('|')[0]?.split('#')[0]?.replace(/\.md$/i, '').toLowerCase() ?? ''
}

function resolvedLinkCounts(
  note: VaultNote,
  resolveLink: (link: string | null | undefined) => ObsidianPluginFile | null,
): Record<string, number> {
  const counts: Record<string, number> = {}
  note.links.forEach(link => {
    const resolved = resolveLink(link)
    if (!resolved) return
    counts[resolved.path] = (counts[resolved.path] ?? 0) + 1
  })
  return counts
}

function unresolvedLinkCounts(
  note: VaultNote,
  resolveLink: (link: string | null | undefined) => ObsidianPluginFile | null,
): Record<string, number> {
  const counts: Record<string, number> = {}
  note.links.forEach(link => {
    if (resolveLink(link)) return
    counts[link] = (counts[link] ?? 0) + 1
  })
  return counts
}

function obsidianTagCounts(notes: VaultNote[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = `#${tag}`
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return counts
}

function freezeRecord<T>(record: Record<string, T>): Readonly<Record<string, T>> {
  return Object.freeze(record)
}

function clampLimit(value: unknown): number {
  return Math.max(1, Math.min(50, Number(value) || 10))
}

function parseVaultPluginPermissions(value: unknown): VaultPluginPermission[] {
  if (!Array.isArray(value)) return []
  const permissions = new Set<VaultPluginPermission>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    if (ALLOWED_PLUGIN_PERMISSIONS.has(item as VaultPluginPermission)) {
      permissions.add(item as VaultPluginPermission)
    }
  }
  return [...permissions]
}

function parseVaultPluginDefinition(parsed: Record<string, unknown>): VaultPluginDefinition | null {
  const id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
  const label = typeof parsed.label === 'string' ? parsed.label.trim() : ''
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  const template = typeof parsed.template === 'string' ? parsed.template.slice(0, 4000) : ''
  const runtime = parseVaultPluginRuntime(parsed.runtime)
  if (!/^local\.[a-zA-Z0-9._-]{1,80}$/.test(id) || !label || (!template && !runtime)) return null
  return {
    id,
    label,
    description,
    permissions: parseVaultPluginPermissions(parsed.permissions),
    template,
    runtime,
    enabled: parsed.enabled !== false,
    version: typeof parsed.version === 'string' ? parsed.version.trim().slice(0, 40) : undefined,
    author: typeof parsed.author === 'string' ? parsed.author.trim().slice(0, 80) : undefined,
    apiVersion: typeof parsed.apiVersion === 'string' ? parsed.apiVersion.trim().slice(0, 40) : undefined,
    minAppVersion: typeof parsed.minAppVersion === 'string' ? parsed.minAppVersion.trim().slice(0, 40) : undefined,
    license: typeof parsed.license === 'string' ? parsed.license.trim().slice(0, 60) : undefined,
    homepage: safePluginUrl(parsed.homepage),
    repository: safePluginUrl(parsed.repository),
    keywords: parsePluginKeywords(parsed.keywords),
    commands: parseVaultPluginCommands(parsed.commands),
  }
}

function parseVaultPluginCommands(value: unknown): VaultPluginCommand[] | undefined {
  if (!Array.isArray(value)) return undefined
  const commands = new Map<string, VaultPluginCommand>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const parsed = item as Record<string, unknown>
    const id = typeof parsed.id === 'string' ? parsed.id.trim().slice(0, 80) : ''
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 80) : ''
    if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(id) || !name) continue
    commands.set(id, {
      id,
      name,
      description: typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 160) : undefined,
      config: parseVaultPluginCommandConfig(parsed.config),
    })
  }
  return commands.size ? [...commands.values()].slice(0, 20) : undefined
}

function parseVaultPluginCommandConfig(value: unknown): Omit<VaultPluginConfig, 'plugin'> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const parsed = value as Record<string, unknown>
  const config: Omit<VaultPluginConfig, 'plugin'> = {
    title: typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 100) : undefined,
    query: typeof parsed.query === 'string' ? parsed.query.trim().slice(0, 200) : undefined,
    limit: parsed.limit === undefined ? undefined : clampLimit(parsed.limit),
    includeDisabled: parsed.includeDisabled === true ? true : undefined,
  }
  for (const key of Object.keys(config) as Array<keyof typeof config>) {
    if (config[key] === undefined || config[key] === '') delete config[key]
  }
  return Object.keys(config).length ? config : undefined
}

function parseVaultPluginPackagePayload(
  value: unknown,
  fallbackSourceUrl?: string,
): VaultPluginMarketplacePackage | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Record<string, unknown>
  const pluginSource = parsed.plugin && typeof parsed.plugin === 'object'
    ? (parsed.plugin as Record<string, unknown>)
    : parsed
  const plugin = parseVaultPluginDefinition(pluginSource)
  if (!plugin) return null

  const checksum = vaultPluginManifestChecksum(plugin)
  const expectedChecksum =
    typeof parsed.checksum === 'string'
      ? normalizePluginChecksum(parsed.checksum)
      : typeof pluginSource.checksum === 'string'
        ? normalizePluginChecksum(pluginSource.checksum)
        : undefined
  const signature = parseVaultPluginPackageSignature(parsed.signature)
  const packageId = typeof parsed.packageId === 'string' && parsed.packageId.trim()
    ? parsed.packageId.trim().slice(0, 120)
    : plugin.id
  const signed = signature?.checksum === checksum && signature.signature.includes(checksum)
  const integrity = signed
    ? 'signed'
    : expectedChecksum
      ? expectedChecksum === checksum
        ? 'verified'
        : 'mismatch'
      : 'unsigned'
  return {
    packageId,
    plugin: {
      ...plugin,
      checksum,
      expectedChecksum,
      integrity,
    },
    sourceUrl: safePluginUrl(parsed.sourceUrl) ?? safePluginUrl(fallbackSourceUrl),
    checksum,
    expectedChecksum,
    signature,
    integrity,
  }
}

function parseVaultPluginPackageSignature(value: unknown): VaultPluginPackageSignature | undefined {
  if (!value || typeof value !== 'object') return undefined
  const signature = value as Record<string, unknown>
  const signer = typeof signature.signer === 'string' ? signature.signer.trim().slice(0, 120) : ''
  const checksum = typeof signature.checksum === 'string' ? normalizePluginChecksum(signature.checksum) : undefined
  const signatureValue = typeof signature.signature === 'string' ? signature.signature.trim().slice(0, 400) : ''
  const publicKey = parseVaultPluginSignaturePublicKey(signature.publicKey)
  if (!signer || !checksum || !signatureValue) return undefined
  return { signer, checksum, signature: signatureValue, publicKey }
}

function vaultPluginPackageBlockPayload(pkg: VaultPluginMarketplacePackage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    packageId: pkg.packageId,
    sourceUrl: pkg.sourceUrl,
    plugin: vaultPluginInstallManifest(pkg.plugin),
    checksum: pkg.checksum,
    signature: pkg.signature,
  }
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined || payload[key] === '') delete payload[key]
  }
  return payload
}

function vaultPluginInstallManifest(plugin: VaultPluginDefinition): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    id: plugin.id,
    label: plugin.label,
    description: plugin.description,
    enabled: plugin.enabled !== false,
    version: plugin.version,
    author: plugin.author,
    apiVersion: plugin.apiVersion,
    minAppVersion: plugin.minAppVersion,
    license: plugin.license,
    homepage: plugin.homepage,
    repository: plugin.repository,
    keywords: plugin.keywords,
    commands: plugin.commands,
    permissions: plugin.permissions ?? [],
    template: plugin.template,
    runtime: plugin.runtime,
  }
  for (const key of Object.keys(manifest)) {
    if (manifest[key] === undefined || manifest[key] === '') delete manifest[key]
  }
  manifest.checksum = vaultPluginManifestChecksum(plugin)
  return manifest
}

function normalizePluginMarketplaceFeedUrl(value: string): string {
  const trimmed = value.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Plugin marketplace feed needs an HTTPS URL')
  }
  const localHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]')
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('Plugin marketplace feed needs HTTPS, or local HTTP for development')
  }
  parsed.hash = ''
  return parsed.toString()
}

function parseVaultPluginSignaturePublicKey(value: unknown): JsonWebKey | undefined {
  if (!value || typeof value !== 'object') return undefined
  const jwk = value as JsonWebKey
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return undefined
  return {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
    ext: true,
    key_ops: ['verify'],
  }
}

async function verifyVaultPluginSignaturePayload(
  publicKey: JsonWebKey,
  signature: string,
  payload: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(payload),
    )
  } catch {
    return false
  }
}

function base64UrlDecode(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function parseVaultPluginRuntime(value: unknown): VaultPluginRuntime | undefined {
  if (!value || typeof value !== 'object') return undefined
  const runtime = value as Record<string, unknown>
  if (runtime.language !== 'claw-script') return undefined
  const code = typeof runtime.code === 'string' ? runtime.code.trim().slice(0, MAX_VAULT_PLUGIN_RUNTIME_CODE_LENGTH) : ''
  if (!code) return undefined
  return { language: 'claw-script', code }
}

function parsePluginKeywords(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const keywords = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const keyword = item.trim().toLowerCase()
    if (/^[a-z0-9][a-z0-9_-]{0,31}$/.test(keyword)) keywords.add(keyword)
  }
  return keywords.size ? [...keywords].slice(0, 12) : undefined
}

function safePluginUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const url = value.trim().slice(0, 240)
  return /^https:\/\/[^\s<>"]+$/.test(url) ? url : undefined
}

function permittedPluginValue(
  plugin: VaultPluginDefinition,
  permission: VaultPluginPermission,
  value: string,
): string {
  return plugin.permissions?.includes(permission) ? value : `[missing permission: ${permission}]`
}

function permittedPluginData(plugin: VaultPluginDefinition, permission: VaultPluginPermission): boolean {
  return plugin.permissions?.includes(permission) === true
}

export function vaultPluginDataMarkdown(pluginId: string, data: unknown): string {
  const sanitized = sanitizePluginData(data)
  return [
    '```claw-plugin-data',
    JSON.stringify(
      {
        plugin: pluginId,
        data: sanitized,
        checksum: pluginDataChecksum(pluginId, sanitized),
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

export function vaultPluginWriteMarkdown(
  pluginId: string,
  write: Omit<VaultPluginWriteRecord, 'plugin' | 'checksum' | 'sourceNoteId' | 'sourceTitle'>,
): string {
  const action = sanitizePluginWriteAction(write.action)
  const path = sanitizePluginWritePath(write.path)
  if (!action || !path) return '[invalid plugin write]'
  const record: Omit<VaultPluginWriteRecord, 'checksum'> = {
    plugin: pluginId,
    action,
    path,
    content: action === 'create' || action === 'modify' ? sanitizePluginWriteContent(write.content) ?? '' : undefined,
    newPath: action === 'rename' ? sanitizePluginWritePath(write.newPath) : undefined,
    frontmatter: action === 'frontmatter' ? sanitizePluginFrontmatter(write.frontmatter) ?? {} : undefined,
  }
  return [
    '```claw-plugin-write',
    JSON.stringify(
      {
        ...record,
        checksum: pluginWriteChecksum(record),
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

function pluginDataChecksum(pluginId: string, data: unknown): string {
  return collaborationStyleChecksum(`${pluginId}\n${stablePluginDataJson(data)}`)
}

function pluginWriteChecksum(record: Omit<VaultPluginWriteRecord, 'checksum' | 'sourceNoteId' | 'sourceTitle'>): string {
  return collaborationStyleChecksum(stablePluginWriteJson(record))
}

function stablePluginDataJson(data: unknown): string {
  return JSON.stringify(sanitizePluginData(data))
}

function stablePluginWriteJson(record: Omit<VaultPluginWriteRecord, 'checksum' | 'sourceNoteId' | 'sourceTitle'>): string {
  return JSON.stringify({
    plugin: record.plugin,
    action: record.action,
    path: sanitizePluginWritePath(record.path) ?? '',
    content: sanitizePluginWriteContent(record.content) ?? '',
    newPath: sanitizePluginWritePath(record.newPath) ?? '',
    frontmatter: sanitizePluginFrontmatter(record.frontmatter) ?? {},
  })
}

function sanitizePluginWriteAction(value: unknown): VaultPluginWriteAction | null {
  return value === 'create' || value === 'modify' || value === 'trash' || value === 'rename' || value === 'frontmatter'
    ? value
    : null
}

function sanitizePluginWritePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const path = normalizePluginPath(value).slice(0, 240)
  if (!path || path.includes('..') || path.startsWith('Trash/') || path === 'Trash') return undefined
  return path.endsWith('.md') ? path : `${path}.md`
}

function sanitizePluginWriteContent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, 20_000)
}

function sanitizePluginFrontmatter(value: unknown): Record<string, unknown> | undefined {
  const sanitized = sanitizePluginData(value)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return undefined
  return sanitized as Record<string, unknown>
}

function pluginWriteCreatedNote(record: VaultPluginWriteRecord, now: number): VaultNote {
  return {
    _id: record.path,
    type: 'note',
    title: record.path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
    content: record.content ?? '',
    folder: parentFolderPath(record.path),
    tags: [],
    links: [],
    aliases: [],
    properties: {},
    created_at: now,
    updated_at: now,
  }
}

function frontmatterValues(value: unknown): string[] {
  return normalizeFrontmatterValues(value).slice(0, 100)
}

function pluginWriteProperties(frontmatter: Record<string, unknown>): Record<string, string | string[]> {
  const properties: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'tags' || key === 'aliases') continue
    const values = normalizeFrontmatterValues(value)
    if (values.length === 1) properties[key] = values[0]
    if (values.length > 1) properties[key] = values
  }
  return properties
}

function applyPluginFrontmatterToContent(content: string, frontmatter: Record<string, unknown>): string {
  const { properties, body } = splitPluginFrontmatter(content)
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue
    const values = frontmatterValues(value)
    if (values.length === 0) {
      delete properties[key]
    } else {
      properties[key] = values
    }
  }
  return `${serializePluginFrontmatter(properties)}${body}`
}

function splitPluginFrontmatter(content: string): { properties: Record<string, string[]>; body: string } {
  if (!content.startsWith('---\n')) return { properties: {}, body: content }
  const end = content.indexOf('\n---', 4)
  if (end === -1) return { properties: {}, body: content }
  const closeEnd = content.indexOf('\n', end + 4)
  const boundaryEnd = closeEnd === -1 ? content.length : closeEnd + 1
  return {
    properties: parsePluginFrontmatter(content.slice(4, end)),
    body: content.slice(boundaryEnd),
  }
}

function parsePluginFrontmatter(block: string): Record<string, string[]> {
  const properties: Record<string, string[]> = {}
  let currentKey: string | null = null
  for (const line of block.split(/\r?\n/)) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (currentKey && listMatch) {
      properties[currentKey] = [...(properties[currentKey] ?? []), cleanPluginYamlValue(listMatch[1])]
      continue
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) {
      currentKey = null
      continue
    }
    currentKey = pair[1]
    const raw = pair[2].trim()
    properties[currentKey] = raw ? parsePluginYamlValue(raw) : []
  }
  return properties
}

function parsePluginYamlValue(raw: string): string[] {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map(cleanPluginYamlValue).filter(Boolean)
  }
  return [cleanPluginYamlValue(raw)].filter(Boolean)
}

function cleanPluginYamlValue(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '')
}

function serializePluginFrontmatter(properties: Record<string, string[]>): string {
  const lines = ['---']
  for (const key of Object.keys(properties).sort()) {
    const values = properties[key].filter(Boolean)
    if (values.length === 0) continue
    if (values.length === 1) {
      lines.push(`${key}: ${serializePluginYamlScalar(values[0])}`)
    } else {
      lines.push(`${key}:`)
      values.forEach(value => lines.push(`  - ${serializePluginYamlScalar(value)}`))
    }
  }
  lines.push('---', '')
  return lines.join('\n')
}

function serializePluginYamlScalar(value: string): string {
  const trimmed = value.trim().slice(0, 4000)
  return /^[A-Za-z0-9_./#@ -]+$/.test(trimmed) ? trimmed : JSON.stringify(trimmed)
}

function sanitizePluginData(data: unknown, depth = 0): unknown {
  if (depth > 8) return null
  if (data === null) return null
  if (typeof data === 'string') return data.slice(0, 4000)
  if (typeof data === 'number') return Number.isFinite(data) ? data : null
  if (typeof data === 'boolean') return data
  if (Array.isArray(data)) return data.slice(0, 200).map(item => sanitizePluginData(item, depth + 1))
  if (typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort().slice(0, 200)) {
    if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(key)) continue
    sanitized[key] = sanitizePluginData(record[key], depth + 1)
  }
  return sanitized
}

function freezePluginData<T>(data: T): T {
  if (!data || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    data.forEach(item => freezePluginData(item))
    return Object.freeze(data) as T
  }
  Object.values(data as Record<string, unknown>).forEach(value => freezePluginData(value))
  return Object.freeze(data)
}

export function vaultPluginManifestChecksum(plugin: VaultPluginDefinition): string {
  return collaborationStyleChecksum(stablePluginManifestJson(plugin))
}

function stablePluginManifestJson(plugin: VaultPluginDefinition): string {
  return JSON.stringify({
    id: plugin.id,
    label: plugin.label,
    description: plugin.description,
    enabled: plugin.enabled !== false,
    version: plugin.version ?? '',
    author: plugin.author ?? '',
    apiVersion: plugin.apiVersion ?? '',
    minAppVersion: plugin.minAppVersion ?? '',
    license: plugin.license ?? '',
    homepage: plugin.homepage ?? '',
    repository: plugin.repository ?? '',
    keywords: [...(plugin.keywords ?? [])].sort(),
    commands: (plugin.commands ?? [])
      .map(command => ({
        id: command.id,
        name: command.name,
        description: command.description ?? '',
        config: command.config ?? {},
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    permissions: [...(plugin.permissions ?? [])].sort(),
    template: plugin.template ?? '',
    runtime: plugin.runtime
      ? {
          language: plugin.runtime.language,
          code: plugin.runtime.code,
        }
      : null,
  })
}

function collaborationStyleChecksum(content: string): string {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizePluginChecksum(value: string): string | undefined {
  const checksum = value.trim().toLowerCase()
  return /^[a-f0-9]{8}$/.test(checksum) ? checksum : undefined
}

function pluginIntegrityLabel(entry: VaultPluginRegistryEntry): string {
  if (entry.integrity === 'built-in') return 'built-in'
  return pluginIntegrityText(entry.integrity, entry.checksum)
}

function pluginIntegrityText(integrity: Exclude<VaultPluginIntegrity, 'built-in'>, checksum: string): string {
  if (integrity === 'verified') return `verified \`${checksum}\``
  if (integrity === 'signed') return `signed \`${checksum}\``
  if (integrity === 'mismatch') return `mismatch \`${checksum}\``
  return `unsigned \`${checksum}\``
}

function findBlockedRuntimeToken(code: string): string | null {
  for (const token of BLOCKED_RUNTIME_TOKENS) {
    const pattern = new RegExp(`(^|[^a-zA-Z0-9_$])${escapeRegExp(token)}([^a-zA-Z0-9_$]|$)`)
    if (pattern.test(code)) return token
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function heading(title: string): string {
  return `### ${escapeMarkdown(title)}`
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function isTrashed(note: VaultNote): boolean {
  return Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/')
}
