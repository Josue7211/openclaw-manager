import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CommandPalette from '../CommandPalette'
import { api } from '@/lib/api'
import { CHAT_SESSION_PROJECT_REFS_KEY } from '@/chat/t3-adapters/sessionProjectRefs'
import {
  CHAT_SELECTED_SESSION_ENVIRONMENT_KEY,
  CHAT_SELECTED_SESSION_KEY,
  CHAT_SESSIONS_CHANGED_EVENT,
} from '@/lib/chat-session-selection'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ ok: true, sessions: [] })),
  },
}))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>
}

function PaletteHarness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <LocationProbe />
    </>
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: [] })
  })

  it('starts a fresh chat as a first-class command', async () => {
    localStorage.setItem(CHAT_SELECTED_SESSION_KEY, 'old-thread')
    localStorage.setItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY, 'desktop')
    const sessionsChanged = vi.fn()
    window.addEventListener(CHAT_SESSIONS_CHANGED_EVENT, sessionsChanged)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('option', { name: 'New chat' }))

    expect(screen.getByLabelText('Current location')).toHaveTextContent('/chat?new=1')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)).toBeNull()
    expect(sessionsChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { sessionKey: null },
    }))
    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })

    window.removeEventListener(CHAT_SESSIONS_CHANGED_EVENT, sessionsChanged)
  })

  it('opens recent saved chats from the command palette', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      ok: true,
      sessions: [
        {
          key: 'older-thread',
          label: 'Older saved chat',
          agentKey: 'main',
          messageCount: 2,
          lastActivity: '2026-01-01T00:00:00Z',
        },
        {
          key: 'saved-thread',
          label: 'Desktop saved chat',
          agentKey: 'main',
          messageCount: 4,
          lastActivity: '2026-05-22T12:00:00Z',
          project: 'AgentShell',
          environmentId: 'desktop',
        },
      ],
    })
    const sessionsChanged = vi.fn()
    window.addEventListener(CHAT_SESSIONS_CHANGED_EVENT, sessionsChanged)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(api.get).toHaveBeenCalledWith('/api/gateway/sessions?includeUnscoped=1')
    expect(await screen.findByText('Recent Chats')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('option', { name: /Desktop saved chat/ }))

    expect(screen.getByLabelText('Current location')).toHaveTextContent('/chat?session=saved-thread&threadId=saved-thread&environmentId=desktop')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_KEY)).toBe('saved-thread')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)).toBe('desktop')
    expect(sessionsChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { sessionKey: 'saved-thread', environmentId: 'desktop' },
    }))

    window.removeEventListener(CHAT_SESSIONS_CHANGED_EVENT, sessionsChanged)
  })

  it('hydrates recent chat project hints from local session project refs', async () => {
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify({
      'desktop:saved-thread': {
        project: 'AgentShell',
        projectId: 'local:agent-shell:stable',
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branch: 'feature/chat',
        runtime: 'Remote harness',
      },
    }))
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [{
            key: 'saved-thread',
            label: 'Project chat',
            agentKey: 'main',
            messageCount: 5,
            lastActivity: '2026-05-22T12:00:00Z',
            environmentId: 'desktop',
          }],
        }
      }
      return { ok: true, projects: [], runtimeModes: ['Work locally'] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Recent Chats')).toBeInTheDocument()
    const option = await screen.findByRole('option', { name: /Project chat/ })
    expect(option).toHaveTextContent('AgentShell')
    expect(option).toHaveTextContent('feature/chat')
    expect(option).toHaveTextContent('Remote harness')
    expect(option).toHaveTextContent('desktop')
    expect(option).toHaveTextContent('5 messages')
  })

  it('filters recent chats by project branch metadata', async () => {
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify({
      'desktop:saved-thread': {
        project: 'AgentShell',
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branch: 'feature/chat',
        runtime: 'Remote harness',
      },
    }))
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [{
            key: 'saved-thread',
            label: 'Project chat',
            agentKey: 'main',
            messageCount: 5,
            lastActivity: '2026-05-22T12:00:00Z',
            environmentId: 'desktop',
          }],
        }
      }
      return { ok: true, projects: [], runtimeModes: ['Work locally'] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    await screen.findByText('Recent Chats')
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'feature/chat' },
    })

    const option = await screen.findByRole('option', { name: /Project chat/ })
    expect(option).toHaveTextContent('feature/chat')
    expect(option).toHaveTextContent('Remote harness')
  })

  it('filters recent chats by hidden session and agent identifiers', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [{
            key: 'session-ulid-919',
            label: 'Quiet archive chat',
            agentKey: 'codex-hidden-agent',
            messageCount: 1,
            lastActivity: '2026-05-22T12:00:00Z',
          }],
        }
      }
      return { ok: true, projects: [], runtimeModes: ['Work locally'] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    await screen.findByText('Recent Chats')
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'codex-hidden-agent' },
    })

    const option = await screen.findByRole('option', { name: /Quiet archive chat/ })
    expect(option).toHaveTextContent('Quiet archive chat')
    expect(option).not.toHaveTextContent('codex-hidden-agent')

    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'ulid-919' },
    })

    expect(await screen.findByRole('option', { name: /Quiet archive chat/ })).toBeInTheDocument()
  })

  it('prioritizes pinned recent chats and makes them searchable', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [
            {
              key: 'newer-thread',
              label: 'Newer normal chat',
              agentKey: 'main',
              messageCount: 3,
              lastActivity: '2026-05-22T12:00:00Z',
            },
            {
              key: 'pinned-thread',
              label: 'Pinned design chat',
              agentKey: 'main',
              messageCount: 7,
              lastActivity: '2026-05-01T12:00:00Z',
              pinned: true,
            },
          ],
        }
      }
      return { ok: true, projects: [], runtimeModes: ['Work locally'] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Pinned Chats')).toBeInTheDocument()
    expect(await screen.findByText('Recent Chats')).toBeInTheDocument()
    const options = await screen.findAllByRole('option')
    const pinnedIndex = options.findIndex((option) => option.textContent?.includes('Pinned design chat'))
    const newerIndex = options.findIndex((option) => option.textContent?.includes('Newer normal chat'))
    expect(pinnedIndex).toBeGreaterThanOrEqual(0)
    expect(newerIndex).toBeGreaterThanOrEqual(0)
    expect(pinnedIndex).toBeLessThan(newerIndex)
    expect(options[pinnedIndex]).toHaveTextContent('Pinned')

    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'pinned' },
    })
    expect(await screen.findByRole('option', { name: /Pinned design chat/ })).toHaveTextContent('Pinned')
    expect(screen.queryByRole('option', { name: /Newer normal chat/ })).not.toBeInTheDocument()
  })

  it('opens project-scoped recent chats with project route params', async () => {
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify({
      'desktop:saved-thread': {
        project: 'AgentShell',
        projectId: 'desktop:agent-shell:stable',
        workingDir: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branch: 'feature/chat',
        runtime: 'Remote harness',
      },
    }))
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [{
            key: 'saved-thread',
            label: 'Project chat',
            agentKey: 'main',
            messageCount: 5,
            lastActivity: '2026-05-22T12:00:00Z',
            environmentId: 'desktop',
          }],
        }
      }
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [{
            id: 'desktop:agent-shell:stable',
            environmentId: 'desktop',
            name: 'AgentShell',
            path: '/Users/josue/AgentShell',
            branches: ['main', 'feature/chat'],
            currentBranch: 'main',
            machineLabel: 'Desktop',
          }],
          runtimeModes: ['Work locally', 'Remote harness'],
        }
      }
      return { ok: true, sessions: [] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Projects')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: /Project chat/ }))

    const location = screen.getByLabelText('Current location')
    expect(location).toHaveTextContent('/chat?')
    expect(location).toHaveTextContent('session=saved-thread')
    expect(location).toHaveTextContent('threadId=saved-thread')
    expect(location).toHaveTextContent('environmentId=desktop')
    expect(location).toHaveTextContent('projectId=desktop%3Aagent-shell%3Astable')
    expect(location).toHaveTextContent('cwd=%2FUsers%2Fjosue%2FAgentShell')
    expect(location).toHaveTextContent('env=desktop')
    expect(location).toHaveTextContent('branch=feature%2Fchat')
    expect(location).toHaveTextContent('runtime=Remote+harness')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_KEY)).toBe('saved-thread')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)).toBe('desktop')
  })

  it('opens project-scoped recent chats from session metadata when workspace context is unavailable', async () => {
    localStorage.setItem(CHAT_SESSION_PROJECT_REFS_KEY, JSON.stringify({
      'desktop:saved-thread': {
        project: 'AgentShell',
        projectId: 'desktop:agent-shell:stable',
        workingDir: '/Users/josue/AgentShell',
        projectRoot: '/Users/josue/AgentShell',
        environmentId: 'desktop',
        branch: 'feature/chat',
        runtime: 'Remote harness',
      },
    }))
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [{
            key: 'saved-thread',
            label: 'Project chat',
            agentKey: 'main',
            messageCount: 5,
            lastActivity: '2026-05-22T12:00:00Z',
            environmentId: 'desktop',
          }],
        }
      }
      if (path === '/api/chat/workspace-context') {
        throw new Error('workspace unavailable')
      }
      return { ok: true, sessions: [] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Recent Chats')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: /Project chat/ }))

    const location = screen.getByLabelText('Current location')
    expect(location).toHaveTextContent('/chat?')
    expect(location).toHaveTextContent('session=saved-thread')
    expect(location).toHaveTextContent('threadId=saved-thread')
    expect(location).toHaveTextContent('environmentId=desktop')
    expect(location).toHaveTextContent('projectId=desktop%3Aagent-shell%3Astable')
    expect(location).toHaveTextContent('cwd=%2FUsers%2Fjosue%2FAgentShell')
    expect(location).toHaveTextContent('env=desktop')
    expect(location).toHaveTextContent('branch=feature%2Fchat')
    expect(location).toHaveTextContent('runtime=Remote+harness')
  })

  it('routes directly to chat project folder setup', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('option', { name: /Add project folder/ }))

    expect(screen.getByLabelText('Current location')).toHaveTextContent('/chat?addProject=1')
    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })
  })

  it('opens stored project folders from the command palette', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return { ok: true, sessions: [] }
      }
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [{
            id: 'local:agent-shell:stable',
            environmentId: 'local',
            name: 'AgentShell',
            path: '/Users/josue/AgentShell',
            branches: ['main', 'feature/chat'],
            currentBranch: 'feature/chat',
            machineLabel: 'Local Mac',
          }],
          runtimeModes: ['Work locally'],
        }
      }
      return { ok: true, sessions: [] }
    })
    localStorage.setItem(CHAT_SELECTED_SESSION_KEY, 'old-thread')
    localStorage.setItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY, 'desktop')
    const sessionsChanged = vi.fn()
    window.addEventListener(CHAT_SESSIONS_CHANGED_EVENT, sessionsChanged)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Projects')).toBeInTheDocument()
    const option = (await screen.findByText('AgentShell')).closest('[role="option"]')
    expect(option).toBeInTheDocument()
    fireEvent.click(option!)

    const location = screen.getByLabelText('Current location')
    expect(location).toHaveTextContent('/chat?')
    expect(location).toHaveTextContent('new=1')
    expect(location).toHaveTextContent('projectId=local%3Aagent-shell%3Astable')
    expect(location).toHaveTextContent('cwd=%2FUsers%2Fjosue%2FAgentShell')
    expect(location).toHaveTextContent('env=local')
    expect(location).toHaveTextContent('branch=feature%2Fchat')
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(CHAT_SELECTED_SESSION_ENVIRONMENT_KEY)).toBeNull()
    expect(sessionsChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { sessionKey: null },
    }))

    window.removeEventListener(CHAT_SESSIONS_CHANGED_EVENT, sessionsChanged)
  })

  it('orders project folder commands by the stored recent project sort preference', async () => {
    localStorage.setItem('chat-project-sort-order', 'recent')
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return {
          ok: true,
          sessions: [{
            key: 'recent-zeta-thread',
            label: 'Recent Zeta chat',
            agentKey: 'main',
            messageCount: 3,
            lastActivity: '2026-05-22T12:00:00Z',
            projectId: 'local:zeta:stable',
            workingDir: '/Users/josue/ZetaProject',
            environmentId: 'local',
          }],
        }
      }
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [
            {
              id: 'local:alpha:stable',
              environmentId: 'local',
              name: 'AlphaProject',
              path: '/Users/josue/AlphaProject',
              branches: ['main'],
              currentBranch: 'main',
            },
            {
              id: 'local:zeta:stable',
              environmentId: 'local',
              name: 'ZetaProject',
              path: '/Users/josue/ZetaProject',
              branches: ['main'],
              currentBranch: 'main',
            },
          ],
          runtimeModes: ['Work locally'],
        }
      }
      return { ok: true, sessions: [] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Projects')).toBeInTheDocument()
    const options = await screen.findAllByRole('option')
    const zetaIndex = options.findIndex((option) => option.textContent?.includes('ZetaProject'))
    const alphaIndex = options.findIndex((option) => option.textContent?.includes('AlphaProject'))
    expect(zetaIndex).toBeGreaterThanOrEqual(0)
    expect(alphaIndex).toBeGreaterThanOrEqual(0)
    expect(zetaIndex).toBeLessThan(alphaIndex)
  })

  it('filters stored project folders by repository and branch metadata', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return { ok: true, sessions: [] }
      }
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [{
            id: 'local:agent-shell:stable',
            environmentId: 'local',
            name: 'AgentShell',
            path: '/Users/josue/AgentShell',
            root: '/Users/josue/AgentShell',
            branches: ['main', 'feature/chat'],
            currentBranch: 'feature/chat',
            machineLabel: 'Local Mac',
            repositoryIdentity: {
              canonicalKey: 'github.com/josue/agent-shell',
              displayName: 'josue/agent-shell',
              name: 'agent-shell',
            },
          }],
          runtimeModes: ['Work locally'],
        }
      }
      return { ok: true, sessions: [] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    await screen.findByText('Projects')
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'feature/chat' },
    })

    const option = await screen.findByRole('option', { name: /AgentShell/ })
    expect(option).toHaveTextContent('josue/agent-shell')
    expect(option).toHaveTextContent('feature/chat')
  })

  it('filters stored project folders by hidden repository identity metadata', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return { ok: true, sessions: [] }
      }
      if (path === '/api/chat/workspace-context') {
        return {
          projects: [{
            id: 'local:plain-folder:stable',
            environmentId: 'local',
            name: 'Plain Folder',
            path: '/Users/josue/PlainFolder',
            branches: ['main'],
            currentBranch: 'main',
            repositoryIdentity: {
              canonicalKey: 'gitlab.example.com/secret/plain-folder',
              remoteUrl: 'git@gitlab.example.com:secret/plain-folder.git',
            },
          }],
          runtimeModes: ['Work locally'],
        }
      }
      return { ok: true, sessions: [] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    await screen.findByText('Projects')
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'gitlab.example.com/secret' },
    })

    const option = await screen.findByRole('option', { name: /Plain Folder/ })
    expect(option).toHaveTextContent('Plain Folder')
    expect(option).not.toHaveTextContent('gitlab.example.com')
  })

  it('finds stored project folders beyond the compact unfiltered project limit', async () => {
    const projects = Array.from({ length: 10 }, (_, index) => ({
      id: `local:project-${index}`,
      environmentId: 'local',
      name: index === 9 ? 'ZebraProject' : `Project ${index}`,
      path: index === 9 ? '/Users/josue/ZebraProject' : `/Users/josue/Project${index}`,
      branches: ['main'],
      currentBranch: 'main',
    }))
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return { ok: true, sessions: [] }
      }
      if (path === '/api/chat/workspace-context') {
        return { projects, runtimeModes: ['Work locally'] }
      }
      return { ok: true, sessions: [] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    await screen.findByText('Projects')
    expect(screen.queryByRole('option', { name: /ZebraProject/ })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'ZebraProject' },
    })

    expect(await screen.findByRole('option', { name: /ZebraProject/ })).toBeInTheDocument()
  })

  it('finds recent chats beyond the compact unfiltered recent-chat limit', async () => {
    const sessions = Array.from({ length: 8 }, (_, index) => ({
      key: `thread-${index}`,
      label: index === 7 ? 'Deep archive chat' : `Recent chat ${index}`,
      agentKey: 'main',
      messageCount: 1,
      lastActivity: `2026-05-${String(22 - index).padStart(2, '0')}T12:00:00Z`,
    }))
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/gateway/sessions?includeUnscoped=1') {
        return { ok: true, sessions }
      }
      return { ok: true, projects: [], runtimeModes: ['Work locally'] }
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    await screen.findByText('Recent Chats')
    expect(screen.queryByRole('option', { name: /Deep archive chat/ })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: 'Deep archive' },
    })

    expect(await screen.findByRole('option', { name: /Deep archive chat/ })).toBeInTheDocument()
  })

  it.each([
    ['Hermes models', '/settings?section=providers'],
    ['Hermes usage', '/settings?section=usage'],
    ['Hermes Agent settings', '/settings?section=hermes-agent'],
  ])('routes to %s from the command palette', async (label, route) => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <PaletteHarness />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette search' }), {
      target: { value: label },
    })
    const option = (await screen.findByText(label)).closest('[role="option"]')
    expect(option).toBeInTheDocument()
    fireEvent.click(option!)

    expect(screen.getByLabelText('Current location')).toHaveTextContent(route)
    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })
  })
})
