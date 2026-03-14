import { describe, it, expect, vi, beforeEach } from 'vitest'

function createMockAudioContext() {
  const oscillator = {
    connect: vi.fn(),
    type: 'sine' as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
    },
    start: vi.fn(),
    stop: vi.fn(),
  }
  const gainNode = {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  }
  const delayNode = {
    connect: vi.fn(),
    delayTime: {
      setValueAtTime: vi.fn(),
    },
  }
  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn().mockReturnValue(oscillator),
    createGain: vi.fn().mockReturnValue(gainNode),
    createDelay: vi.fn().mockReturnValue(delayNode),
  }
  return { ctx, oscillator, gainNode, delayNode }
}

describe('playNotificationChime', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('creates an oscillator and gain node when AudioContext is available', async () => {
    const { ctx, oscillator, gainNode } = createMockAudioContext()
    const MockAudioContext = vi.fn(function (this: unknown) {
      return Object.assign(this, ctx)
    })
    vi.stubGlobal('AudioContext', MockAudioContext)

    const { playNotificationChime } = await import('../audio')
    await playNotificationChime()

    expect(MockAudioContext).toHaveBeenCalled()
    expect(ctx.createOscillator).toHaveBeenCalled()
    expect(ctx.createGain).toHaveBeenCalled()
    expect(oscillator.connect).toHaveBeenCalledWith(gainNode)
    expect(gainNode.connect).toHaveBeenCalledWith(ctx.destination)
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalled()
    expect(oscillator.start).toHaveBeenCalled()
    expect(oscillator.stop).toHaveBeenCalled()
  })

  it('does not throw when AudioContext is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined)

    const { playNotificationChime } = await import('../audio')
    await expect(playNotificationChime()).resolves.toBeUndefined()
  })
})
