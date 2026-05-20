import { describe, expect, it } from 'vitest'
import {
  applyChatThreadRouteParams,
  environmentIdForThreadRoute,
  resolveChatThreadRouteSessionKey,
} from '../threadSessionRoutes'

describe('T3 thread route adapter', () => {
  it('stamps legacy session plus T3 scoped thread params', () => {
    const params = new URLSearchParams('new=1&draftId=draft-1')

    applyChatThreadRouteParams(params, {
      sessionKey: 'thread-123',
      session: { key: 'thread-123', environmentId: 'desktop' },
      fallbackEnvironmentId: 'local',
    })

    expect(params.get('session')).toBe('thread-123')
    expect(params.get('threadId')).toBe('thread-123')
    expect(params.get('environmentId')).toBe('desktop')
    expect(params.has('new')).toBe(false)
    expect(params.has('draftId')).toBe(false)
  })

  it('resolves T3 thread params before legacy session fallback', () => {
    expect(resolveChatThreadRouteSessionKey(new URLSearchParams('environmentId=desktop&threadId=t3-thread&session=legacy'))).toBe('t3-thread')
    expect(resolveChatThreadRouteSessionKey(new URLSearchParams('session=legacy'))).toBe('legacy')
    expect(resolveChatThreadRouteSessionKey(new URLSearchParams('draftId=draft-1'))).toBeNull()
  })

  it('falls back to project/local environment when the session has none', () => {
    expect(environmentIdForThreadRoute({ key: 'thread' }, 'remote')).toBe('remote')
    expect(environmentIdForThreadRoute({ key: 'thread' }, null)).toBe('local')
  })
})
