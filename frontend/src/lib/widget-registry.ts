/**
 * Widget Registry — defines all available dashboard widgets and provides lookup/registration.
 *
 * Each widget has:
 *   - A unique ID (string)
 *   - Metadata (name, description, icon, category)
 *   - A lazy-loaded component
 *   - Default/min/max grid sizes
 *   - An optional config schema for per-instance settings
 *
 * The registry is the contract between the dashboard grid, widget picker, and future
 * Bjorn AI-generated modules. Bjorn registers widgets via registerWidget().
 */

import type { ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetProps {
  widgetId: string
  config: Record<string, unknown>
  isEditMode: boolean
  size: { w: number; h: number }
}

export interface WidgetConfigSchema {
  fields: Array<{
    key: string
    label: string
    type: 'text' | 'number' | 'toggle' | 'select' | 'slider'
    default: unknown
    options?: Array<{ label: string; value: unknown }>
    min?: number
    max?: number
  }>
}

export interface WidgetDefinition {
  id: string
  name: string
  description: string
  icon: string
  category: 'monitoring' | 'productivity' | 'ai' | 'media' | 'custom' | 'primitives'
  tier: 'builtin' | 'user' | 'ai'
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  maxSize?: { w: number; h: number }
  configSchema?: WidgetConfigSchema
  component: () => Promise<{ default: ComponentType<WidgetProps> }>
  metadata?: {
    author?: string
    version?: string
    requiresService?: string
  }
}

export interface WidgetBundle {
  id: string
  name: string
  description: string
  widgetIds: string[]
}

export interface WidgetPreset {
  id: string
  name: string
  description: string
  icon: string
  widgets: Array<{
    pluginId: string
    layout: { x: number; y: number; w: number; h: number }
  }>
}

// ---------------------------------------------------------------------------
// Built-in Widgets
// ---------------------------------------------------------------------------

export const BUILTIN_WIDGETS: WidgetDefinition[] = [
  {
    id: 'agent-status',
    name: 'Agent Status',
    description: 'Live status of the primary AI agent',
    icon: 'Robot',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/pages/dashboard/AgentStatusCard').then(m => ({ default: m.AgentStatusCard })),
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    description: 'Agent health check and task queue',
    icon: 'Heartbeat',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/pages/dashboard/HeartbeatCard').then(m => ({ default: m.HeartbeatCard })),
  },
  {
    id: 'agents',
    name: 'Agents',
    description: 'All registered agents and their states',
    icon: 'UsersThree',
    category: 'ai',
    tier: 'builtin',
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    component: () => import('@/pages/dashboard/AgentsCard').then(m => ({ default: m.AgentsCard })),
  },
  {
    id: 'missions',
    name: 'Missions',
    description: 'Active and recent agent missions',
    icon: 'Rocket',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    component: () => import('@/pages/dashboard/MissionsCard').then(m => ({ default: m.MissionsCard })),
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Agent memory file browser',
    icon: 'Brain',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/pages/dashboard/MemoryCard').then(m => ({ default: m.MemoryCard })),
  },
  {
    id: 'idea-briefing',
    name: 'Idea Briefing',
    description: 'Daily idea generation and briefing cards',
    icon: 'Lightbulb',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/pages/dashboard/IdeaBriefingCard').then(m => ({ default: m.IdeaBriefingCard })),
  },
  {
    id: 'network',
    name: 'Network',
    description: 'Tailscale mesh and service connectivity',
    icon: 'WifiHigh',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/pages/dashboard/NetworkCard').then(m => ({ default: m.NetworkCard })),
  },
  {
    id: 'sessions',
    name: 'Sessions',
    description: 'Active terminal and agent sessions',
    icon: 'Terminal',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/pages/dashboard/SessionsCard').then(m => ({ default: m.SessionsCard })),
  },
  {
    id: 'todos',
    name: 'Todos',
    description: 'Today\'s focus tasks and pending todos',
    icon: 'CheckSquare',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    maxSize: { w: 4, h: 4 },
    configSchema: {
      fields: [
        { key: 'maxItems', label: 'Max items', type: 'slider', default: 5, min: 1, max: 15 },
        { key: 'showCompleted', label: 'Show completed', type: 'toggle', default: false },
        { key: 'filter', label: 'Filter', type: 'select', default: 'focus', options: [
          { label: 'Focus', value: 'focus' },
          { label: 'All Pending', value: 'pending' },
          { label: 'All', value: 'all' },
        ]},
      ],
    },
    component: () => import('@/components/widgets/TodosWidget').then(m => ({ default: m.TodosWidget })),
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Today\'s events and upcoming schedule',
    icon: 'CalendarDots',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    maxSize: { w: 4, h: 4 },
    configSchema: {
      fields: [
        { key: 'maxEvents', label: 'Max events', type: 'slider', default: 5, min: 1, max: 15 },
        { key: 'showAllDay', label: 'Show all-day events', type: 'toggle', default: true },
      ],
    },
    component: () => import('@/components/widgets/CalendarWidget').then(m => ({ default: m.CalendarWidget })),
  },
  {
    id: 'reminders',
    name: 'Reminders',
    description: 'Apple Reminders with priority and due dates',
    icon: 'Bell',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    maxSize: { w: 4, h: 4 },
    configSchema: {
      fields: [
        { key: 'maxItems', label: 'Max items', type: 'slider', default: 5, min: 1, max: 15 },
        { key: 'filter', label: 'Filter', type: 'select', default: 'today', options: [
          { label: 'Today', value: 'today' },
          { label: 'All Pending', value: 'pending' },
          { label: 'Flagged', value: 'flagged' },
        ]},
      ],
    },
    component: () => import('@/components/widgets/RemindersWidget').then(m => ({ default: m.RemindersWidget })),
  },
  {
    id: 'knowledge',
    name: 'Knowledge Base',
    description: 'Recent knowledge entries and saved articles',
    icon: 'BookOpen',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    maxSize: { w: 4, h: 4 },
    configSchema: {
      fields: [
        { key: 'maxItems', label: 'Max entries', type: 'slider', default: 5, min: 1, max: 15 },
        { key: 'showTags', label: 'Show tags', type: 'toggle', default: true },
      ],
    },
    component: () => import('@/components/widgets/KnowledgeWidget').then(m => ({ default: m.KnowledgeWidget })),
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro Timer',
    description: 'Focus timer with session tracking',
    icon: 'Timer',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 2 },
    maxSize: { w: 2, h: 3 },
    configSchema: {
      fields: [
        { key: 'workDuration', label: 'Work (minutes)', type: 'slider', default: 25, min: 5, max: 60 },
        { key: 'shortBreak', label: 'Short break (minutes)', type: 'slider', default: 5, min: 1, max: 15 },
      ],
    },
    component: () => import('@/components/widgets/PomodoroWidget').then(m => ({ default: m.PomodoroWidget })),
  },
  {
    id: 'recent-notes',
    name: 'Recent Notes',
    description: 'Recently edited notes from your vault',
    icon: 'NotePencil',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/RecentNotesWidget').then(m => ({ default: m.RecentNotesWidget })),
  },
  {
    id: 'pipeline-ideas',
    name: 'Ideas Pipeline',
    description: 'Pending ideas with status counts',
    icon: 'Lightbulb',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/PipelineIdeasWidget').then(m => ({ default: m.PipelineIdeasWidget })),
  },
  {
    id: 'pipeline-status',
    name: 'Pipeline Status',
    description: 'Scheduled jobs and automation status',
    icon: 'Rocket',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/PipelineStatusWidget').then(m => ({ default: m.PipelineStatusWidget })),
  },
  {
    id: 'inbox',
    name: 'Inbox',
    description: 'Recent emails and unread count',
    icon: 'Envelope',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    configSchema: {
      fields: [
        { key: 'maxEmails', label: 'Max emails', type: 'slider', default: 3, min: 1, max: 10 },
        { key: 'showRead', label: 'Show read emails', type: 'toggle', default: false },
      ],
    },
    component: () => import('@/components/widgets/InboxWidget').then(m => ({ default: m.InboxWidget })),
  },
  {
    id: 'homelab-vms',
    name: 'Homelab VMs',
    description: 'Proxmox virtual machines status',
    icon: 'Cpu',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    configSchema: {
      fields: [
        { key: 'maxVMs', label: 'Max VMs', type: 'slider', default: 5, min: 1, max: 20 },
        { key: 'showStopped', label: 'Show stopped VMs', type: 'toggle', default: true },
      ],
    },
    component: () => import('@/components/widgets/HomelabVMsWidget').then(m => ({ default: m.HomelabVMsWidget })),
  },
  {
    id: 'network-status',
    name: 'Network',
    description: 'OPNsense router and WAN traffic',
    icon: 'WifiHigh',
    category: 'monitoring',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/NetworkStatusWidget').then(m => ({ default: m.NetworkStatusWidget })),
  },
  {
    id: 'now-playing',
    name: 'Now Playing',
    description: 'Current Plex playback and recent additions',
    icon: 'Television',
    category: 'media',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    configSchema: {
      fields: [
        { key: 'showRecent', label: 'Show recently added', type: 'toggle', default: true },
        { key: 'maxRecent', label: 'Recent items', type: 'slider', default: 3, min: 1, max: 10 },
      ],
    },
    component: () => import('@/components/widgets/NowPlayingWidget').then(m => ({ default: m.NowPlayingWidget })),
  },
  {
    id: 'upcoming-media',
    name: 'Upcoming Media',
    description: 'Upcoming episodes from Sonarr',
    icon: 'FilmStrip',
    category: 'media',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/UpcomingMediaWidget').then(m => ({ default: m.UpcomingMediaWidget })),
  },
  {
    id: 'messages-summary',
    name: 'Messages',
    description: 'Recent iMessage conversations',
    icon: 'ChatCircle',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    configSchema: {
      fields: [
        { key: 'maxConversations', label: 'Max conversations', type: 'slider', default: 5, min: 1, max: 10 },
      ],
    },
    component: () => import('@/components/widgets/MessagesSummaryWidget').then(m => ({ default: m.MessagesSummaryWidget })),
  },
  {
    id: 'chat-summary',
    name: 'AI Chat',
    description: 'Recent AI chat conversations',
    icon: 'Robot',
    category: 'ai',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/ChatSummaryWidget').then(m => ({ default: m.ChatSummaryWidget })),
  },
  {
    id: 'agents-summary',
    name: 'Agents',
    description: 'Agent status overview',
    icon: 'Users',
    category: 'ai',
    tier: 'builtin',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    component: () => import('@/components/widgets/AgentsSummaryWidget').then(m => ({ default: m.AgentsSummaryWidget })),
  },
]

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _registry = new Map<string, WidgetDefinition>()

