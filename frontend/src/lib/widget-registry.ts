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
    component: () => import('@/components/widgets/PomodoroWidget').then(m => ({ default: m.PomodoroWidget })),
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
      description: 'Agent status and live processes',
      widgetIds: ['agent-status', 'agents'],
    },
    {
      id: 'mission-control',
      name: 'Mission Control',
      description: 'Missions and idea pipeline',
      widgetIds: ['missions', 'idea-briefing'],
    },
    {
      id: 'system-overview',
      name: 'System Overview',
      description: 'Health, network, and sessions',
      widgetIds: ['heartbeat', 'network', 'sessions'],
    },
  ]
}
