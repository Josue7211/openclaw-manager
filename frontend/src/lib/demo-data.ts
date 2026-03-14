// Demo mode — shows mock data when no services are connected.
// Activated when VITE_SUPABASE_URL is not set.

import type { Todo, Mission, CalendarEvent } from './types'

export const DEMO_TODOS: Todo[] = [
  { id: 'demo-1', text: 'Set up Supabase instance', done: false },
  { id: 'demo-2', text: 'Configure BlueBubbles on Mac', done: false },
  { id: 'demo-3', text: 'Connect OpenClaw AI agent', done: false },
  { id: 'demo-4', text: 'Explore Mission Control features', done: true },
]

export const DEMO_MISSIONS: Mission[] = [
  {
    id: 'demo-m1',
    title: 'Welcome to Mission Control',
    status: 'active',
    assignee: 'demo',
    progress: 50,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-m2',
    title: 'Sample completed mission',
    status: 'done',
    assignee: 'demo',
    progress: 100,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
]

export const DEMO_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'demo-cal-1',
    title: 'Set up your first service',
    start: new Date().toISOString(),
    allDay: true,
    calendar: 'demo',
  },
]

export interface DemoConversation {
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
    lastMessage: 'Welcome to Mission Control!',
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

let _isDemoMode: boolean | null = null

export function isDemoMode(): boolean {
  if (_isDemoMode !== null) return _isDemoMode
  _isDemoMode = !import.meta.env.VITE_SUPABASE_URL
  return _isDemoMode
}
