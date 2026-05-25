import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  API_BASE_CHANGED_EVENT: 'clawcontrol:api-base-changed',
  getRequestApiKeyForPath: vi.fn(() => 'test-key'),
  getRequestBaseForPath: vi.fn(() => 'http://127.0.0.1:3010'),
}))

import { buildChatSocketUrl } from '../useChatSocket'

describe('buildChatSocketUrl', () => {
  it('includes session and environment scope in the websocket URL', () => {
    const url = new URL(buildChatSocketUrl({
      sessionKey: 'shared-thread',
      environmentId: 'desktop',
      apiKey: 'test-key',
    }))

    expect(url.protocol).toBe('ws:')
    expect(url.host).toBe('127.0.0.1:3010')
    expect(url.pathname).toBe('/api/chat/ws')
    expect(url.searchParams.get('apiKey')).toBe('test-key')
    expect(url.searchParams.get('sessionKey')).toBe('shared-thread')
    expect(url.searchParams.get('environmentId')).toBe('desktop')
  })

  it('omits a blank environment scope', () => {
    const url = new URL(buildChatSocketUrl({
      sessionKey: 'shared-thread',
      environmentId: '   ',
    }))

    expect(url.searchParams.get('sessionKey')).toBe('shared-thread')
    expect(url.searchParams.has('environmentId')).toBe(false)
  })
})