// Populate from built-ins
for (const w of BUILTIN_WIDGETS) {
  _registry.set(w.id, w)
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return _registry.get(id)
}

export function getWidgetsByCategory(): Record<string, WidgetDefinition[]> {
  const result: Record<string, WidgetDefinition[]> = {}
  for (const w of _registry.values()) {
    if (!result[w.category]) result[w.category] = []
    result[w.category].push(w)
  }
  return result
}

export function registerWidget(def: WidgetDefinition): void {
  _registry.set(def.id, def)
}

export function getWidgetBundles(): WidgetBundle[] {
  return [
    {
      id: 'agent-monitor',
      name: 'Agent Monitor',
      description: 'Agent status, live processes, and heartbeat',
      widgetIds: ['agent-status', 'agents', 'heartbeat'],
    },
    {
      id: 'mission-control',
      name: 'Mission Control',
      description: 'Missions, idea pipeline, and pipeline status',
      widgetIds: ['missions', 'idea-briefing', 'pipeline-status'],
    },
    {
      id: 'system-overview',
      name: 'System Overview',
      description: 'Homelab VMs, network, and sessions',
      widgetIds: ['homelab-vms', 'network-status', 'network', 'sessions'],
    },
    {
      id: 'daily-driver',
      name: 'Daily Driver',
      description: 'Todos, calendar, reminders, and inbox',
      widgetIds: ['todos', 'calendar', 'reminders', 'inbox'],
    },
    {
      id: 'media-suite',
      name: 'Media Suite',
      description: 'Now playing and upcoming episodes',
      widgetIds: ['now-playing', 'upcoming-media'],
    },
  ]
}

