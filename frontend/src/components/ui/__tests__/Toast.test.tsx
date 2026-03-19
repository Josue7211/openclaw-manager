import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'

afterEach(() => {
  vi.restoreAllMocks()
})

function TestTrigger({ type, message }: { type: 'success' | 'error' | 'warning' | 'info'; message: string }) {
  const { show } = useToast()
  return (
    <button onClick={() => show({ type, message })}>
      Trigger
    </button>
  )
}

describe('Toast', () => {
  it('ToastProvider renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Hello</div>
      </ToastProvider>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('useToast returns a show function', () => {
    let showFn: unknown
    function Capture() {
      const { show } = useToast()
      showFn = show
      return null
    }
    render(
      <ToastProvider>
        <Capture />
      </ToastProvider>,
    )
    expect(typeof showFn).toBe('function')
  })

  it('calling show() with type "error" renders toast with role="alert"', async () => {
    render(
      <ToastProvider>
        <TestTrigger type="error" message="Something failed" />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger' }).click()
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something failed')).toBeInTheDocument()
  })

  it('calling show() with type "success" renders toast with role="status"', async () => {
    render(
      <ToastProvider>
        <TestTrigger type="success" message="Saved" />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger' }).click()
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('toast has role="status" for info type', async () => {
    render(
      <ToastProvider>
        <TestTrigger type="info" message="FYI" />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger' }).click()
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('new toast replaces existing one (replace mode)', async () => {
    function MultiTrigger() {
      const { show } = useToast()
      return (
        <>
          <button onClick={() => show({ type: 'info', message: 'First toast' })}>First</button>
          <button onClick={() => show({ type: 'info', message: 'Second toast' })}>Second</button>
        </>
      )
    }
    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'First' }).click()
    })
    expect(screen.getByText('First toast')).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Second' }).click()
    })
    expect(screen.getByText('Second toast')).toBeInTheDocument()
    expect(screen.queryByText('First toast')).not.toBeInTheDocument()
  })
})
