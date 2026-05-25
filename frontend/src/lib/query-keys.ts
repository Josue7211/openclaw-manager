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
  emails: (folder?: string, accountId?: string) => ['emails', folder, accountId] as const,
  emailAccounts: ['mail-accounts'] as const,
  search: (q: string) => ['search', q] as const,
  capture: ['capture'] as const,
  knowledge: ['knowledge'] as const,
  // MemD memory entries (new memory system).
  memory: ['memd', 'entries'] as const,
  // Workspace file tree (file-browser UI).
  workspaceFiles: ['workspace-files'] as const,
  ideas: (status?: string) => ['ideas', status] as const,
  missionEvents: (id: string) => ['mission-events', id] as const,
  chatHistory: ['chat', 'history'] as const,
  chatModels: ['chat', 'models'] as const,
  chatProviderStatus: ['chat', 'providers', 'status'] as const,
  crons: ['crons'] as const,
  subagentsActive: ['subagents', 'active'] as const,
  agentCache: ['agent-cache'] as const,
  connections: ['status', 'connections'] as const,
  tailscalePeers: ['status', 'tailscale'] as const,
  health: ['status', 'health'] as const,
  harnessHealth: ['harness', 'health'] as const,
  secrets: {
    list: () => ['secrets'] as const,
    detail: (service: string) => ['secrets', service] as const,
  },
  generatedModules: ['generated', 'modules'] as const,
  generatedModuleVersions: (id: string) => ['generated', 'versions', id] as const,
  moduleProposals: ['modules', 'proposals'] as const,
  harnessUsage: ['harness', 'usage'] as const,
  harnessModels: ['harness', 'models'] as const,
  harnessTools: ['harness', 'tools'] as const,
  gatewaySessions: ['gateway', 'sessions'] as const,
  sessionHistory: (key: string, environmentId?: string | null) => (
    environmentId === undefined
      ? ['session-history', key] as const
      : ['session-history', key, environmentId?.trim() || ''] as const
  ),
  hermesSessions: ['hermes-sessions'] as const,
  gatewayEvents: ['gateway', 'events'] as const,
  gatewayActivity: ['gateway', 'activity'] as const,
  memorySearch: (q: string) => ['memory-search', q] as const,
  approvals: ['approvals'] as const,
  harnessSkills: ['harness', 'skills'] as const,
  remoteStatus: ['remote', 'status'] as const,
  vncStatus: ['vnc', 'status'] as const,
} as const
