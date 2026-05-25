import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { stableKeybindings, stableTourState, stableThemeState, stableSidebarConfig } = vi.hoisted(() => ({
  stableKeybindings: [],
  stableTourState: { active: false },
  stableThemeState: { pageOverrides: {}, categoryOverrides: {}, customThemes: [], schedule: { type: 'none' } },
  stableSidebarConfig: { categories: [], customNames: {}, customModules: [] },
}))

vi.mock('@/components/Sidebar', () => ({
  default: ({
    width,
    onAssistantOpenChange,
  }: {
    width: number
    onAssistantOpenChange: (open: boolean) => void
  }) => (
    <aside data-testid="mock-sidebar" data-width={width}>
      <button onClick={() => onAssistantOpenChange(true)}>Open AI Chat</button>
    </aside>
  ),
}))

vi.mock('@/components/assistant/GlobalAssistantLauncher', () => ({
  GlobalAssistantDrawer: ({
    docked,
    onClose,
  }: {
    docked?: boolean
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="AI Chat assistant" data-docked={docked ? 'true' : 'false'}>
      <button onClick={onClose}>Close assistant</button>
    </div>
  ),
}))

vi.mock('@/components/PageErrorBoundary', () => ({
  default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

vi.mock('@/components/DemoModeBanner', () => ({
  DemoModeBanner: () => null,
}))

vi.mock('@/components/ui/Toast', () => ({
  ToastProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

vi.mock('@/components/ui/ProgressBar', () => ({
  NavigationProgressBar: () => null,
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({ authenticated: false })),
  },
}))

vi.mock('@/lib/account-sync', () => ({
  getAccountSyncStatus: vi.fn(async () => ({ needs_recovery_key: false })),
}))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => false,
}))

vi.mock('@/lib/keybindings', () => ({
  getKeybindings: () => stableKeybindings,
  subscribeKeybindings: () => () => {},
  isBindingModPressed: () => false,
  matchesExtraModifier: () => true,
}))

vi.mock('@/lib/titlebar-settings', () => ({
  getTitleBarVisible: () => false,
  getTitleBarAutoHide: () => false,
  subscribeTitleBarSettings: () => () => {},
}))

vi.mock('@/lib/sidebar-settings', () => ({
  getSidebarTitleText: () => 'clawctrl',
  getSidebarDefaultWidth: () => 260,
  subscribeSidebarSettings: () => () => {},
}))

vi.mock('@/lib/wizard-store', () => ({
  getSetupCompletionSnapshot: () => false,
  shouldAutoOpenWizard: () => false,
  subscribeSetupCompletion: () => () => {},
}))

vi.mock('@/lib/tour-store', () => ({
  useTourState: () => stableTourState,
}))

vi.mock('@/lib/theme-store', () => ({
  useThemeState: () => stableThemeState,
}))

vi.mock('@/lib/theme-definitions', () => ({
  getThemeById: () => null,
}))

vi.mock('@/lib/sidebar-config', () => ({
  getSidebarConfig: () => stableSidebarConfig,
}))

vi.mock('@/lib/theme-scheduling', () => ({
  startScheduleTimer: () => () => {},
}))

vi.mock('@/hooks/useApprovals', () => ({
  useApprovals: () => undefined,
}))

import LayoutShell from '../LayoutShell'

function renderShell(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<LayoutShell />}>
          <Route index element={<div>Home content</div>} />
          <Route path="/media" element={<div>Media content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('LayoutShell assistant dock', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    class ResizeObserverMock {
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('docks the assistant on the right and collapses/restores the left sidebar', async () => {
    renderShell()

    expect(screen.getByTestId('mock-sidebar')).toHaveAttribute('data-width', '260')

    fireEvent.click(screen.getByRole('button', { name: 'Open AI Chat' }))

    expect(await screen.findByTestId('global-assistant-dock')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /AI Chat assistant/i })).toHaveAttribute('data-docked', 'true')
    await waitFor(() => {
      expect(screen.getByTestId('mock-sidebar')).toHaveAttribute('data-width', '64')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }))

    await waitFor(() => {
      expect(screen.queryByTestId('global-assistant-dock')).not.toBeInTheDocument()
      expect(screen.getByTestId('mock-sidebar')).toHaveAttribute('data-width', '260')
    })
  })

  it('keeps the desktop app shell around the media command route', () => {
    renderShell('/media')

    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument()
    expect(screen.getByText('Media content')).toBeInTheDocument()
    expect(screen.getByTestId('main-content')).toHaveStyle({ background: 'var(--bg-base)' })
    expect(screen.getByTestId('main-content').firstElementChild).toHaveStyle({ padding: '0px' })
  })
})