// ---------------------------------------------------------------------------
// Layout Presets — pre-configured dashboard pages
// ---------------------------------------------------------------------------

export const WIDGET_PRESETS: WidgetPreset[] = [
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Homelab VMs, network status, and agent overview',
    icon: 'Pulse',
    widgets: [
      { pluginId: 'homelab-vms', layout: { x: 0, y: 0, w: 4, h: 3 } },
      { pluginId: 'network-status', layout: { x: 4, y: 0, w: 4, h: 2 } },
      { pluginId: 'agent-status', layout: { x: 8, y: 0, w: 4, h: 2 } },
      { pluginId: 'pipeline-status', layout: { x: 4, y: 2, w: 4, h: 2 } },
      { pluginId: 'heartbeat', layout: { x: 8, y: 2, w: 4, h: 2 } },
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    description: 'Todos, calendar, reminders, and pomodoro timer',
    icon: 'CheckSquare',
    widgets: [
      { pluginId: 'todos', layout: { x: 0, y: 0, w: 4, h: 3 } },
      { pluginId: 'calendar', layout: { x: 4, y: 0, w: 4, h: 3 } },
      { pluginId: 'reminders', layout: { x: 8, y: 0, w: 4, h: 3 } },
      { pluginId: 'pomodoro', layout: { x: 0, y: 3, w: 2, h: 2 } },
      { pluginId: 'knowledge', layout: { x: 2, y: 3, w: 4, h: 2 } },
    ],
  },
  {
    id: 'notes-workspace',
    name: 'Notes Workspace',
    description: 'Recent notes and knowledge base entries',
    icon: 'BookOpen',
    widgets: [
      { pluginId: 'recent-notes', layout: { x: 0, y: 0, w: 6, h: 3 } },
      { pluginId: 'knowledge', layout: { x: 6, y: 0, w: 6, h: 3 } },
    ],
  },
  {
    id: 'media-center',
    name: 'Media Center',
    description: 'Now playing, upcoming episodes, and recent additions',
    icon: 'Television',
    widgets: [
      { pluginId: 'now-playing', layout: { x: 0, y: 0, w: 4, h: 3 } },
      { pluginId: 'upcoming-media', layout: { x: 4, y: 0, w: 4, h: 3 } },
      { pluginId: 'inbox', layout: { x: 8, y: 0, w: 4, h: 3 } },
    ],
  },
]

export function getWidgetPresets(): WidgetPreset[] {
  return WIDGET_PRESETS
}
