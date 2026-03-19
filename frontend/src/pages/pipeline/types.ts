import type React from 'react'
import { CheckSquare, Target, Lightbulb } from '@phosphor-icons/react'

export type WorkflowNote = {
  id: string
  category: string
  note: string
  applied: boolean
  created_at: string
}

export type Retrospective = {
  id: string
  week: string
  wins: string[]
  failures: string[]
  missions_completed: number
  ideas_generated: number
  ideas_approved: number
  created_at: string
}

export type CronJob = {
  name: string
  schedule: string
  next_run?: string
  last_run?: string
  enabled?: boolean
}

export type ChangelogEntry = {
  id: string
  title: string
  date: string
  description: string
  tags: string[]
  created_at: string
}

export type ItemType = 'todo' | 'mission' | 'idea'

export type StaleItem = {
  id: string
  title?: string
  text?: string
  type: ItemType
  staleSince: string
  status?: string
}

export type IdeaStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'built'

export interface Idea {
  id: string
  title: string
  description: string
  why: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  category: string
  status: IdeaStatus
  mission_id?: string | null
  created_at: string
}

export const CATEGORIES = ['routing', 'delegation', 'user-preferences', 'lessons']

export const CATEGORY_COLORS: Record<string, string> = {
  routing: 'var(--accent-dim)',
  delegation: '#0891b2',
  'user-preferences': '#059669',
  lessons: '#d97706',
}

export const STALE_TYPE_COLORS: Record<ItemType, { bg: string; color: string; border: string }> = {
  todo: { bg: 'var(--emerald-a12)', color: 'var(--green)', border: 'rgba(59, 165, 92, 0.25)' },
  mission: { bg: 'var(--purple-a12)', color: 'var(--accent-bright)', border: 'var(--border-accent)' },
  idea: { bg: 'var(--gold-a12)', color: 'var(--gold)', border: 'var(--gold-a25)' },
}

export const STALE_TYPE_ICONS: Record<ItemType, React.ElementType> = {
  todo: CheckSquare,
  mission: Target,
  idea: Lightbulb,
}

export const IDEA_LEVEL_COLORS: Record<string, string> = {
  low: 'var(--green)',
  medium: 'var(--gold)',
  high: 'var(--red)',
}

export const IDEA_STATUS_META: { status: IdeaStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pending', color: 'var(--gold)' },
  { status: 'approved', label: 'Approved', color: 'var(--green)' },
  { status: 'built', label: 'Built', color: 'var(--accent-bright)' },
  { status: 'rejected', label: 'Rejected', color: 'var(--red)' },
  { status: 'deferred', label: 'Deferred', color: 'var(--text-muted)' },
]
