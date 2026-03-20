import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { for (const key in store) delete store[key] }),
  get length() { return Object.keys(store).length },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
}

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Mock matchMedia
let matchMediaResult = false
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matchMediaResult : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock document.documentElement.setAttribute
const setAttributeSpy = vi.spyOn(document.documentElement, 'setAttribute')

describe('animation-intensity', () => {
  beforeEach(() => {
    for (const key in store) delete store[key]
    vi.clearAllMocks()
    vi.resetModules()
    matchMediaResult = false
  })

  it('getDefaultLevel returns "reduced" when matchMedia matches prefers-reduced-motion', async () => {
    matchMediaResult = true
    const mod = await import('../animation-intensity')
    // On import, if no stored value, it falls back to getDefaultLevel
    expect(mod.getAnimationIntensity()).toBe('reduced')
  })

  it('getDefaultLevel returns "full" when matchMedia does not match', async () => {
    matchMediaResult = false
    const mod = await import('../animation-intensity')
    expect(mod.getAnimationIntensity()).toBe('full')
  })

  it('setAnimationIntensity("none") persists to localStorage and notifies listeners', async () => {
    const mod = await import('../animation-intensity')
    const listener = vi.fn()
    mod.subscribeAnimationIntensity(listener)

    mod.setAnimationIntensity('none')

    expect(mod.getAnimationIntensity()).toBe('none')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('animation-intensity', 'none')
    expect(listener).toHaveBeenCalled()
  })

  it('getAnimationIntensity returns the stored value', async () => {
    const mod = await import('../animation-intensity')
    mod.setAnimationIntensity('reduced')
    expect(mod.getAnimationIntensity()).toBe('reduced')
  })

  it('applyToDOM sets data-animation attribute on documentElement', async () => {
    const mod = await import('../animation-intensity')
    // On load, applyToDOM should have been called with the initial level
    expect(setAttributeSpy).toHaveBeenCalledWith('data-animation', expect.any(String))

    mod.setAnimationIntensity('none')
    expect(setAttributeSpy).toHaveBeenCalledWith('data-animation', 'none')
  })

  it('initial load reads from localStorage if valid value exists', async () => {
    store['animation-intensity'] = 'none'
    const mod = await import('../animation-intensity')
    expect(mod.getAnimationIntensity()).toBe('none')
  })

  it('initial load falls back to getDefaultLevel if no stored value', async () => {
    matchMediaResult = false
    const mod = await import('../animation-intensity')
    expect(mod.getAnimationIntensity()).toBe('full')
  })

  it('subscribe/unsubscribe works correctly', async () => {
    const mod = await import('../animation-intensity')
    const listener = vi.fn()
    const unsub = mod.subscribeAnimationIntensity(listener)

    mod.setAnimationIntensity('reduced')
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    mod.setAnimationIntensity('full')
    expect(listener).toHaveBeenCalledTimes(1) // Not called again
  })

  it('shouldAnimate returns false when level is "none"', async () => {
    const mod = await import('../animation-intensity')
    mod.setAnimationIntensity('none')
    expect(mod.shouldAnimate()).toBe(false)
    mod.setAnimationIntensity('full')
    expect(mod.shouldAnimate()).toBe(true)
    mod.setAnimationIntensity('reduced')
    expect(mod.shouldAnimate()).toBe(true)
  })

  it('shouldReduceMotion returns true when level is not "full"', async () => {
    const mod = await import('../animation-intensity')
    mod.setAnimationIntensity('full')
    expect(mod.shouldReduceMotion()).toBe(false)
    mod.setAnimationIntensity('reduced')
    expect(mod.shouldReduceMotion()).toBe(true)
    mod.setAnimationIntensity('none')
    expect(mod.shouldReduceMotion()).toBe(true)
  })
})
