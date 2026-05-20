export const CHAT_SELECTED_SESSION_KEY = 'chat-selected-session-key'
export const CHAT_SESSIONS_CHANGED_EVENT = 'clawcontrol:chat-sessions-changed'

export function loadSelectedChatSessionKey(): string | null {
  try {
    return localStorage.getItem(CHAT_SELECTED_SESSION_KEY)
  } catch {
    return null
  }
}

export function saveSelectedChatSessionKey(key: string | null) {
  try {
    if (key) localStorage.setItem(CHAT_SELECTED_SESSION_KEY, key)
    else localStorage.removeItem(CHAT_SELECTED_SESSION_KEY)
  } catch {
    // ignore storage access failures
  }
}

export function chatSessionPath(key: string | null): string {
  return key ? `/chat?session=${encodeURIComponent(key)}` : '/chat?new=1'
}

export function notifyChatSessionsChanged(detail?: { sessionKey?: string | null }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHAT_SESSIONS_CHANGED_EVENT, {
    detail: {
      sessionKey: detail?.sessionKey ?? null,
    },
  }))
}
