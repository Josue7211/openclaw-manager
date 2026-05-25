import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()
const mockDel = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    del: (...args: unknown[]) => mockDel(...args),
  },
}))

vi.mock('@/components/PageHeader', () => ({
  PageHeader: ({ defaultTitle }: { defaultTitle: string }) => <h1>{defaultTitle}</h1>,
}))

vi.mock('@/components/Skeleton', () => ({
  SkeletonList: () => <div data-testid="skeleton">Loading...</div>,
}))

vi.mock('@phosphor-icons/react', () => ({
  Envelope: () => <svg data-testid="icon-envelope" />,
  Archive: () => <svg data-testid="icon-archive" />,
  ArrowsClockwise: () => <svg data-testid="icon-refresh" />,
  Clock: () => <svg data-testid="icon-clock" />,
  WarningCircle: () => <svg data-testid="icon-warning" />,
  Gear: () => <svg data-testid="icon-gear" />,
  MagnifyingGlass: () => <svg data-testid="icon-search" />,
  PaperPlaneTilt: () => <svg data-testid="icon-send" />,
  PencilSimple: () => <svg data-testid="icon-compose" />,
  CaretDown: () => <svg data-testid="icon-caret-down" />,
  CaretUp: () => <svg data-testid="icon-caret-up" />,
  Star: () => <svg data-testid="icon-star" />,
  Trash: () => <svg data-testid="icon-trash" />,
  X: () => <svg data-testid="icon-x" />,
  ArrowBendUpLeft: () => <svg data-testid="icon-reply" />,
  ArrowBendUpRight: () => <svg data-testid="icon-forward" />,
  EnvelopeSimple: () => <svg data-testid="icon-envelope-simple" />,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/email']}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

async function getEmailPage() {
  const mod = await import('../../Email')
  return mod.default
}

describe('EmailPage multi-account threads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockPost.mockImplementation(async (path: string, body: Record<string, string>) => {
      if (path === '/api/email/drafts') {
        return {
          draft: {
            id: `draft-${body.thread_id}`,
            account_label: 'Aparcedo',
            subject: 'Re: Quarterly update',
            body: 'Draft reply for boss@example.com\n\nCan you reply by Friday?',
            handoff_status: 'needs_human_send',
          },
        }
      }

      throw new Error(`Unexpected POST ${path}`)
    })
  })

  it('renders AgentMail threads for the selected linked account', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          threads: [
            {
              id: 'thr_1',
              account_id: 'josue@aparcedo.org',
              subject: 'Quarterly update',
              from: 'boss@example.com',
              preview: 'Can you reply by Friday?',
              unread: true,
            },
          ],
          source: 'agentmail',
          state: 'ready',
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    render(<EmailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/email?folder=INBOX&limit=100&account_id=josue%40aparcedo.org')
    })

    fireEvent.click(await screen.findByText('Quarterly update'))
    expect(await screen.findByText('Replying as Aparcedo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare draft' }))

    fireEvent.click(screen.getByRole('button', { name: /Drafts/i }))

    expect(await screen.findByText('needs human send')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/mail-accounts')
  })

  it('does not select a thread until the user opens one', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          threads: [
            {
              id: 'thr_1',
              account_id: 'josue@aparcedo.org',
              subject: 'Quarterly update',
              from: 'boss@example.com',
              preview: 'Can you reply by Friday?',
              unread: true,
            },
          ],
          source: 'agentmail',
          state: 'ready',
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    const { container } = render(<EmailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('Quarterly update')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="mail-detail-column"]')).not.toBeInTheDocument()
    expect(screen.queryByText('Select a thread')).not.toBeInTheDocument()
    expect(screen.queryByText('Replying as Aparcedo')).not.toBeInTheDocument()
  })

  it('can close an opened thread back to the message list only view', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          threads: [
            {
              id: 'thr_1',
              account_id: 'josue@aparcedo.org',
              subject: 'Quarterly update',
              from: 'boss@example.com',
              preview: 'Can you reply by Friday?',
              unread: true,
            },
          ],
          source: 'agentmail',
          state: 'ready',
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    const { container } = render(<EmailPage />, { wrapper: createWrapper() })

    fireEvent.click(await screen.findByText('Quarterly update'))
    expect(await screen.findByText('Replying as Aparcedo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close email' }))

    expect(container.querySelector('[data-testid="mail-detail-column"]')).not.toBeInTheDocument()
    expect(screen.queryByText('Replying as Aparcedo')).not.toBeInTheDocument()
  })

  it('shows connected empty copy for an empty mailbox linked through AgentMail access', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          source: 'agentmail',
          state: 'empty',
          agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
          threads: [],
          emails: [],
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    render(<EmailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('AgentMail connected. No messages received yet.')).toBeInTheDocument()
    expect(screen.getAllByText('Aparcedo').length).toBeGreaterThan(0)
    expect(screen.getByText('josue@aparcedo.org')).toBeInTheDocument()
  })

  it('shows AgentMail API key copy for missing AgentMail config', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          source: 'agentmail',
          state: 'error',
          error: 'agentmail_not_configured',
          agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
          threads: [],
          emails: [],
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    render(<EmailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('AgentMail API key missing')).toBeInTheDocument()
  })

  it('shows unmapped AgentMail access inbox id when mapping is missing', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: '',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          source: 'agentmail',
          state: 'error',
          error: 'agentmail_inbox_unmapped',
          account_id: 'josue@aparcedo.org',
          agentmail_inbox_id: '',
          threads: [],
          emails: [],
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    const { container } = render(<EmailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('AgentMail access not mapped')).toBeInTheDocument()
    expect(container.textContent).toContain('agentmail_inbox_id is empty for josue@aparcedo.org')
  })

  it('shows AgentMail upstream failure copy', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'josue@aparcedo.org',
              label: 'Aparcedo',
              provider: 'proton',
              address: 'josue@aparcedo.org',
              agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
              forwarding_status: 'active',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          source: 'agentmail',
          state: 'error',
          error: 'agentmail_upstream_error',
          agentmail_inbox_id: 'clawctrl-josue-aparcedo@agentmail.to',
          threads: [],
          emails: [],
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    const { container } = render(<EmailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('AgentMail request failed')).toBeInTheDocument()
    expect(container.textContent).toContain('the failing hop is AgentMail fetch')
  })

  it('shows Gmail AgentMail access requirement when Gmail is not linked', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/mail-accounts') {
        return {
          accounts: [
            {
              id: 'personal-gmail',
              label: 'Personal Gmail',
              provider: 'gmail',
              address: 'josue@gmail.com',
              agentmail_inbox_id: '',
              forwarding_status: 'pending',
              is_default: true,
              imap_host: '',
              imap_port: 993,
              imap_username: '',
              imap_configured: false,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          source: 'agentmail',
          state: 'error',
          error: 'agentmail_access_required',
          account_id: 'personal-gmail',
          agentmail_inbox_id: '',
          threads: [],
          emails: [],
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    render(<EmailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('AgentMail access required')).toBeInTheDocument()
    expect(
      screen.getByText('Gmail accounts must be linked through AgentMail access before agents can use them.'),
    ).toBeInTheDocument()
  })
})
