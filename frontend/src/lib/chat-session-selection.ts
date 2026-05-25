export const CHAT_SELECTED_SESSION_KEY = 'chat-selected-session-key'
export const CHAT_SELECTED_SESSION_ENVIRONMENT_KEY = 'chat-selected-session-environment'
export const CHAT_SESSIONS_CHANGED_EVENT = 'clawctrl:chat-sessions-changed'

export function loadSelectedChatSessionKey(): string | null {
  try {
    return localStorage.getItem(CHAT_SELECTED_SESSION_KEY)
  } catch {
    return null
  }
}

export function loadSelectedChatSessionEnvironmentId(): string | null {
  try {
    return localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)
  } catch {
    return null
  }
}

export function saveSelectedChatSessionKey(key: string | null, environmentId?: string | null) {
  try {
    const environment = environmentId?.trim()
    if (key) {
      localStorage.setItem(CHAT_SELECTED_SESSION_KEY, key)
      if (environment) localStorage.setItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY, environment)
      else localStorage.removeItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)
    } else {
      localStorage.removeItem(CHAT_SELECTED_SESSION_KEY)
      localStorage.removeItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)
    }
  } catch {
    // ignore storage access failures
  }
}

export function chatSessionPath(key: string | null, environmentId?: string | null): string {
  if (!key) return '/chat?new=1'
  const params = new URLSearchParams({ session: key })
  const environment = environmentId?.trim()
  if (environment) {
    params.set('threadId', key)
    params.set('environmentId', environment)
  }
  return `/chat?${params.toString()}`
}

export function notifyChatSessionsChanged(detail?: { sessionKey?: string | null; environmentId?: string | null }) {
  if (typeof window === 'undefined') return
  const environmentId = detail?.environmentId?.trim()
  window.dispatchEvent(new CustomEvent(CHAT_SESSIONS_CHANGED_EVENT, {
    detail: {
      sessionKey: detail?.sessionKey ?? null,
      ...(environmentId ? { environmentId } : {}),
    },
  }))
}
