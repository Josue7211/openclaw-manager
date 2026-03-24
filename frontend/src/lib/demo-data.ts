// Demo mode — shows mock data when no services are connected.
// Activated when VITE_SUPABASE_URL is not set.

import type { Todo, Mission, CalendarEvent } from './types'

// ── Todos ────────────────────────────────────────────────────────────────────

export const DEMO_TODOS: Todo[] = [
  { id: 'demo-1', text: 'Set up Supabase instance', done: false, due_date: new Date().toISOString().slice(0, 10) },
  { id: 'demo-2', text: 'Configure BlueBubbles on Mac', done: false, due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
  { id: 'demo-3', text: 'Connect OpenClaw AI agent', done: false },
  { id: 'demo-4', text: 'Customize sidebar modules', done: false },
  { id: 'demo-5', text: 'Explore OpenClaw Manager features', done: true },
  { id: 'demo-6', text: 'Read the setup guide', done: true },
]

// ── Missions ─────────────────────────────────────────────────────────────────

export const DEMO_MISSIONS: Mission[] = [
  {
    id: 'demo-m1',
    title: 'Welcome to OpenClaw Manager',
    status: 'active',
    assignee: 'bjorn',
    progress: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    task_type: 'feature',
    complexity: 3,
  },
  {
    id: 'demo-m2',
    title: 'Implement dark mode theme engine',
    status: 'active',
    assignee: 'bjorn',
    progress: 75,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    task_type: 'feature',
    complexity: 5,
  },
  {
    id: 'demo-m3',
    title: 'Fix WebSocket reconnection logic',
    status: 'done',
    assignee: 'bjorn',
    progress: 100,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 43200000).toISOString(),
    task_type: 'bugfix',
    complexity: 2,
  },
  {
    id: 'demo-m4',
    title: 'Add keyboard shortcuts modal',
    status: 'done',
    assignee: 'bjorn',
    progress: 100,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    task_type: 'feature',
    complexity: 3,
  },
  {
    id: 'demo-m5',
    title: 'Set up CI/CD pipeline',
    status: 'pending',
    assignee: 'bjorn',
    progress: 0,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    task_type: 'infra',
    complexity: 4,
  },
]

// ── Calendar Events ──────────────────────────────────────────────────────────

const _today = new Date()
const _todayStr = _today.toISOString().slice(0, 10)

export const DEMO_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'demo-cal-1',
    title: 'Set up your first service',
    start: _todayStr,
    allDay: true,
    calendar: 'Personal',
  },
  {
    id: 'demo-cal-2',
    title: 'Standup sync',
    start: `${_todayStr}T09:30:00`,
    end: `${_todayStr}T09:45:00`,
    allDay: false,
    calendar: 'Work',
  },
  {
    id: 'demo-cal-3',
    title: 'Deep work block',
    start: `${_todayStr}T10:00:00`,
    end: `${_todayStr}T12:00:00`,
    allDay: false,
    calendar: 'Personal',
  },
  {
    id: 'demo-cal-4',
    title: 'Code review session',
    start: `${_todayStr}T14:00:00`,
    end: `${_todayStr}T15:00:00`,
    allDay: false,
    calendar: 'Work',
  },
]

// ── Conversations (Messages) ─────────────────────────────────────────────────

interface DemoConversation {
  guid: string
  chatId: string
  displayName: string | null
  participants: { address: string; service: string }[]
  service: string
  lastMessage: string | null
  lastDate: number | null
  lastFromMe: number
}

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    guid: 'demo-conv-1',
    chatId: 'demo@example.com',
    displayName: 'Demo Contact',
    participants: [{ address: 'demo@example.com', service: 'iMessage' }],
    service: 'iMessage',
    lastMessage: 'Welcome to OpenClaw Manager!',
    lastDate: Date.now(),
    lastFromMe: 0,
  },
  {
    guid: 'demo-conv-2',
    chatId: 'team@example.com',
    displayName: 'Team Chat',
    participants: [
      { address: 'alice@example.com', service: 'iMessage' },
      { address: 'bob@example.com', service: 'iMessage' },
    ],
    service: 'iMessage',
    lastMessage: 'Great progress on the project!',
    lastDate: Date.now() - 3600000,
    lastFromMe: 1,
  },
]

// ── Chat (AI conversation) ───────────────────────────────────────────────────

