import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChatTerminalDrawer from '../ChatTerminalDrawer'

const { mockUseTerminal, mockStop, mockRestart } = vi.hoisted(() => ({
  mockUseTerminal: vi.fn(),
  mockStop: vi.fn(),
  mockRestart: vi.fn(),
}))

vi.mock('@/hooks/useTerminal', () => ({
  useTerminal: mockUseTerminal,
}))

describe('ChatTerminalDrawer', () => {
  beforeEach(() => {
    mockStop.mockReset()
    mockRestart.mockReset()
    mockUseTerminal.mockReset()
    mockUseTerminal.mockReturnValue({
      connected: false,
      error: null,
      status: 'connecting',
      processId: null,
      cwd: null,
      exitCode: null,
      exitSignal: null,
      closeReason: null,
      stop: mockStop,
      restart: mockRestart,
    })
  })

  it('passes the initial command into the terminal hook and renders status', () => {
    render(
      <ChatTerminalDrawer
        title="Tauri dev"
        initialCommand="cargo tauri dev"
        cwd="/Volumes/T7/projects/clawctrl/src-tauri"
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Chat terminal' })).toBeInTheDocument()
    expect(screen.getByText('Tauri dev')).toBeInTheDocument()
    expect(screen.getByText('connecting')).toBeInTheDocument()
    expect(mockUseTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ current: expect.any(HTMLDivElement) }),
      {
        fontSize: 12,
        initialCommand: 'cargo tauri dev',
        cwd: '/Volumes/T7/projects/clawctrl/src-tauri',
        processId: undefined,
        env: undefined,
      },
    )
  })

  it('passes terminal environment context into the terminal hook', () => {
    render(
      <ChatTerminalDrawer
        title="Tauri dev"
        cwd="/Volumes/T7/projects/clawctrl"
        env={{
          CLAWCTRL_PROJECT_PATH: '/Volumes/T7/projects/clawctrl',
          CLAWCTRL_RUNTIME: 'Work locally',
          CLAWCTRL_BRANCH: 'main',
        }}
        onClose={vi.fn()}
      />,
    )

    expect(mockUseTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ current: expect.any(HTMLDivElement) }),
      expect.objectContaining({
        cwd: '/Volumes/T7/projects/clawctrl',
        env: {
          CLAWCTRL_PROJECT_PATH: '/Volumes/T7/projects/clawctrl',
          CLAWCTRL_RUNTIME: 'Work locally',
          CLAWCTRL_BRANCH: 'main',
        },
      }),
    )
  })

  it('renders the resolved cwd from the terminal hook', () => {
    mockUseTerminal.mockReturnValue({
      connected: true,
      error: null,
      status: 'running',
      processId: 'terminal-1',
      cwd: '/Volumes/T7/projects/clawctrl',
      exitCode: null,
      exitSignal: null,
      closeReason: null,
      stop: mockStop,
      restart: mockRestart,
    })

    render(<ChatTerminalDrawer title="Terminal" cwd="/Volumes/T7/projects/clawctrl" onClose={vi.fn()} />)

    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('/Volumes/T7/projects/clawctrl')).toBeInTheDocument()
  })

  it('exposes responsive hooks for terminal header wrapping', () => {
    mockUseTerminal.mockReturnValue({
      connected: true,
      error: null,
      status: 'running',
      processId: 'terminal-1',
      cwd: '/Volumes/T7/projects/clawctrl',
      exitCode: null,
      exitSignal: null,
      closeReason: null,
      stop: mockStop,
      restart: mockRestart,
    })

    render(<ChatTerminalDrawer title="Terminal" cwd="/Volumes/T7/projects/clawctrl" onClose={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Chat terminal' })).toHaveClass('chat-terminal-drawer')
    expect(screen.getByText('Terminal')).toHaveClass('chat-terminal-name')
    expect(screen.getByText('running')).toHaveClass('chat-terminal-status')
    expect(screen.getByText('/Volumes/T7/projects/clawctrl')).toHaveClass('chat-terminal-cwd')
  })

  it('wires stop, restart, and close controls', () => {
    const onClose = vi.fn()

    render(<ChatTerminalDrawer onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop terminal session' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restart terminal session' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))

    expect(mockStop).toHaveBeenCalledTimes(1)
    expect(mockRestart).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows terminal errors and disables stop after terminal failure', () => {
    mockUseTerminal.mockReturnValue({
      connected: false,
      error: 'Terminal backend did not accept the websocket.',
      status: 'error',
      processId: null,
      cwd: null,
      exitCode: null,
      exitSignal: null,
      closeReason: null,
      stop: mockStop,
      restart: mockRestart,
    })

    render(<ChatTerminalDrawer onClose={vi.fn()} />)

    expect(screen.getByText('Terminal backend did not accept the websocket.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop terminal session' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restart terminal session' })).toBeEnabled()
  })

  it.each(['stopped', 'closed'] as const)('disables stop when terminal is %s', (status) => {
    mockUseTerminal.mockReturnValue({
      connected: false,
      error: null,
      status,
      processId: null,
      cwd: null,
      exitCode: null,
      exitSignal: null,
      closeReason: null,
      stop: mockStop,
      restart: mockRestart,
    })

    render(<ChatTerminalDrawer onClose={vi.fn()} />)

    expect(screen.getByText(status)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop terminal session' })).toBeDisabled()
  })

  it('renders final process status from lifecycle metadata', () => {
    mockUseTerminal.mockReturnValue({
      connected: false,
      error: null,
      status: 'closed',
      processId: 'terminal-1',
      cwd: '/Volumes/T7/projects/clawctrl',
      exitCode: 2,
      exitSignal: null,
      closeReason: 'closed',
      stop: mockStop,
      restart: mockRestart,
    })

    render(<ChatTerminalDrawer onClose={vi.fn()} />)

    expect(screen.getByText('exited 2')).toBeInTheDocument()
  })

  it('publishes terminal lifecycle status to the parent surface', async () => {
    const onStatusChange = vi.fn()
    mockUseTerminal.mockReturnValue({
      connected: true,
      error: null,
      status: 'running',
      processId: 'terminal-1',
      cwd: '/Volumes/T7/projects/clawctrl',
      exitCode: null,
      exitSignal: null,
      closeReason: null,
      stop: mockStop,
      restart: mockRestart,
    })

    render(
      <ChatTerminalDrawer
        title="Tauri dev"
        cwd="/Volumes/T7/projects/clawctrl"
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    )

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith({
        title: 'Tauri dev',
        status: 'running',
        displayText: 'running',
        cwd: '/Volumes/T7/projects/clawctrl',
        processId: 'terminal-1',
        error: null,
      })
    })
  })
})
