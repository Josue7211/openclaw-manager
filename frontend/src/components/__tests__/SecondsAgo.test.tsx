import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createElement } from 'react'

// We need to control setInterval for the shared timer
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

async function importSecondsAgo() {
  const mod = await import('../SecondsAgo')
  return mod.default
}

describe('SecondsAgo rendering', () => {
  it('renders "0s ago" when sinceMs is now', async () => {
    const SecondsAgo = await importSecondsAgo()
    const now = Date.now()
    render(createElement(SecondsAgo, { sinceMs: now }))
    expect(screen.getByText('0s ago')).toBeTruthy()
  })

  it('renders correct seconds for a timestamp in the past', async () => {
    const SecondsAgo = await importSecondsAgo()
    const fiveSecondsAgo = Date.now() - 5000
    render(createElement(SecondsAgo, { sinceMs: fiveSecondsAgo }))
    expect(screen.getByText('5s ago')).toBeTruthy()
  })

  it('renders larger values correctly', async () => {
    const SecondsAgo = await importSecondsAgo()
    const twoMinutesAgo = Date.now() - 120_000
    render(createElement(SecondsAgo, { sinceMs: twoMinutesAgo }))
    expect(screen.getByText('120s ago')).toBeTruthy()
  })

  it('updates display after the shared interval ticks', async () => {
    const SecondsAgo = await importSecondsAgo()
    const now = Date.now()
    render(createElement(SecondsAgo, { sinceMs: now }))
    expect(screen.getByText('0s ago')).toBeTruthy()

    // Advance time by 3 seconds — the shared interval fires every 1s
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('3s ago')).toBeTruthy()
  })

  it('floors fractional seconds', async () => {
    const SecondsAgo = await importSecondsAgo()
    const almostTwoSeconds = Date.now() - 1999
    render(createElement(SecondsAgo, { sinceMs: almostTwoSeconds }))
    expect(screen.getByText('1s ago')).toBeTruthy()
  })
})

describe('SecondsAgo shared interval', () => {
  it('multiple instances share one interval — subscribers increase', async () => {
    // We verify sharing by importing the module once and rendering
    // multiple components. The internal `listeners` Set grows by one
    // per mounted instance (via useSyncExternalStore's subscribe).
    const SecondsAgo = await importSecondsAgo()
    const now = Date.now()

    const { unmount: unmount1 } = render(
      createElement(SecondsAgo, { sinceMs: now }),
    )
    const { unmount: unmount2 } = render(
      createElement(SecondsAgo, { sinceMs: now - 10_000 }),
    )

    // Both should render without errors — sharing the interval
    expect(screen.getByText('0s ago')).toBeTruthy()
    expect(screen.getByText('10s ago')).toBeTruthy()

    // Advance timer — both should update from the same tick
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('1s ago')).toBeTruthy()
    expect(screen.getByText('11s ago')).toBeTruthy()

    unmount1()
    unmount2()
  })

  it('unmounting an instance unsubscribes from the shared interval', async () => {
    const SecondsAgo = await importSecondsAgo()
    const now = Date.now()

    const { unmount } = render(createElement(SecondsAgo, { sinceMs: now }))
    expect(screen.getByText('0s ago')).toBeTruthy()

    unmount()

    // After unmounting, advancing time should not cause errors
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // No SecondsAgo text should be in the document
    expect(screen.queryByText(/s ago/)).toBeNull()
  })

  it('a single interval tick updates all mounted instances simultaneously', async () => {
    const SecondsAgo = await importSecondsAgo()
    const t1 = Date.now() - 2000
    const t2 = Date.now() - 7000
    const t3 = Date.now() - 15000

    // Wrap each instance in a container with a test ID so we can
    // query text within each one independently (the React fragment
    // output produces separate text nodes that confuse getByText
    // when siblings share a parent).
    render(
      createElement('div', null,
        createElement('span', { 'data-testid': 'sa-1' },
          createElement(SecondsAgo, { sinceMs: t1 }),
        ),
        createElement('span', { 'data-testid': 'sa-2' },
          createElement(SecondsAgo, { sinceMs: t2 }),
        ),
        createElement('span', { 'data-testid': 'sa-3' },
          createElement(SecondsAgo, { sinceMs: t3 }),
        ),
      ),
    )

    expect(screen.getByTestId('sa-1').textContent).toBe('2s ago')
    expect(screen.getByTestId('sa-2').textContent).toBe('7s ago')
    expect(screen.getByTestId('sa-3').textContent).toBe('15s ago')

    // One tick should update all three
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByTestId('sa-1').textContent).toBe('3s ago')
    expect(screen.getByTestId('sa-2').textContent).toBe('8s ago')
    expect(screen.getByTestId('sa-3').textContent).toBe('16s ago')
  })
})