interface DemoChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export const DEMO_CHAT_MESSAGES: DemoChatMessage[] = [
  {
    id: 'demo-chat-1',
    role: 'user',
    text: 'What can OpenClaw Manager do?',
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 'demo-chat-2',
    role: 'assistant',
    text: 'OpenClaw Manager is your personal command center. It brings together:\n\n- **iMessage** via BlueBubbles (requires a Mac)\n- **AI Chat** through OpenClaw\n- **Task management** with real-time sync\n- **Homelab monitoring** (Proxmox, OPNsense)\n- **Agent orchestration** for automated workflows\n\nEach module is optional — enable only what you have set up. Head to **Settings > Connections** to configure your services.',
    timestamp: new Date(Date.now() - 290000).toISOString(),
  },
  {
    id: 'demo-chat-3',
    role: 'user',
    text: 'How do I get started?',
    timestamp: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 'demo-chat-4',
    role: 'assistant',
    text: '1. **Set up Supabase** — self-host or use Supabase Cloud for database + auth\n2. **Configure `.env.local`** with your service URLs\n3. **Run `cargo tauri dev`** to start the full app\n4. **Customize** your sidebar, theme, and keybindings in Settings\n\nYou\'re currently in **demo mode** — everything works with sample data so you can explore the UI before connecting real services.',
    timestamp: new Date(Date.now() - 110000).toISOString(),
  },
]

// ── Dashboard (Agent status, heartbeat, agents) ──────────────────────────────

interface DemoAgentStatus {
  name: string
  emoji: string
  model: string
  status: string
  lastActive: string
  host: string
  ip: string
}

export const DEMO_AGENT_STATUS: DemoAgentStatus = {
  name: 'Bjorn',
  emoji: '🦬',
  model: 'claude-sonnet-4-6',
  status: 'idle',
  lastActive: new Date(Date.now() - 60000).toISOString(),
  host: 'openclaw-vm',
  ip: '100.x.x.x',
}

interface DemoAgentInfo {
  id: string
  display_name: string
  emoji: string
  model: string
  role: string
  status: string
  current_task: string | null
  sort_order: number
  color: string | null
}

export const DEMO_AGENTS: DemoAgentInfo[] = [
  { id: 'demo-agent-1', display_name: 'Bjorn', emoji: '🦬', model: 'claude-sonnet-4-6', role: 'General purpose', status: 'idle', current_task: null, sort_order: 0, color: null },
  { id: 'demo-agent-2', display_name: 'Scout', emoji: '🦅', model: 'claude-haiku-4-5', role: 'Code review', status: 'idle', current_task: null, sort_order: 1, color: null },
  { id: 'demo-agent-3', display_name: 'Atlas', emoji: '🗺️', model: 'claude-opus-4-6', role: 'Architecture', status: 'idle', current_task: null, sort_order: 2, color: null },
]

// ── Homelab (Proxmox + OPNsense) ─────────────────────────────────────────────

export interface DemoProxmoxVM {
  vmid: number
  name: string
  status: string
  cpuPercent: number
  memUsedGB: number
  memTotalGB: number
  node: string
}

export interface DemoProxmoxNode {
  node: string
  cpuPercent: number
  memUsedGB: number
  memTotalGB: number
  memPercent: number
}

export const DEMO_PROXMOX_VMS: DemoProxmoxVM[] = [
  { vmid: 100, name: 'services-vm', status: 'running', cpuPercent: 12, memUsedGB: 3.2, memTotalGB: 8, node: 'pve' },
  { vmid: 101, name: 'openclaw-vm', status: 'running', cpuPercent: 45, memUsedGB: 6.1, memTotalGB: 16, node: 'pve' },
  { vmid: 102, name: 'media-server', status: 'running', cpuPercent: 8, memUsedGB: 2.4, memTotalGB: 4, node: 'pve' },
  { vmid: 103, name: 'backup-vm', status: 'stopped', cpuPercent: 0, memUsedGB: 0, memTotalGB: 4, node: 'pve' },
]

export const DEMO_PROXMOX_NODES: DemoProxmoxNode[] = [
  { node: 'pve', cpuPercent: 24, memUsedGB: 22.4, memTotalGB: 64, memPercent: 35 },
]

export const DEMO_OPNSENSE = {
  wanIn: '1.24 GB',
  wanOut: '312 MB',
  updateAvailable: false,
  version: '24.7.1',
}

let _isDemoMode: boolean | null = null

export function isDemoMode(): boolean {
  if (_isDemoMode !== null) return _isDemoMode
  // Demo mode when no backend database is configured.
  // VITE_SUPABASE_URL indicates the backend has a database to connect to.
  _isDemoMode = !import.meta.env.VITE_SUPABASE_URL
  return _isDemoMode
}
