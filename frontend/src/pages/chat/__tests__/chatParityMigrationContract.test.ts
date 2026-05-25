import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const frontendRoot = resolve(__dirname, '../../../..')

function read(relativePath: string): string {
  return readFileSync(resolve(frontendRoot, relativePath), 'utf8')
}

describe('chat copy-first migration contract', () => {
  it('keeps Chat wired to T3/adapted subsystems instead of legacy inline implementations', () => {
    const chat = read('src/pages/Chat.tsx')

    expect(chat).toContain('@/chat/t3-adapters/projectSidebar')
    expect(chat).toContain('@/chat/t3-adapters/threadSessionRoutes')
    expect(chat).toContain('@/vendor/t3/project/ProjectScriptsControl')
    expect(chat).toContain('@/vendor/t3/project/ProjectScriptDialog')
    expect(chat).toContain('@/vendor/t3/project/ProjectSidebarDialog')
    expect(chat).toContain('@/vendor/t3/project/ProjectSidebar')
    expect(chat).toContain('@/vendor/t3/project/ProjectContextControls')
    expect(chat).toContain('@/vendor/t3/project/projectScripts')
    expect(chat).toContain('@/chat/t3-adapters/projectWorkspace')
    expect(chat).toContain('@/chat/t3-adapters/sessionProjectRefs')
    expect(chat).toContain('@/chat/t3-adapters/sessionTitles')
    expect(chat).toContain('@/chat/t3-adapters/sidebarPreferences')
    expect(chat).not.toContain('function ChatProjectActionDialog')
    expect(chat).not.toContain('<ChatProjectActionDialog')
    expect(chat).not.toContain('function ChatUnifiedSidebar')
    expect(chat).not.toContain('function ChatSidebarAction')
    expect(chat).not.toContain('function ChatSidebarLink')
    expect(chat).not.toContain('function ChatSidebarSection')
    expect(chat).not.toContain('function ChatSidebarHeaderButton')
    expect(chat).not.toContain('function nextProjectScriptId')
    expect(chat).not.toContain('function normalizeScriptId')
    expect(chat).not.toContain('function normalizeProjectScript')
    expect(chat).not.toContain('function loadProjectScriptStore')
    expect(chat).not.toContain('function scriptsForProject')
    expect(chat).not.toContain('function resolveScriptCwd')
    expect(chat).not.toContain('function terminalProcessScope')
    expect(chat).not.toContain('function normalizeWorkspaceProject')
    expect(chat).not.toContain('function loadChatWorkspaceContext')
    expect(chat).not.toContain('function addProjectToBackend')
    expect(chat).not.toContain('function removeWorkspaceProject')
    expect(chat).not.toContain('function projectRefFromProject')
    expect(chat).not.toContain('function attachChatSessionProjectRefs')
    expect(chat).not.toContain('function findProjectForSession')
    expect(chat).not.toContain('function copyContextId')
    expect(chat).not.toContain('function ChatSettingsMenu')
    expect(chat).not.toContain('function settingsShortcutIcon')
    expect(chat).not.toContain('function ChatProjectViewMenu')
    expect(chat).not.toContain('function ChatProjectActionMenu')
    expect(chat).not.toContain('function ChatProjectMenuButton')
    expect(chat).not.toContain('function ChatProjectViewSelect')
    expect(chat).not.toContain('function useDismissibleMenu')
    expect(chat).not.toContain('function ChatSidebarThread')
    expect(chat).not.toContain('function ChatThreadIconButton')
    expect(chat).not.toContain('function ChatSidebarEmpty')
    expect(chat).not.toContain('function formatSessionTime')
    expect(chat).not.toContain('function ChatHeaderPanel')
    expect(chat).not.toContain('function ChatComposerContextBar')
    expect(chat).not.toContain('function ChatEnvironmentDialog')
    expect(chat).not.toContain('function ChatSelect')
    expect(chat).not.toContain('function ChatToolbarButton')
    expect(chat).not.toContain('function sanitizeTitleSource')
    expect(chat).not.toContain('function deriveSessionTitle')
    expect(chat).not.toContain('function isRepairableSessionLabel')
    expect(chat).not.toContain('function buildProjectSidebarGroups')
    expect(chat).not.toContain('function logicalProjectHint')
    expect(chat).not.toContain('function projectMachineLabel')
    expect(chat).not.toContain('function setProjectRouteParams')
    expect(chat).not.toContain('function findProjectByRouteIdentity')
    expect(chat).not.toContain('window.prompt')
    expect(chat).not.toMatch(/openclaw|OpenClaw/)
    expect(chat).not.toContain("from './sessions/SessionList'")
    expect(chat).not.toContain('src/pages/sessions/SessionList.tsx')
    expect(chat).not.toContain('src/pages/sessions/SessionCard.tsx')
    expect(chat).toContain('@/chat/t3-adapters')
    expect(chat).toContain('@/vendor/t3/project')
  })

  it('keeps active chat route state wired through T3 thread route helpers', () => {
    const adapter = read('src/chat/t3-adapters/threadSessionRoutes.ts')

    expect(adapter).toContain('@/vendor/t3/project/threadRoutes')
    expect(adapter).toContain('applyChatThreadRouteParams')
    expect(adapter).toContain('resolveChatThreadRouteSessionKey')
    expect(adapter).toContain("params.set('threadId'")
    expect(adapter).toContain("params.set('environmentId'")
  })

  it('keeps active chat session summaries out of the legacy Sessions page types', () => {
    const chat = read('src/pages/Chat.tsx')
    const gatewayHook = read('src/hooks/sessions/useGatewaySessions.ts')
    const sessionTypes = read('src/pages/sessions/types.ts')
    const chatTypes = read('src/chat/t3-adapters/gatewaySessionTypes.ts')
    const projectSidebar = read('src/vendor/t3/project/ProjectSidebar.tsx')

    expect(projectSidebar).toContain('@/chat/t3-adapters/gatewaySessionTypes')
    expect(gatewayHook).toContain('@/chat/t3-adapters/gatewaySessionTypes')
    expect(chat).not.toContain('./sessions/types')
    expect(gatewayHook).not.toContain('@/pages/sessions/types')
    expect(sessionTypes).toContain('@/chat/t3-adapters/gatewaySessionTypes')
    expect(chatTypes).toContain('Copied/adapted from T3 Code')
    expect(chatTypes).toContain('export interface ClaudeSession')
    expect(chatTypes).toContain('project?: string')
    expect(chatTypes).toContain('workingDir?: string')
  })

  it('keeps project script behavior in the T3 helper layer', () => {
    const projectScripts = read('src/vendor/t3/project/projectScripts.ts')
    const projectWorkspace = read('src/chat/t3-adapters/projectWorkspace.ts')

    expect(projectScripts).toContain('Copied/adapted from T3 Code')
    expect(projectScripts).toContain('commandForProjectScript')
    expect(projectScripts).toContain('nextProjectScriptId')
    expect(projectScripts).toContain('primaryProjectScript')
    expect(projectWorkspace).toContain('Copied/adapted from T3 Code')
    expect(projectWorkspace).toContain('DEFAULT_CHAT_PROJECT_SCRIPTS')
    expect(projectWorkspace).toContain('DEFAULT_CHAT_PROJECT_SCRIPTS: ChatProjectScript[] = []')
    expect(projectWorkspace).not.toContain('Chat tests')
    expect(projectWorkspace).not.toContain('Chat lint')
    expect(projectWorkspace).toContain('toT3ProjectScript')
    expect(projectWorkspace).toContain('normalizeWorkspaceProject')
    expect(projectWorkspace).toContain('loadChatWorkspaceContext')
    expect(projectWorkspace).toContain('addProjectToBackend')
    expect(projectWorkspace).toContain('removeWorkspaceProject')
    expect(projectWorkspace).toContain('resolveScriptCwd')
    expect(projectWorkspace).toContain('terminalProcessScope')
  })

  it('keeps project sidebar controls in the copied T3 project surface', () => {
    const controls = read('src/vendor/t3/project/ProjectSidebarControls.tsx')

    expect(controls).toContain('Copied/adapted from T3 Code')
    expect(controls).toContain('data-t3-project-view-menu')
    expect(controls).toContain('data-t3-project-action-menu')
    expect(controls).toContain('ProjectViewMenu')
    expect(controls).toContain('ProjectActionMenu')
    expect(controls).toContain('ProjectMenuButton')
    expect(controls).toContain('ProjectIconButton')
  })

  it('keeps project sidebar thread rows in the copied T3 project surface', () => {
    const thread = read('src/vendor/t3/project/ProjectSidebarThread.tsx')

    expect(thread).toContain('Copied/adapted from T3 Code')
    expect(thread).toContain('data-t3-project-sidebar-thread')
    expect(thread).toContain('data-t3-project-sidebar-thread-menu')
    expect(thread).toContain('ProjectSidebarThread')
    expect(thread).toContain('ProjectSidebarEmpty')
  })

  it('keeps the project-first sidebar in the copied T3 project surface', () => {
    const sidebar = read('src/vendor/t3/project/ProjectSidebar.tsx')
    const preferences = read('src/chat/t3-adapters/sidebarPreferences.ts')

    expect(sidebar).toContain('Copied/adapted from T3 Code apps/web/src/components/Sidebar.tsx')
    expect(sidebar).toContain('data-t3-project-sidebar')
    expect(sidebar).toContain('buildProjectSidebarGroups')
    expect(sidebar).toContain('splitProjectScopedSessions')
    expect(sidebar).toContain('ProjectSidebarThread')
    expect(sidebar).toContain('ProjectSidebarEmpty')
    expect(sidebar).toContain('ChatSettingsMenu')
    expect(sidebar).toContain('Recent')
    expect(preferences).toContain('CHAT_PROJECT_GROUPING_MODE_KEY')
    expect(preferences).toContain('loadProjectGroupingMode')
    expect(preferences).toContain('saveProjectSortOrder')
  })

  it('keeps project header and context controls in the copied T3 project surface', () => {
    const contextControls = read('src/vendor/t3/project/ProjectContextControls.tsx')

    expect(contextControls).toContain('Copied/adapted from T3 Code')
    expect(contextControls).toContain('data-t3-project-header-panel')
    expect(contextControls).toContain('data-t3-project-context-toolbar')
    expect(contextControls).toContain('data-t3-project-environment-dialog')
    expect(contextControls).toContain('ProjectHeaderPanel')
    expect(contextControls).toContain('ProjectComposerContextBar')
    expect(contextControls).toContain('ProjectEnvironmentDialog')
  })

  it('keeps project sidebar grouping and route matching in the T3 adapter layer', () => {
    const projectSidebar = read('src/chat/t3-adapters/projectSidebar.ts')

    expect(projectSidebar).toContain('Copied/adapted from T3 Code')
    expect(projectSidebar).toContain('@/vendor/t3/project/sidebarProjectGrouping')
    expect(projectSidebar).toContain('buildProjectSidebarGroups')
    expect(projectSidebar).toContain('logicalProjectHint')
    expect(projectSidebar).toContain('setProjectRouteParams')
    expect(projectSidebar).toContain('findProjectByRouteIdentity')
  })

  it('keeps project-scoped session refs in the T3 adapter layer', () => {
    const sessionRefs = read('src/chat/t3-adapters/sessionProjectRefs.ts')

    expect(sessionRefs).toContain('Copied/adapted from T3 Code')
    expect(sessionRefs).toContain('CHAT_SESSION_PROJECT_REFS_KEY')
    expect(sessionRefs).toContain('projectRefFromProject')
    expect(sessionRefs).toContain('attachChatSessionProjectRefs')
    expect(sessionRefs).toContain('findProjectForSession')
    expect(sessionRefs).toContain('sessionMatchesProject')
  })

  it('keeps session title repair in the T3 adapter layer', () => {
    const titles = read('src/chat/t3-adapters/sessionTitles.ts')

    expect(titles).toContain('Copied/adapted from T3 Code')
    expect(titles).toContain('deriveSessionTitle')
    expect(titles).toContain('isRepairableSessionLabel')
    expect(titles).toContain('sanitizeTitleSource')
  })

  it('keeps generic project defaults free of repo-specific chat actions', () => {
    const defaults = read('src/chat/t3-adapters/projectWorkspace.ts')

    expect(defaults).toBeTruthy()

    expect(defaults).toContain('DEFAULT_CHAT_PROJECT_SCRIPTS: ChatProjectScript[] = []')
    expect(defaults).not.toContain('cargo tauri dev')
    expect(defaults).not.toContain('src/chat/t3-adapters')
    expect(defaults).not.toContain('src/vendor/t3/project')
    expect(defaults).not.toContain('src/vendor/t3/providers')
    expect(defaults).not.toContain('src/vendor/t3/terminal')
    expect(defaults).not.toContain('src/pages/sessions/SessionList.tsx')
    expect(defaults).not.toContain('src/pages/sessions/SessionCard.tsx')
  })

  it('keeps Hermes Agent provider catalog shared with the Rust route and OpenClaw out of chat providers', () => {
    const providers = read('src/features/chat/providers.ts')
    const sharedCatalog = read('../shared/chat-providers.json')
    const parsed = JSON.parse(sharedCatalog) as Array<{ id: string }>

    expect(providers).toContain("shared/chat-providers.json")
    expect(providers).toContain('SHARED_CHAT_PROVIDER_OPTIONS.map')
    expect(providers).not.toMatch(/CHAT_PROVIDER_IDS\s*=\s*\[/)
    expect(providers).not.toMatch(/CHAT_PROVIDER_OPTIONS:\s*ChatProviderOption\[\]\s*=\s*\[/)
    expect(parsed.map(provider => provider.id)).toEqual(['hermes'])
    expect(sharedCatalog).not.toMatch(/openclaw|OpenClaw/)
  })

  it('bundles the Claude provider runtime bridge for packaged desktop builds', () => {
    const config = JSON.parse(read('../src-tauri/tauri.conf.json'))

    expect(config.bundle.resources).toMatchObject({
      'resources/*': 'resources',
      '../provider-runtime/t3/claude-provider-runtime.mjs':
        'provider-runtime/t3/claude-provider-runtime.mjs',
    })
  })

  it('keeps terminal as a T3 bottom-dock adapter, not a side panel or modal', () => {
    const adapter = read('src/pages/chat/ChatTerminalDrawer.tsx')
    const drawer = read('src/vendor/t3/terminal/ThreadTerminalDrawer.tsx')

    expect(adapter).toContain('@/vendor/t3/terminal/ThreadTerminalDrawer')
    expect(drawer).toContain('Copied/adapted from T3 Code')
    expect(drawer).toContain('thread-terminal-drawer')
    expect(drawer).toContain('flexShrink: 0')
    expect(drawer).toContain('Resize terminal dock')
    expect(drawer).toContain('setHeight')
    expect(drawer).not.toMatch(/side panel|floating modal/i)
  })

  it('keeps the composer provider picker on the T3 picker surface instead of legacy selects', () => {
    const selector = read('src/vendor/t3/providers/ProviderModelSelector.tsx')

    expect(selector).toContain('Copied/adapted from T3 Code apps/web/src/components/chat/ProviderModelPicker.tsx')
    expect(selector).toContain('data-chat-provider-model-picker')
    expect(selector).toContain('data-model-picker-sidebar')
    expect(selector).toContain('data-model-picker-model')
    expect(selector).not.toMatch(/<select\b/)
  })

  it('keeps settings providers routed through the copied T3 provider instance card', () => {
    const panel = read('src/vendor/t3/providers/ProviderSettingsPanel.tsx')
    const card = read('src/vendor/t3/providers/ProviderInstanceCard.tsx')

    expect(panel).toContain('ProviderInstanceCard')
    expect(panel).not.toContain('function ProviderMeta')
    expect(card).toContain('Copied/adapted from T3 Code apps/web/src/components/settings/ProviderInstanceCard.tsx')
    expect(card).toContain('deriveProviderModelsForDisplay')
    expect(card).toContain('data-provider-instance-card')
  })

  it('keeps the settings/account popover on a copied T3 menu surface', () => {
    const menu = read('src/vendor/t3/settings/ChatSettingsMenu.tsx')
    const shortcuts = read('src/chat/t3-adapters/settingsShortcuts.ts')

    expect(menu).toContain('Copied/adapted from T3 Code')
    expect(menu).toContain('data-t3-settings-account-menu')
    expect(menu).toContain('CHAT_SETTINGS_SHORTCUTS')
    expect(shortcuts).toContain('Usage remaining')
    expect(shortcuts).toContain('Providers')
    expect(shortcuts).toContain('Hermes Agent')
  })
})
