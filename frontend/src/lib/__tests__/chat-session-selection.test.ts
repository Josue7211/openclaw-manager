import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHAT_SELECTED_SESSION_ENVIRONMENT_KEY,
  CHAT_SELECTED_SESSION_KEY,
  chatSessionPath,
  loadSelectedChatSessionEnvironmentId,
  loadSelectedChatSessionKey,
  saveSelectedChatSessionKey,
} from '../chat-session-selection'

describe('chat session selection persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists the selected session environment with the selected key', () => {
    saveSelectedChatSessionKey('shared-thread', 'desktop')

    expect(loadSelectedChatSessionKey()).toBe('shared-thread')
    expect(loadSelectedChatSessionEnvironmentId()).toBe('desktop')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_KEY)).toBe('shared-thread')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)).toBe('desktop')
  })

  it('clears stale environment scope when saving unscoped or empty selections', () => {
    saveSelectedChatSessionKey('shared-thread', 'desktop')
    saveSelectedChatSessionKey('local-thread')

    expect(loadSelectedChatSessionKey()).toBe('local-thread')
    expect(loadSelectedChatSessionEnvironmentId()).toBeNull()

    saveSelectedChatSessionKey(null)

    expect(localStorage.getItem(CHAT_SELECTED_SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)).toBeNull()
  })

  it('builds environment-scoped chat routes when opening a saved thread', () => {
    expect(chatSessionPath(null)).toBe('/chat?new=1')
    expect(chatSessionPath('local-thread')).toBe('/chat?session=local-thread')
    expect(chatSessionPath('shared-thread', 'desktop')).toBe('/chat?session=shared-thread&threadId=shared-thread&environmentId=desktop')
  })
})
