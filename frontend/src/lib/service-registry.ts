import type React from 'react'
import {
  ChatText,
  Robot,
  Desktop,
  FilmStrip,
  Envelope,
  CalendarDots,
  Bell,
  Brain,
} from '@phosphor-icons/react'

export interface FieldDef {
  label: string
  keychainKey: string
  placeholder: string
  secret?: boolean
  type?: string
}

export interface ServiceCredentialsEntry {
  service: string
  keychainKey: string
  value: string | undefined | null
}

export interface ServiceGroupDef {
  id: string
  title: string
  description: string
  icon: React.ElementType
  moduleIds: string[]
  optional: boolean
  skipLabel?: string
  fields: FieldDef[]
  services: { name: string; fieldKeys: string[] }[]
  testKey?: string
}

export interface ConnectionSettingDef {
  id: 'bluebubbles' | 'openclaw' | 'sunshine' | 'vnc' | 'agentsecrets' | 'agentshell'
  label: string
  description: string
  urlKeychainKey: string
  urlPlaceholder: string
  expectedHostPreferenceKey: string
  expectedHostPlaceholder: string
  apiSecretService: string
}

export type ConnectionSettingId = ConnectionSettingDef['id']

export const SERVICE_GROUPS: ServiceGroupDef[] = [
  {
    id: 'bluebubbles',
    title: 'BlueBubbles',
    description: 'iMessage bridge for Messages. Requires a Mac running the BlueBubbles server.',
    icon: ChatText,
    moduleIds: ['messages'],
    optional: true,
    skipLabel: "Skip — I don't have a Mac",
    fields: [
      { label: 'BlueBubbles Host URL', keychainKey: 'bluebubbles.host', placeholder: 'http://100.x.x.x:1234' },
      { label: 'BlueBubbles Password', keychainKey: 'bluebubbles.password', placeholder: 'Desktop password', secret: true },
    ],
    services: [{ name: 'bluebubbles', fieldKeys: ['bluebubbles.host', 'bluebubbles.password'] }],
    testKey: 'bluebubbles',
  },
  {
    id: 'openclaw',
    title: 'Harness',
    description: 'Remote AI harness that can be backed by Hermes compat or OpenClaw.',
    icon: Robot,
    moduleIds: ['chat'],
    optional: false,
    fields: [
      { label: 'Harness API URL', keychainKey: 'openclaw.api-url', placeholder: 'http://100.x.x.x:18789' },
      { label: 'Harness API Key', keychainKey: 'openclaw.api-key', placeholder: 'API key', secret: true },
      { label: 'Harness WebSocket URL', keychainKey: 'openclaw.ws', placeholder: 'ws://100.x.x.x:18789/ws' },
      { label: 'Harness Password', keychainKey: 'openclaw.password', placeholder: 'Password', secret: true },
    ],
    services: [{ name: 'openclaw', fieldKeys: ['openclaw.api-url', 'openclaw.api-key', 'openclaw.ws', 'openclaw.password'] }],
    testKey: 'openclaw',
  },
  {
    id: 'homelab',
    title: 'Home Lab',
    description: 'Proxmox virtualization and OPNsense firewall monitoring.',
    icon: Desktop,
    moduleIds: ['homelab'],
    optional: true,
    skipLabel: "Skip — I don't have a homelab",
    fields: [
      { label: 'Proxmox Host URL', keychainKey: 'proxmox.host', placeholder: 'https://100.x.x.x:8006' },
      { label: 'Proxmox Token ID', keychainKey: 'proxmox.token-id', placeholder: 'user@pam!token-name' },
      { label: 'Proxmox Token Secret', keychainKey: 'proxmox.token-secret', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: true },
      { label: 'OPNsense Host URL', keychainKey: 'opnsense.host', placeholder: 'https://100.x.x.x' },
      { label: 'OPNsense API Key', keychainKey: 'opnsense.key', placeholder: 'API key', secret: true },
      { label: 'OPNsense API Secret', keychainKey: 'opnsense.secret', placeholder: 'API secret', secret: true },
    ],
    services: [
      { name: 'proxmox', fieldKeys: ['proxmox.host', 'proxmox.token-id', 'proxmox.token-secret'] },
      { name: 'opnsense', fieldKeys: ['opnsense.host', 'opnsense.key', 'opnsense.secret'] },
    ],
    testKey: 'proxmox',
  },
  {
    id: 'media',
    title: 'Media Radar',
    description: 'Plex plus ARR stack control for media search, queue, and calendar.',
    icon: FilmStrip,
    moduleIds: ['media'],
    optional: true,
    skipLabel: 'Skip — no media stack',
    fields: [
      { label: 'Plex URL', keychainKey: 'plex.url', placeholder: 'http://100.x.x.x:32400' },
      { label: 'Plex Token', keychainKey: 'plex.token', placeholder: 'X-Plex-Token value', secret: true },
      { label: 'Sonarr URL', keychainKey: 'sonarr.url', placeholder: 'http://100.x.x.x:8989' },
      { label: 'Sonarr API Key', keychainKey: 'sonarr.api-key', placeholder: 'API key', secret: true },
      { label: 'Radarr URL', keychainKey: 'radarr.url', placeholder: 'http://100.x.x.x:7878' },
      { label: 'Radarr API Key', keychainKey: 'radarr.api-key', placeholder: 'API key', secret: true },
      { label: 'Lidarr URL', keychainKey: 'lidarr.url', placeholder: 'http://100.x.x.x:8686' },
      { label: 'Lidarr API Key', keychainKey: 'lidarr.api-key', placeholder: 'API key', secret: true },
      { label: 'Prowlarr URL', keychainKey: 'prowlarr.url', placeholder: 'http://100.x.x.x:9696' },
      { label: 'Prowlarr API Key', keychainKey: 'prowlarr.api-key', placeholder: 'API key', secret: true },
      { label: 'Bazarr URL', keychainKey: 'bazarr.url', placeholder: 'http://100.x.x.x:6767' },
      { label: 'Bazarr API Key', keychainKey: 'bazarr.api-key', placeholder: 'API key', secret: true },
      { label: 'Overseerr URL', keychainKey: 'overseerr.url', placeholder: 'http://100.x.x.x:5055' },
      { label: 'Overseerr API Key', keychainKey: 'overseerr.api-key', placeholder: 'API key', secret: true },
      { label: 'Jellyseerr URL', keychainKey: 'jellyseerr.url', placeholder: 'http://100.x.x.x:5055' },
      { label: 'Jellyseerr API Key', keychainKey: 'jellyseerr.api-key', placeholder: 'API key', secret: true },
      { label: 'Tautulli URL', keychainKey: 'tautulli.url', placeholder: 'http://100.x.x.x:8181' },
      { label: 'Tautulli API Key', keychainKey: 'tautulli.api-key', placeholder: 'API key', secret: true },
      { label: 'qBittorrent URL', keychainKey: 'qbittorrent.url', placeholder: 'http://100.x.x.x:8080' },
      { label: 'qBittorrent Username', keychainKey: 'qbittorrent.username', placeholder: 'username' },
      { label: 'qBittorrent Password', keychainKey: 'qbittorrent.password', placeholder: 'password', secret: true },
      { label: 'SABnzbd URL', keychainKey: 'sabnzbd.url', placeholder: 'http://100.x.x.x:8080' },
      { label: 'SABnzbd API Key', keychainKey: 'sabnzbd.api-key', placeholder: 'API key', secret: true },
      { label: 'NZBGet URL', keychainKey: 'nzbget.url', placeholder: 'http://100.x.x.x:6789' },
      { label: 'NZBGet Username', keychainKey: 'nzbget.username', placeholder: 'username' },
      { label: 'NZBGet Password', keychainKey: 'nzbget.password', placeholder: 'password', secret: true },
      { label: 'Transmission URL', keychainKey: 'transmission.url', placeholder: 'http://100.x.x.x:9091' },
      { label: 'Transmission Username', keychainKey: 'transmission.username', placeholder: 'username' },
      { label: 'Transmission Password', keychainKey: 'transmission.password', placeholder: 'password', secret: true },
      { label: 'Deluge URL', keychainKey: 'deluge.url', placeholder: 'http://100.x.x.x:8112' },
      { label: 'Deluge Password', keychainKey: 'deluge.password', placeholder: 'password', secret: true },
      { label: 'Unraid URL', keychainKey: 'unraid.url', placeholder: 'http://100.x.x.x' },
      { label: 'Unraid API Key', keychainKey: 'unraid.api-key', placeholder: 'API key', secret: true },
      { label: 'Wizarr URL', keychainKey: 'wizarr.url', placeholder: 'http://100.x.x.x:5690' },
      { label: 'Wizarr API Key', keychainKey: 'wizarr.api-key', placeholder: 'API key', secret: true },
    ],
    services: [
      { name: 'plex', fieldKeys: ['plex.url', 'plex.token'] },
      { name: 'sonarr', fieldKeys: ['sonarr.url', 'sonarr.api-key'] },
      { name: 'radarr', fieldKeys: ['radarr.url', 'radarr.api-key'] },
      { name: 'lidarr', fieldKeys: ['lidarr.url', 'lidarr.api-key'] },
      { name: 'prowlarr', fieldKeys: ['prowlarr.url', 'prowlarr.api-key'] },
      { name: 'bazarr', fieldKeys: ['bazarr.url', 'bazarr.api-key'] },
      { name: 'overseerr', fieldKeys: ['overseerr.url', 'overseerr.api-key'] },
      { name: 'jellyseerr', fieldKeys: ['jellyseerr.url', 'jellyseerr.api-key'] },
      { name: 'tautulli', fieldKeys: ['tautulli.url', 'tautulli.api-key'] },
      { name: 'qbittorrent', fieldKeys: ['qbittorrent.url', 'qbittorrent.username', 'qbittorrent.password'] },
      { name: 'sabnzbd', fieldKeys: ['sabnzbd.url', 'sabnzbd.api-key'] },
      { name: 'nzbget', fieldKeys: ['nzbget.url', 'nzbget.username', 'nzbget.password'] },
      { name: 'transmission', fieldKeys: ['transmission.url', 'transmission.username', 'transmission.password'] },
      { name: 'deluge', fieldKeys: ['deluge.url', 'deluge.password'] },
      { name: 'unraid', fieldKeys: ['unraid.url', 'unraid.api-key'] },
      { name: 'wizarr', fieldKeys: ['wizarr.url', 'wizarr.api-key'] },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    description: 'IMAP email integration for inbox monitoring.',
    icon: Envelope,
    moduleIds: ['email'],
    optional: true,
    skipLabel: 'Skip — no email integration',
    fields: [
      { label: 'IMAP Host', keychainKey: 'email.host', placeholder: 'imap.example.com' },
      { label: 'IMAP Port', keychainKey: 'email.port', placeholder: '993', type: 'text' },
      { label: 'Email Username', keychainKey: 'email.user', placeholder: 'you@example.com' },
      { label: 'Email Password', keychainKey: 'email.password', placeholder: 'App password', secret: true },
    ],
    services: [{ name: 'email', fieldKeys: ['email.host', 'email.port', 'email.user', 'email.password'] }],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'CalDAV calendar integration.',
    icon: CalendarDots,
    moduleIds: ['calendar'],
    optional: true,
    skipLabel: 'Skip — no CalDAV',
    fields: [
      { label: 'CalDAV URL', keychainKey: 'caldav.url', placeholder: 'https://caldav.example.com/dav/' },
      { label: 'CalDAV Username', keychainKey: 'caldav.username', placeholder: 'username' },
      { label: 'CalDAV Password', keychainKey: 'caldav.password', placeholder: 'Password', secret: true },
    ],
    services: [{ name: 'caldav', fieldKeys: ['caldav.url', 'caldav.username', 'caldav.password'] }],
  },
  {
    id: 'ntfy',
    title: 'Notifications (ntfy)',
    description: 'Push notifications via ntfy server.',
    icon: Bell,
    moduleIds: [],
    optional: true,
    skipLabel: 'Skip — no ntfy',
    fields: [
      { label: 'ntfy URL', keychainKey: 'ntfy.url', placeholder: 'https://ntfy.example.com' },
      { label: 'ntfy Topic', keychainKey: 'ntfy.topic', placeholder: 'clawcontrol' },
    ],
    services: [{ name: 'ntfy', fieldKeys: ['ntfy.url', 'ntfy.topic'] }],
  },
  {
    id: 'anthropic',
    title: 'Anthropic',
    description: 'Anthropic API key for direct Claude access.',
    icon: Brain,
    moduleIds: [],
    optional: true,
    skipLabel: 'Skip — no Anthropic key',
    fields: [
      { label: 'Anthropic API Key', keychainKey: 'anthropic.api-key', placeholder: 'sk-ant-...', secret: true },
    ],
    services: [{ name: 'anthropic', fieldKeys: ['anthropic.api-key'] }],
  },
  {
    id: 'lightrag',
    title: 'LightRAG',
    description: 'Semantic knowledge retrieval for Memory and Knowledge.',
    icon: Brain,
    moduleIds: ['memory', 'knowledge'],
    optional: true,
    skipLabel: 'Skip — no LightRAG',
    fields: [
      { label: 'LightRAG Base URL', keychainKey: 'lightrag.base-url', placeholder: 'http://your-lightrag-host:9621' },
      { label: 'LightRAG API Key', keychainKey: 'lightrag.api-key', placeholder: 'API key', secret: true },
      { label: 'memd RAG Sidecar URL', keychainKey: 'memd.rag-url', placeholder: 'http://100.x.x.x:9000' },
    ],
    services: [
      { name: 'lightrag', fieldKeys: ['lightrag.base-url', 'lightrag.api-key'] },
      { name: 'memd', fieldKeys: ['memd.rag-url'] },
    ],
  },
]

export const CONNECTION_SETTINGS: ConnectionSettingDef[] = [
  {
    id: 'bluebubbles',
    label: 'BlueBubbles',
    description: 'iMessage bridge server URL',
    urlKeychainKey: 'bluebubbles.host',
    urlPlaceholder: 'http://100.x.x.x:1234',
    expectedHostPreferenceKey: 'bluebubbles.expected-host',
    expectedHostPlaceholder: 'e.g. macbook',
    apiSecretService: 'bluebubbles',
  },
  {
    id: 'openclaw',
    label: 'Harness API',
    description: 'Remote AI harness API',
    urlKeychainKey: 'openclaw.api-url',
    urlPlaceholder: 'http://100.x.x.x:18789',
    expectedHostPreferenceKey: 'openclaw.expected-host',
    expectedHostPlaceholder: 'e.g. ai-host',
    apiSecretService: 'openclaw',
  },
  {
    id: 'sunshine',
    label: 'Sunshine Host',
    description: 'Harness VM remote desktop host for Moonlight',
    urlKeychainKey: 'sunshine.host',
    urlPlaceholder: '100.x.x.x or openclaw.tailnet.ts.net',
    expectedHostPreferenceKey: 'sunshine.expected-host',
    expectedHostPlaceholder: 'e.g. openclaw',
    apiSecretService: 'sunshine',
  },
  {
    id: 'vnc',
    label: 'Embedded Viewer',
    description: 'VNC endpoint used by the in-app remote viewer',
    urlKeychainKey: 'vnc.host',
    urlPlaceholder: '127.0.0.1:5901',
    expectedHostPreferenceKey: 'vnc.expected-host',
    expectedHostPlaceholder: 'e.g. openclaw-vnc',
    apiSecretService: 'vnc',
  },
  {
    id: 'agentsecrets',
    label: 'AgentSecrets',
    description: 'Zero-trust secret broker URL',
    urlKeychainKey: 'agentsecrets.url',
    urlPlaceholder: 'http://100.x.x.x:4815',
    expectedHostPreferenceKey: 'agentsecrets.expected-host',
    expectedHostPlaceholder: 'e.g. secrets-host',
    apiSecretService: 'agentsecrets',
  },
  {
    id: 'agentshell',
    label: 'AgentShell',
    description: 'Harness adapter shell URL',
    urlKeychainKey: 'agentshell.url',
    urlPlaceholder: 'http://100.x.x.x:8077',
    expectedHostPreferenceKey: 'agentshell.expected-host',
    expectedHostPlaceholder: 'e.g. clawcontrol-desktop',
    apiSecretService: 'agentshell',
  },
]

export function keychainKeyToCredKey(keychainKey: string): string {
  const parts = keychainKey.split('.')
  const credPart = parts.slice(1).join('_')
  return credPart.replace(/-/g, '_')
}

export function buildServiceCredentialMap(entries: Array<ServiceCredentialsEntry>): Record<string, Record<string, string>> {
  const grouped: Record<string, Record<string, string>> = {}

  for (const { service, keychainKey, value } of entries) {
    const trimmed = value?.trim()
    if (!service.trim() || !trimmed) {
      continue
    }

    if (!grouped[service]) {
      grouped[service] = {}
    }
    const credKey = keychainKeyToCredKey(keychainKey)
    grouped[service][credKey] = trimmed
  }

  return grouped
}

export function buildCredentialMap(entries: Array<[string, string | undefined | null]>): Record<string, string> {
  const credentials: Record<string, string> = {}
  for (const [keychainKey, value] of entries) {
    const trimmed = value?.trim()
    if (trimmed) {
      credentials[keychainKeyToCredKey(keychainKey)] = trimmed
    }
  }
  return credentials
}
