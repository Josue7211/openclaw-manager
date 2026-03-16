import { describe, it, expect } from 'vitest'
import { MOTIVATIONS } from '../types'
import type { ProxmoxVM, ProxmoxNodeStat, OPNsenseData, DailyReviewRecord } from '../types'

/* ── MOTIVATIONS ──────────────────────────────────────────────────────── */

describe('MOTIVATIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MOTIVATIONS)).toBe(true)
    expect(MOTIVATIONS.length).toBeGreaterThan(0)
  })

  it('has exactly 7 motivations', () => {
    expect(MOTIVATIONS).toHaveLength(7)
  })

  it('every entry is a non-empty string', () => {
    for (const m of MOTIVATIONS) {
      expect(typeof m).toBe('string')
      expect(m.length).toBeGreaterThan(0)
    }
  })

  it('every entry ends with a period', () => {
    for (const m of MOTIVATIONS) {
      expect(m.endsWith('.')).toBe(true)
    }
  })

  it('has no duplicate entries', () => {
    const unique = new Set(MOTIVATIONS)
    expect(unique.size).toBe(MOTIVATIONS.length)
  })

  it('first motivation mentions shipping', () => {
    expect(MOTIVATIONS[0].toLowerCase()).toContain('ship')
  })
})

/* ── Type structural validation ───────────────────────────────────────── */

describe('type exports', () => {
  it('ProxmoxVM type is structurally valid', () => {
    const vm: ProxmoxVM = {
      vmid: 100,
      name: 'services-vm',
      status: 'running',
      cpuPercent: 12.5,
      memUsedGB: 4.2,
      memTotalGB: 16,
      node: 'pve',
    }
    expect(vm.vmid).toBe(100)
    expect(vm.status).toBe('running')
  })

  it('ProxmoxNodeStat type is structurally valid', () => {
    const stat: ProxmoxNodeStat = {
      node: 'pve',
      cpuPercent: 25.0,
      memUsedGB: 24.5,
      memTotalGB: 64,
      memPercent: 38.3,
    }
    expect(stat.node).toBe('pve')
    expect(stat.memPercent).toBeCloseTo(38.3)
  })

  it('OPNsenseData type is structurally valid', () => {
    const data: OPNsenseData = {
      wanIn: '1.2 GB',
      wanOut: '500 MB',
      updateAvailable: true,
      version: '24.7',
    }
    expect(data.updateAvailable).toBe(true)
    expect(data.version).toBe('24.7')
  })

  it('DailyReviewRecord type is structurally valid', () => {
    const review: DailyReviewRecord = {
      id: 'review-1',
      date: '2026-03-15',
      accomplishments: 'Shipped chat feature',
      priorities: 'Finish tests',
      notes: 'Good day overall',
      created_at: '2026-03-15T23:00:00Z',
    }
    expect(review.date).toBe('2026-03-15')
    expect(review.accomplishments).toContain('chat')
  })
})
