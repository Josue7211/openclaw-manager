/**
 * Centralized React Query cache keys for every data source.
 * Use these instead of inline string arrays to keep invalidation consistent.
 */
export const queryKeys = {
  todos: ['todos'] as const,
  missions: ['missions'] as const,
  agents: ['agents'] as const,
  calendar: ['calendar'] as const,
  status: ['agent-status'] as const,
  prefs: ['prefs'] as const,
  authUser: ['auth-user'] as const,
  emails: (accountId?: string) => ['emails', accountId] as const,
  emailAccounts: ['email-accounts'] as const,
  search: (q: string) => ['search', q] as const,
  capture: ['capture'] as const,
  knowledge: ['knowledge'] as const,
  memory: ['workspace-files'] as const,
  ideas: (status?: string) => ['ideas', status] as const,
  missionEvents: (id: string) => ['mission-events', id] as const,
  chatHistory: ['chat', 'history'] as const,
  chatModels: ['chat', 'models'] as const,
  subagentsActive: ['subagents', 'active'] as const,
  connections: ['status', 'connections'] as const,
  tailscalePeers: ['status', 'tailscale'] as const,
  health: ['status', 'health'] as const,
  secrets: {
    list: () => ['secrets'] as const,
    detail: (service: string) => ['secrets', service] as const,
  },
} as const
