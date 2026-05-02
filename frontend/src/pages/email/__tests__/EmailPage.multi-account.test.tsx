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
  ArrowsClockwise: () => <svg data-testid="icon-refresh" />,
  WarningCircle: () => <svg data-testid="icon-warning" />,
  Gear: () => <svg data-testid="icon-gear" />,
  CaretDown: () => <svg data-testid="icon-caret-down" />,
  CaretUp: () => <svg data-testid="icon-caret-up" />,
  Star: () => <svg data-testid="icon-star" />,
  Trash: () => <svg data-testid="icon-trash" />,
  X: () => <svg data-testid="icon-x" />,
  EnvelopeSimple: () => <svg data-testid="icon-envelope-simple" />,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/email']}>
          {children}
        </MemoryRouter>
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
            account_label: 'Personal Gmail',
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
              id: 'acct_gmail_personal',
              label: 'Personal Gmail',
              provider: 'gmail',
              address: 'me@gmail.com',
              agentmail_inbox_id: 'am_1',
              forwarding_status: 'active',
              is_default: true,
            },
          ],
        }
      }

      if (path.startsWith('/api/email?')) {
        return {
          threads: [
            {
              id: 'thr_1',
              account_id: 'acct_gmail_personal',
              subject: 'Quarterly update',
              from: 'boss@example.com',
              preview: 'Can you reply by Friday?',
              unread: true,
            },
          ],
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    const EmailPage = await getEmailPage()
    render(<EmailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/email?folder=INBOX&account_id=acct_gmail_personal')
    })

    expect(await screen.findByText('Replying as Personal Gmail')).toBeInTheDocument()
    expect(screen.getByText('Draft Queue')).toBeInTheDocument()
    expect(screen.getByText('No drafts yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare draft' }))

    expect(await screen.findByText('needs human send')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/mail-accounts')
  })
})
