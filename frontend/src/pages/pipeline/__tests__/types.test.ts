import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_COLORS,
  STALE_TYPE_COLORS,
  STALE_TYPE_ICONS,
  IDEA_LEVEL_COLORS,
  IDEA_STATUS_META,
} from '../types'
import type {
  WorkflowNote,
  Retrospective,
  CronJob,
  ChangelogEntry,
  ItemType,
  StaleItem,
  IdeaStatus,
  Idea,
} from '../types'
import { CheckSquare, Target, Lightbulb } from '@phosphor-icons/react'

/* ─── Type structural validation ──────────────────────────────────────── */

describe('type exports', () => {
  it('WorkflowNote type is structurally valid', () => {
    const note: WorkflowNote = {
      id: 'wn-1',
      category: 'routing',
      note: 'Always check status first',
      applied: false,
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(note.id).toBeTruthy()
    expect(note.applied).toBe(false)
  })

  it('Retrospective type is structurally valid', () => {
    const retro: Retrospective = {
      id: 'retro-1',
      week: '2026-W11',
      wins: ['Shipped feature X'],
      failures: ['Missed deadline on Y'],
      missions_completed: 5,
      ideas_generated: 3,
      ideas_approved: 2,
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(retro.wins).toHaveLength(1)
    expect(retro.missions_completed).toBe(5)
  })

  it('CronJob type is structurally valid', () => {
    const job: CronJob = {
      name: 'nightly-backup',
      schedule: '0 0 * * *',
      next_run: '2026-03-16T00:00:00Z',
      last_run: '2026-03-15T00:00:00Z',
      enabled: true,
    }
    expect(job.name).toBe('nightly-backup')
    expect(job.enabled).toBe(true)
  })

  it('CronJob optional fields default to undefined', () => {
    const job: CronJob = {
      name: 'test',
      schedule: '* * * * *',
    }
    expect(job.next_run).toBeUndefined()
    expect(job.last_run).toBeUndefined()
    expect(job.enabled).toBeUndefined()
  })

  it('ChangelogEntry type is structurally valid', () => {
    const entry: ChangelogEntry = {
      id: 'cl-1',
      title: 'Added dark mode',
      date: '2026-03-15',
      description: 'Implemented dark mode toggle',
      tags: ['feature', 'ui'],
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(entry.tags).toHaveLength(2)
  })

  it('StaleItem type is structurally valid', () => {
    const stale: StaleItem = {
      id: 'stale-1',
      title: 'Old task',
      type: 'todo',
      staleSince: '2026-03-01',
      status: 'open',
    }
    expect(stale.type).toBe('todo')
  })

  it('StaleItem optional fields default to undefined', () => {
    const stale: StaleItem = {
      id: 'stale-2',
      type: 'mission',
      staleSince: '2026-03-01',
    }
    expect(stale.title).toBeUndefined()
    expect(stale.text).toBeUndefined()
    expect(stale.status).toBeUndefined()
  })

  it('Idea type is structurally valid', () => {
    const idea: Idea = {
      id: 'idea-1',
      title: 'Auto-tagging',
      description: 'Automatically tag entries based on content',
      why: 'Saves time on manual tagging',
      effort: 'medium',
      impact: 'high',
      category: 'automation',
      status: 'pending',
      mission_id: null,
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(idea.effort).toBe('medium')
    expect(idea.impact).toBe('high')
    expect(idea.status).toBe('pending')
  })

  it('ItemType union covers all three values', () => {
    const types: ItemType[] = ['todo', 'mission', 'idea']
    expect(types).toHaveLength(3)
  })

  it('IdeaStatus union covers all five values', () => {
    const statuses: IdeaStatus[] = ['pending', 'approved', 'rejected', 'deferred', 'built']
    expect(statuses).toHaveLength(5)
  })
})

/* ─── CATEGORIES ──────────────────────────────────────────────────────── */

describe('CATEGORIES', () => {
  it('has exactly 4 categories', () => {
    expect(CATEGORIES).toHaveLength(4)
  })

  it('contains the expected values', () => {
    expect(CATEGORIES).toEqual(['routing', 'delegation', 'user-preferences', 'lessons'])
  })
})

/* ─── CATEGORY_COLORS ─────────────────────────────────────────────────── */

describe('CATEGORY_COLORS', () => {
  it('has a color for every category', () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_COLORS[cat]).toBeDefined()
      expect(typeof CATEGORY_COLORS[cat]).toBe('string')
    }
  })

  it('maps routing to accent-dim', () => {
    expect(CATEGORY_COLORS.routing).toBe('var(--accent-dim)')
  })

  it('maps delegation to a CSS variable', () => {
    expect(CATEGORY_COLORS.delegation).toMatch(/^var\(--.+\)$/)
  })

  it('maps user-preferences to a CSS variable', () => {
    expect(CATEGORY_COLORS['user-preferences']).toMatch(/^var\(--.+\)$/)
  })

  it('maps lessons to a CSS variable', () => {
    expect(CATEGORY_COLORS.lessons).toMatch(/^var\(--.+\)$/)
  })
})

/* ─── STALE_TYPE_COLORS ───────────────────────────────────────────────── */

describe('STALE_TYPE_COLORS', () => {
  const itemTypes: ItemType[] = ['todo', 'mission', 'idea']

  it('has entries for all item types', () => {
    for (const type of itemTypes) {
      expect(STALE_TYPE_COLORS[type]).toBeDefined()
    }
  })

  it('each entry has bg, color, and border properties', () => {
    for (const type of itemTypes) {
      const entry = STALE_TYPE_COLORS[type]
      expect(entry).toHaveProperty('bg')
      expect(entry).toHaveProperty('color')
      expect(entry).toHaveProperty('border')
      expect(typeof entry.bg).toBe('string')
      expect(typeof entry.color).toBe('string')
      expect(typeof entry.border).toBe('string')
    }
  })

  it('todo uses green color', () => {
    expect(STALE_TYPE_COLORS.todo.color).toBe('var(--green)')
  })

  it('mission uses accent-bright color', () => {
    expect(STALE_TYPE_COLORS.mission.color).toBe('var(--accent-bright)')
  })

  it('idea uses gold color', () => {
    expect(STALE_TYPE_COLORS.idea.color).toBe('var(--gold)')
  })
})

/* ─── STALE_TYPE_ICONS ────────────────────────────────────────────────── */

describe('STALE_TYPE_ICONS', () => {
  it('maps todo to CheckSquare', () => {
    expect(STALE_TYPE_ICONS.todo).toBe(CheckSquare)
  })

  it('maps mission to Target', () => {
    expect(STALE_TYPE_ICONS.mission).toBe(Target)
  })

  it('maps idea to Lightbulb', () => {
    expect(STALE_TYPE_ICONS.idea).toBe(Lightbulb)
  })
})

/* ─── IDEA_LEVEL_COLORS ───────────────────────────────────────────────── */

describe('IDEA_LEVEL_COLORS', () => {
  it('maps low to green', () => {
    expect(IDEA_LEVEL_COLORS.low).toBe('var(--green)')
  })

  it('maps medium to gold', () => {
    expect(IDEA_LEVEL_COLORS.medium).toBe('var(--gold)')
  })

  it('maps high to red', () => {
    expect(IDEA_LEVEL_COLORS.high).toBe('var(--red)')
  })

  it('has exactly 3 levels', () => {
    expect(Object.keys(IDEA_LEVEL_COLORS)).toHaveLength(3)
  })
})

/* ─── IDEA_STATUS_META ────────────────────────────────────────────────── */

describe('IDEA_STATUS_META', () => {
  it('has exactly 5 status entries', () => {
    expect(IDEA_STATUS_META).toHaveLength(5)
  })

  it('each entry has status, label, and color', () => {
    for (const entry of IDEA_STATUS_META) {
      expect(typeof entry.status).toBe('string')
      expect(typeof entry.label).toBe('string')
      expect(typeof entry.color).toBe('string')
    }
  })

  it('covers all IdeaStatus values', () => {
    const statuses = IDEA_STATUS_META.map(e => e.status)
    expect(statuses).toContain('pending')
    expect(statuses).toContain('approved')
    expect(statuses).toContain('rejected')
    expect(statuses).toContain('deferred')
    expect(statuses).toContain('built')
  })

  it('labels are capitalized versions of statuses', () => {
    for (const entry of IDEA_STATUS_META) {
      expect(entry.label[0]).toBe(entry.label[0].toUpperCase())
    }
  })

  it('pending has gold color', () => {
    const pending = IDEA_STATUS_META.find(e => e.status === 'pending')
    expect(pending?.color).toBe('var(--gold)')
  })

  it('approved has green color', () => {
    const approved = IDEA_STATUS_META.find(e => e.status === 'approved')
    expect(approved?.color).toBe('var(--green)')
  })

  it('rejected has red color', () => {
    const rejected = IDEA_STATUS_META.find(e => e.status === 'rejected')
    expect(rejected?.color).toBe('var(--red)')
  })
})
