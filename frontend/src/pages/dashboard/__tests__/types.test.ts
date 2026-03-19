import { describe, it, expect } from 'vitest'
import {
  missionStatusStyle,
  effortColor,
  pillStyle,
} from '../types'
import type { Idea, AgentInfo, HeartbeatData } from '../types'

/* ── missionStatusStyle ───────────────────────────────────────────────── */

describe('missionStatusStyle', () => {
  it('returns green-tinted style for "done"', () => {
    const style = missionStatusStyle('done')
    expect(style.background).toMatch(/green/)
    expect(style.color).toBe('var(--green-bright)')
    expect(style.border).toMatch(/green/)
  })

  it('returns blue-tinted style for "active"', () => {
    const style = missionStatusStyle('active')
    expect(style.background).toMatch(/blue/)
    expect(style.color).toBe('var(--blue-bright)')
    expect(style.border).toMatch(/blue/)
  })

  it('returns muted fallback style for unknown status', () => {
    const style = missionStatusStyle('pending')
    expect(style.background).toBe('var(--hover-bg)')
    expect(style.color).toBe('var(--text-muted)')
    expect(style.border).toBe('1px solid var(--border)')
  })

  it('returns fallback for empty string', () => {
    const style = missionStatusStyle('')
    expect(style.color).toBe('var(--text-muted)')
  })

  it('returns fallback for arbitrary strings', () => {
    const style = missionStatusStyle('cancelled')
    expect(style.color).toBe('var(--text-muted)')
  })

  it('all returned styles have background, color, and border', () => {
    for (const status of ['done', 'active', 'pending', 'unknown']) {
      const style = missionStatusStyle(status)
      expect(style).toHaveProperty('background')
      expect(style).toHaveProperty('color')
      expect(style).toHaveProperty('border')
    }
  })
})

/* ── effortColor ──────────────────────────────────────────────────────── */

describe('effortColor', () => {
  it('returns green for "low"', () => {
    expect(effortColor('low')).toBe('var(--green)')
  })

  it('returns amber for "medium"', () => {
    expect(effortColor('medium')).toBe('var(--amber)')
  })

  it('returns red-bright for "high"', () => {
    expect(effortColor('high')).toBe('var(--red-bright)')
  })

  it('returns text-muted for null', () => {
    expect(effortColor(null)).toBe('var(--text-muted)')
  })

  it('returns text-muted for unknown values', () => {
    expect(effortColor('extreme')).toBe('var(--text-muted)')
  })

  it('returns text-muted for empty string', () => {
    expect(effortColor('')).toBe('var(--text-muted)')
  })
})

/* ── pillStyle ────────────────────────────────────────────────────────── */

describe('pillStyle', () => {
  it('returns inline-block display', () => {
    expect(pillStyle('low').display).toBe('inline-block')
  })

  it('has border-radius 999px (fully rounded)', () => {
    expect(pillStyle('low').borderRadius).toBe('999px')
  })

  it('has capitalize text-transform', () => {
    expect(pillStyle('medium').textTransform).toBe('capitalize')
  })

  it('uses effortColor for the color property', () => {
    expect(pillStyle('low').color).toBe('var(--green)')
    expect(pillStyle('medium').color).toBe('var(--amber)')
    expect(pillStyle('high').color).toBe('var(--red-bright)')
    expect(pillStyle(null).color).toBe('var(--text-muted)')
  })

  it('background includes the color with alpha suffix', () => {
    const style = pillStyle('low')
    expect(style.background).toContain('var(--green)')
    expect(style.background).toContain('22')
  })

  it('border includes the color with alpha suffix', () => {
    const style = pillStyle('high')
    expect(style.border).toContain('var(--red-bright)')
    expect(style.border).toContain('44')
  })

  it('has fontWeight 600', () => {
    expect(pillStyle('medium').fontWeight).toBe(600)
  })

  it('has fontSize 10px', () => {
    expect(pillStyle('low').fontSize).toBe('10px')
  })

  it('returns consistent structure for null', () => {
    const style = pillStyle(null)
    expect(style.display).toBe('inline-block')
    expect(style.color).toBe('var(--text-muted)')
    expect(style.background).toContain('var(--text-muted)')
  })
})

/* ── Type structural validation ───────────────────────────────────────── */

describe('type exports', () => {
  it('Idea type is structurally valid', () => {
    const idea: Idea = {
      id: 'idea-1',
      title: 'Auto-scaling',
      description: 'Scale based on load',
      why: 'Reduce manual ops',
      effort: 'high',
      impact: 'high',
      category: 'infrastructure',
      status: 'pending',
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(idea.id).toBeTruthy()
    expect(idea.effort).toBe('high')
  })

  it('Idea nullable fields can be null', () => {
    const idea: Idea = {
      id: 'idea-2',
      title: 'Minimal',
      description: null,
      why: null,
      effort: null,
      impact: null,
      category: null,
      status: 'pending',
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(idea.description).toBeNull()
    expect(idea.why).toBeNull()
    expect(idea.effort).toBeNull()
  })

  it('AgentInfo type is structurally valid', () => {
    const agent: AgentInfo = {
      id: 'agent-1',
      display_name: 'Coder',
      emoji: '🤖',
      model: 'claude-sonnet-4-6',
      role: 'developer',
      status: 'active',
      current_task: 'Building feature X',
    }
    expect(agent.display_name).toBe('Coder')
    expect(agent.current_task).toBe('Building feature X')
  })

  it('AgentInfo optional fields default to undefined', () => {
    const agent: AgentInfo = {
      id: 'agent-2',
      display_name: 'Reviewer',
      emoji: '👁',
      model: 'claude-opus-4-6',
      role: 'reviewer',
      status: 'idle',
      current_task: null,
    }
    expect(agent.sort_order).toBeUndefined()
    expect(agent.current_task).toBeNull()
  })

  it('HeartbeatData type is structurally valid', () => {
    const hb: HeartbeatData = {
      lastCheck: '2026-03-15T12:00:00Z',
      status: 'healthy',
      tasks: ['check-db', 'check-api'],
    }
    expect(hb.tasks).toHaveLength(2)
  })

  it('HeartbeatData lastCheck can be null', () => {
    const hb: HeartbeatData = {
      lastCheck: null,
      status: 'unknown',
      tasks: [],
    }
    expect(hb.lastCheck).toBeNull()
  })
})
