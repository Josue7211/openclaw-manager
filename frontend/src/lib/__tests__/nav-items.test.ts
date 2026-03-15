import { describe, it, expect } from 'vitest'
import {
  personalDashboardItems,
  agentDashboardItems,
  allNavItems,
  navItemsByHref,
} from '../nav-items'
import type { NavItem } from '../nav-items'

describe('personalDashboardItems', () => {
  it('has items defined', () => {
    expect(personalDashboardItems.length).toBeGreaterThan(0)
  })

  it('every item has href, label, and icon', () => {
    for (const item of personalDashboardItems) {
      expect(item.href).toMatch(/^\//)
      expect(item.label).toBeTruthy()
      expect(item.icon).toBeDefined()
      expect(item.icon).toBeTruthy()
    }
  })

  it('includes Home at /', () => {
    const home = personalDashboardItems.find(i => i.href === '/')
    expect(home).toBeDefined()
    expect(home!.label).toBe('Home')
  })

  it('Home has no moduleId (always visible)', () => {
    const home = personalDashboardItems.find(i => i.href === '/')
    expect(home!.moduleId).toBeUndefined()
  })

  it('non-Home items have moduleId for toggling', () => {
    const nonHome = personalDashboardItems.filter(i => i.href !== '/')
    for (const item of nonHome) {
      expect(item.moduleId).toBeTruthy()
    }
  })
})

describe('agentDashboardItems', () => {
  it('has items defined', () => {
    expect(agentDashboardItems.length).toBeGreaterThan(0)
  })

  it('every item has href, label, icon, and moduleId', () => {
    for (const item of agentDashboardItems) {
      expect(item.href).toMatch(/^\//)
      expect(item.label).toBeTruthy()
      expect(item.icon).toBeDefined()
      expect(item.moduleId).toBeTruthy()
    }
  })

  it('includes Dashboard, Missions, and Agents', () => {
    const labels = agentDashboardItems.map(i => i.label)
    expect(labels).toContain('Dashboard')
    expect(labels).toContain('Missions')
    expect(labels).toContain('Agents')
  })
})

describe('allNavItems', () => {
  it('contains all personal and agent items plus Settings', () => {
    const expectedCount = personalDashboardItems.length + agentDashboardItems.length + 1
    expect(allNavItems.length).toBe(expectedCount)
  })

  it('includes Settings with /settings href', () => {
    const settings = allNavItems.find(i => i.href === '/settings')
    expect(settings).toBeDefined()
    expect(settings!.label).toBe('Settings')
  })

  it('Settings has no moduleId (always visible)', () => {
    const settings = allNavItems.find(i => i.href === '/settings')
    expect(settings!.moduleId).toBeUndefined()
  })

  it('all hrefs are unique', () => {
    const hrefs = allNavItems.map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe('navItemsByHref', () => {
  it('is a Map', () => {
    expect(navItemsByHref).toBeInstanceOf(Map)
  })

  it('has the same size as allNavItems', () => {
    expect(navItemsByHref.size).toBe(allNavItems.length)
  })

  it('looks up items correctly by href', () => {
    for (const item of allNavItems) {
      const found = navItemsByHref.get(item.href)
      expect(found).toBeDefined()
      expect(found!.label).toBe(item.label)
      expect(found!.href).toBe(item.href)
    }
  })

  it('returns undefined for unknown hrefs', () => {
    expect(navItemsByHref.get('/nonexistent')).toBeUndefined()
    expect(navItemsByHref.get('')).toBeUndefined()
  })

  it('lookup result has all NavItem fields', () => {
    const home = navItemsByHref.get('/') as NavItem
    expect(home).toBeDefined()
    expect(home.href).toBe('/')
    expect(home.label).toBe('Home')
    expect(home.icon).toBeTruthy()
  })
})
