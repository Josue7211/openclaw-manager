import { describe, expect, it } from 'vitest'
import { normalizeCodexLbUsage } from '../codex-lb-usage'

describe('normalizeCodexLbUsage', () => {
  it('normalizes aggregate-only usage', () => {
    const usage = normalizeCodexLbUsage({
      total_tokens: 42000,
      total_cost: 1.25,
      used: 60,
      limit: 100,
      period: 'May 2026',
    })

    expect(usage).toEqual(expect.objectContaining({
      totalTokens: 42000,
      totalCost: 1.25,
      used: 60,
      remaining: 40,
      percent: 60,
      period: 'May 2026',
      accounts: [],
    }))
  })

  it('normalizes account rows and usage windows', () => {
    const usage = normalizeCodexLbUsage({
      accounts: [
        {
          email: 'one@example.com',
          remaining: 20,
          limit: 100,
          fiveHour: { used: 30, limit: 100 },
          weekly: { remaining: 70, limit: 200 },
        },
      ],
      five_hour: { used: 45, limit: 100 },
      weekly: { used: 120, limit: 200 },
    })

    expect(usage?.windows).toEqual([
      expect.objectContaining({ id: 'fiveHour', percent: 45 }),
      expect.objectContaining({ id: 'weekly', percent: 60 }),
    ])
    expect(usage?.accounts[0]).toEqual(expect.objectContaining({
      label: 'one@example.com',
      remaining: 20,
      used: 80,
      percent: 80,
    }))
    expect(usage?.accounts[0].windows).toEqual([
      expect.objectContaining({ id: 'fiveHour', percent: 30 }),
      expect.objectContaining({ id: 'weekly', percent: 65 }),
    ])
  })

  it('accepts camelCase and keyed user maps', () => {
    const usage = normalizeCodexLbUsage({
      totalTokens: 9000,
      totalCost: '2.50',
      resetAt: '2026-05-18T12:00:00Z',
      users: {
        personal: {
          usedTokens: '1,500',
          tokenLimit: '3,000',
          fiveHourLimit: 100,
          fiveHourUsed: 25,
        },
      },
    })

    expect(usage?.totalTokens).toBe(9000)
    expect(usage?.totalCost).toBe(2.5)
    expect(usage?.resetAt).toBe('2026-05-18T12:00:00Z')
    expect(usage?.accounts[0]).toEqual(expect.objectContaining({
      label: 'personal',
      used: 1500,
      limit: 3000,
      remaining: 1500,
      percent: 50,
    }))
    expect(usage?.accounts[0].windows[0]).toEqual(expect.objectContaining({ id: 'fiveHour', percent: 25 }))
  })

  it('ignores malformed account rows', () => {
    const usage = normalizeCodexLbUsage({
      accounts: [null, 'bad', { used: 1 }, { name: 'valid', used: 1 }],
    })

    expect(usage?.accounts).toHaveLength(1)
    expect(usage?.accounts[0].label).toBe('valid')
  })

  it('returns null for malformed usage payloads', () => {
    expect(normalizeCodexLbUsage(null)).toBeNull()
    expect(normalizeCodexLbUsage([])).toBeNull()
  })
})
