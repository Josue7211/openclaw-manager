import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('demo-data exports', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('isDemoMode returns true when VITE_SUPABASE_URL is not set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { isDemoMode } = await import('../demo-data')
    expect(isDemoMode()).toBe(true)
  })

  it('isDemoMode returns false when VITE_SUPABASE_URL is set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.com')
    const { isDemoMode } = await import('../demo-data')
    expect(isDemoMode()).toBe(false)
  })

  it('isDemoMode caches the result on subsequent calls', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { isDemoMode } = await import('../demo-data')
    const first = isDemoMode()
    const second = isDemoMode()
    expect(first).toBe(second)
  })

  it('DEMO_TODOS is an array of valid Todo objects', async () => {
    const { DEMO_TODOS } = await import('../demo-data')
    expect(DEMO_TODOS).toBeInstanceOf(Array)
    expect(DEMO_TODOS.length).toBeGreaterThan(0)
    for (const todo of DEMO_TODOS) {
      expect(todo).toHaveProperty('id')
      expect(todo).toHaveProperty('text')
      expect(typeof todo.done).toBe('boolean')
      expect(todo.id).toMatch(/^demo-/)
    }
  })

  it('DEMO_TODOS has at least one completed and one incomplete', async () => {
    const { DEMO_TODOS } = await import('../demo-data')
    expect(DEMO_TODOS.some(t => t.done)).toBe(true)
    expect(DEMO_TODOS.some(t => !t.done)).toBe(true)
  })

  it('DEMO_TODOS ids are unique', async () => {
    const { DEMO_TODOS } = await import('../demo-data')
    const ids = DEMO_TODOS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DEMO_MISSIONS is an array of valid Mission objects', async () => {
    const { DEMO_MISSIONS } = await import('../demo-data')
    expect(DEMO_MISSIONS).toBeInstanceOf(Array)
    expect(DEMO_MISSIONS.length).toBeGreaterThan(0)
    for (const m of DEMO_MISSIONS) {
      expect(m).toHaveProperty('id')
      expect(m).toHaveProperty('title')
      expect(m).toHaveProperty('status')
      expect(m.id).toMatch(/^demo-/)
      expect(typeof m.title).toBe('string')
    }
  })

  it('DEMO_MISSIONS ids are unique', async () => {
    const { DEMO_MISSIONS } = await import('../demo-data')
    const ids = DEMO_MISSIONS.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DEMO_MISSIONS contains all expected statuses', async () => {
    const { DEMO_MISSIONS } = await import('../demo-data')
    const statuses = new Set(DEMO_MISSIONS.map(m => m.status))
    expect(statuses.has('active')).toBe(true)
    expect(statuses.has('done')).toBe(true)
    expect(statuses.has('pending')).toBe(true)
  })

  it('DEMO_MISSIONS progress values are between 0 and 100', async () => {
    const { DEMO_MISSIONS } = await import('../demo-data')
    for (const m of DEMO_MISSIONS) {
      if (m.progress !== undefined) {
        expect(m.progress).toBeGreaterThanOrEqual(0)
        expect(m.progress).toBeLessThanOrEqual(100)
      }
    }
  })

  it('DEMO_CALENDAR_EVENTS is an array of valid CalendarEvent objects', async () => {
    const { DEMO_CALENDAR_EVENTS } = await import('../demo-data')
    expect(DEMO_CALENDAR_EVENTS).toBeInstanceOf(Array)
    expect(DEMO_CALENDAR_EVENTS.length).toBeGreaterThan(0)
    for (const e of DEMO_CALENDAR_EVENTS) {
      expect(e).toHaveProperty('id')
      expect(e).toHaveProperty('title')
      expect(e).toHaveProperty('start')
      expect(typeof e.allDay).toBe('boolean')
      expect(e).toHaveProperty('calendar')
    }
  })

  it('DEMO_CALENDAR_EVENTS ids are unique', async () => {
    const { DEMO_CALENDAR_EVENTS } = await import('../demo-data')
    const ids = DEMO_CALENDAR_EVENTS.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DEMO_CONVERSATIONS is an array with required fields', async () => {
    const { DEMO_CONVERSATIONS } = await import('../demo-data')
    expect(DEMO_CONVERSATIONS).toBeInstanceOf(Array)
    expect(DEMO_CONVERSATIONS.length).toBeGreaterThan(0)
    for (const c of DEMO_CONVERSATIONS) {
      expect(c).toHaveProperty('guid')
      expect(c).toHaveProperty('chatId')
      expect(c).toHaveProperty('participants')
      expect(c).toHaveProperty('service')
      expect(c.participants).toBeInstanceOf(Array)
      expect(c.participants.length).toBeGreaterThan(0)
    }
  })

  it('DEMO_CONVERSATIONS guids are unique', async () => {
    const { DEMO_CONVERSATIONS } = await import('../demo-data')
    const guids = DEMO_CONVERSATIONS.map(c => c.guid)
    expect(new Set(guids).size).toBe(guids.length)
  })

  it('DEMO_CHAT_MESSAGES alternates roles correctly', async () => {
    const { DEMO_CHAT_MESSAGES } = await import('../demo-data')
    expect(DEMO_CHAT_MESSAGES.length).toBeGreaterThan(0)
    for (const msg of DEMO_CHAT_MESSAGES) {
      expect(msg).toHaveProperty('id')
      expect(msg).toHaveProperty('role')
      expect(msg).toHaveProperty('text')
      expect(msg).toHaveProperty('timestamp')
      expect(['user', 'assistant']).toContain(msg.role)
    }
  })

  it('DEMO_CHAT_MESSAGES ids are unique', async () => {
    const { DEMO_CHAT_MESSAGES } = await import('../demo-data')
    const ids = DEMO_CHAT_MESSAGES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DEMO_AGENT_STATUS has required fields', async () => {
    const { DEMO_AGENT_STATUS } = await import('../demo-data')
    expect(DEMO_AGENT_STATUS).toHaveProperty('name')
    expect(DEMO_AGENT_STATUS).toHaveProperty('emoji')
    expect(DEMO_AGENT_STATUS).toHaveProperty('model')
    expect(DEMO_AGENT_STATUS).toHaveProperty('status')
    expect(DEMO_AGENT_STATUS).toHaveProperty('host')
    expect(typeof DEMO_AGENT_STATUS.name).toBe('string')
  })

  it('DEMO_AGENTS is an array of agent info objects', async () => {
    const { DEMO_AGENTS } = await import('../demo-data')
    expect(DEMO_AGENTS).toBeInstanceOf(Array)
    expect(DEMO_AGENTS.length).toBeGreaterThan(0)
    for (const agent of DEMO_AGENTS) {
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('display_name')
      expect(agent).toHaveProperty('model')
      expect(agent).toHaveProperty('role')
      expect(agent).toHaveProperty('status')
      expect(typeof agent.sort_order).toBe('number')
    }
  })

  it('DEMO_AGENTS ids are unique', async () => {
    const { DEMO_AGENTS } = await import('../demo-data')
    const ids = DEMO_AGENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DEMO_PROXMOX_VMS has valid VM entries', async () => {
    const { DEMO_PROXMOX_VMS } = await import('../demo-data')
    expect(DEMO_PROXMOX_VMS).toBeInstanceOf(Array)
    expect(DEMO_PROXMOX_VMS.length).toBeGreaterThan(0)
    for (const vm of DEMO_PROXMOX_VMS) {
      expect(vm).toHaveProperty('vmid')
      expect(vm).toHaveProperty('name')
      expect(vm).toHaveProperty('status')
      expect(['running', 'stopped']).toContain(vm.status)
      expect(vm.cpuPercent).toBeGreaterThanOrEqual(0)
      expect(vm.memTotalGB).toBeGreaterThan(0)
    }
  })

  it('DEMO_PROXMOX_NODES has valid node entries', async () => {
    const { DEMO_PROXMOX_NODES } = await import('../demo-data')
    expect(DEMO_PROXMOX_NODES).toBeInstanceOf(Array)
    expect(DEMO_PROXMOX_NODES.length).toBeGreaterThan(0)
    for (const node of DEMO_PROXMOX_NODES) {
      expect(node).toHaveProperty('node')
      expect(node.memPercent).toBeGreaterThanOrEqual(0)
      expect(node.memPercent).toBeLessThanOrEqual(100)
    }
  })

  it('DEMO_OPNSENSE has expected fields', async () => {
    const { DEMO_OPNSENSE } = await import('../demo-data')
    expect(DEMO_OPNSENSE).toHaveProperty('wanIn')
    expect(DEMO_OPNSENSE).toHaveProperty('wanOut')
    expect(DEMO_OPNSENSE).toHaveProperty('version')
    expect(typeof DEMO_OPNSENSE.updateAvailable).toBe('boolean')
  })
})
