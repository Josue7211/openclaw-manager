import { describe, it, expect } from 'vitest'
import { queryKeys } from '../query-keys'

describe('queryKeys', () => {
  describe('static keys', () => {
    it('todos returns ["todos"]', () => {
      expect(queryKeys.todos).toEqual(['todos'])
    })

    it('missions returns ["missions"]', () => {
      expect(queryKeys.missions).toEqual(['missions'])
    })

    it('agents returns ["agents"]', () => {
      expect(queryKeys.agents).toEqual(['agents'])
    })

    it('calendar returns ["calendar"]', () => {
      expect(queryKeys.calendar).toEqual(['calendar'])
    })

    it('status returns ["agent-status"]', () => {
      expect(queryKeys.status).toEqual(['agent-status'])
    })

    it('prefs returns ["prefs"]', () => {
      expect(queryKeys.prefs).toEqual(['prefs'])
    })

    it('authUser returns ["auth-user"]', () => {
      expect(queryKeys.authUser).toEqual(['auth-user'])
    })

    it('emailAccounts returns ["email-accounts"]', () => {
      expect(queryKeys.emailAccounts).toEqual(['email-accounts'])
    })

    it('capture returns ["capture"]', () => {
      expect(queryKeys.capture).toEqual(['capture'])
    })

    it('knowledge returns ["knowledge"]', () => {
      expect(queryKeys.knowledge).toEqual(['knowledge'])
    })

    it('memory returns ["workspace-files"]', () => {
      expect(queryKeys.memory).toEqual(['workspace-files'])
    })

    it('chatHistory returns ["chat", "history"]', () => {
      expect(queryKeys.chatHistory).toEqual(['chat', 'history'])
    })

    it('subagentsActive returns ["subagents", "active"]', () => {
      expect(queryKeys.subagentsActive).toEqual(['subagents', 'active'])
    })

    it('connections returns ["status", "connections"]', () => {
      expect(queryKeys.connections).toEqual(['status', 'connections'])
    })

    it('tailscalePeers returns ["status", "tailscale"]', () => {
      expect(queryKeys.tailscalePeers).toEqual(['status', 'tailscale'])
    })

    it('health returns ["status", "health"]', () => {
      expect(queryKeys.health).toEqual(['status', 'health'])
    })
  })

  describe('dynamic key factories', () => {
    it('emails() returns ["emails", accountId]', () => {
      expect(queryKeys.emails('acct-1')).toEqual(['emails', 'acct-1'])
    })

    it('emails() without arg returns ["emails", undefined]', () => {
      expect(queryKeys.emails()).toEqual(['emails', undefined])
    })

    it('search() returns ["search", query]', () => {
      expect(queryKeys.search('hello')).toEqual(['search', 'hello'])
    })

    it('search() with empty string returns ["search", ""]', () => {
      expect(queryKeys.search('')).toEqual(['search', ''])
    })

    it('ideas() returns ["ideas", status]', () => {
      expect(queryKeys.ideas('active')).toEqual(['ideas', 'active'])
    })

    it('ideas() without arg returns ["ideas", undefined]', () => {
      expect(queryKeys.ideas()).toEqual(['ideas', undefined])
    })

    it('missionEvents() returns ["mission-events", id]', () => {
      expect(queryKeys.missionEvents('m-123')).toEqual(['mission-events', 'm-123'])
    })

    it('secrets.list() returns ["secrets"]', () => {
      expect(queryKeys.secrets.list()).toEqual(['secrets'])
    })

    it('secrets.detail() returns ["secrets", service]', () => {
      expect(queryKeys.secrets.detail('bluebubbles')).toEqual(['secrets', 'bluebubbles'])
    })
  })

  describe('key uniqueness', () => {
    it('all static keys have unique first elements (no collisions)', () => {
      const staticKeys = [
        queryKeys.todos,
        queryKeys.missions,
        queryKeys.agents,
        queryKeys.calendar,
        queryKeys.status,
        queryKeys.prefs,
        queryKeys.authUser,
        queryKeys.emailAccounts,
        queryKeys.capture,
        queryKeys.knowledge,
        queryKeys.memory,
      ]
      const firsts = staticKeys.map(k => k[0])
      expect(new Set(firsts).size).toBe(firsts.length)
    })

    it('multi-segment static keys are distinct from each other', () => {
      const multiKeys = [
        queryKeys.chatHistory,
        queryKeys.subagentsActive,
        queryKeys.connections,
        queryKeys.tailscalePeers,
        queryKeys.health,
      ]
      const serialized = multiKeys.map(k => JSON.stringify(k))
      expect(new Set(serialized).size).toBe(serialized.length)
    })
  })

  describe('readonly enforcement', () => {
    it('static keys are readonly tuples', () => {
      // TypeScript enforces this at compile time via `as const`,
      // but we can verify the runtime values are arrays
      expect(Array.isArray(queryKeys.todos)).toBe(true)
      expect(Array.isArray(queryKeys.chatHistory)).toBe(true)
    })

    it('factory results are readonly tuples', () => {
      expect(Array.isArray(queryKeys.emails('x'))).toBe(true)
      expect(Array.isArray(queryKeys.search('q'))).toBe(true)
      expect(Array.isArray(queryKeys.ideas('s'))).toBe(true)
      expect(Array.isArray(queryKeys.missionEvents('id'))).toBe(true)
      expect(Array.isArray(queryKeys.secrets.list())).toBe(true)
      expect(Array.isArray(queryKeys.secrets.detail('svc'))).toBe(true)
    })
  })
})
