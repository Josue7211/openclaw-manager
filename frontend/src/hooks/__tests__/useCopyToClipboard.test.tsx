import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopyToClipboard } from '../useCopyToClipboard'

function ClipboardHarness({ timeout = 1600 }: { timeout?: number }) {
  const {
    copyToClipboard,
    copiedContext,
    errorContext,
  } = useCopyToClipboard<{ id: string }>({ timeout })

  return (
    <div>
      <button type="button" onClick={() => { void copyToClipboard('hello', { id: 'message' }) }}>
        Copy
      </button>
      <span data-testid="copied">{copiedContext?.id ?? ''}</span>
      <span data-testid="errored">{errorContext?.id ?? ''}</span>
    </div>
  )
}

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.useRealTimers()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('copies text and clears copied state after the timeout', async () => {
    vi.useFakeTimers()
    render(<ClipboardHarness timeout={100} />)

    await act(async () => {
      screen.getByRole('button', { name: 'Copy' }).click()
      await Promise.resolve()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
    expect(screen.getByTestId('copied')).toHaveTextContent('message')
    expect(screen.getByTestId('errored')).toHaveTextContent('')

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(screen.getByTestId('copied')).toHaveTextContent('')
  })

  it('reports an unavailable clipboard API as an error state', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    render(<ClipboardHarness />)

    screen.getByRole('button', { name: 'Copy' }).click()

    await waitFor(() => expect(screen.getByTestId('errored')).toHaveTextContent('message'))
    expect(screen.getByTestId('copied')).toHaveTextContent('')
  })

  it('reports rejected clipboard writes as an error state', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    render(<ClipboardHarness />)

    screen.getByRole('button', { name: 'Copy' }).click()

    await waitFor(() => expect(screen.getByTestId('errored')).toHaveTextContent('message'))
    expect(screen.getByTestId('copied')).toHaveTextContent('')
  })
})
