import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import TimerCountdown from '../TimerCountdown'

const baseProps = {
  widgetId: 'test-timer',
  isEditMode: false,
  size: { w: 2, h: 2 },
}

describe('TimerCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders initial time display for 60s countdown', () => {
    render(<TimerCountdown {...baseProps} config={{ duration: 60, direction: 'down' }} />)
    expect(screen.getByText('01:00')).toBeTruthy()
  })

  it('renders initial time for countup mode', () => {
    render(<TimerCountdown {...baseProps} config={{ duration: 60, direction: 'up' }} />)
    expect(screen.getByText('00:00')).toBeTruthy()
  })

  it('play button starts the timer', () => {
    render(<TimerCountdown {...baseProps} config={{ duration: 60, direction: 'down' }} />)
    const playBtn = screen.getByLabelText('Play')
    fireEvent.click(playBtn)
    // After clicking play, pause button should appear
    expect(screen.getByLabelText('Pause')).toBeTruthy()
  })

  it('pause button stops the timer', () => {
    render(<TimerCountdown {...baseProps} config={{ duration: 60, direction: 'down' }} />)
    fireEvent.click(screen.getByLabelText('Play'))
    fireEvent.click(screen.getByLabelText('Pause'))
    // After pausing, play button should reappear
    expect(screen.getByLabelText('Play')).toBeTruthy()
  })

  it('reset button returns to initial state', () => {
    render(<TimerCountdown {...baseProps} config={{ duration: 60, direction: 'down' }} />)
    fireEvent.click(screen.getByLabelText('Play'))

    // Advance some time
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    fireEvent.click(screen.getByLabelText('Reset'))
    expect(screen.getByText('01:00')).toBeTruthy()
  })

  it('interval cleaned up on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = render(
      <TimerCountdown {...baseProps} config={{ duration: 60, direction: 'down' }} />,
    )
    fireEvent.click(screen.getByLabelText('Play'))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('displays title when provided', () => {
    render(
      <TimerCountdown {...baseProps} config={{ duration: 60, direction: 'down', title: 'Pomodoro' }} />,
    )
    expect(screen.getByText('Pomodoro')).toBeTruthy()
  })

  it('shows HH:MM:SS format for durations over 1 hour', () => {
    render(<TimerCountdown {...baseProps} config={{ duration: 3661, direction: 'down' }} />)
    expect(screen.getByText('01:01:01')).toBeTruthy()
  })
})
