import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage before importing the module
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

describe('theme-store blend position', () => {
  beforeEach(() => {
    for (const key in store) delete store[key]
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('setBlendPosition(0.5) updates state.blendPosition to 0.5', async () => {
    const { getThemeState, setBlendPosition } = await import('../theme-store')
    setBlendPosition(0.5)
    expect(getThemeState().blendPosition).toBe(0.5)
  })

  it('setBlendPosition(0) sets blendPosition to 0', async () => {
    const { getThemeState, setBlendPosition } = await import('../theme-store')
    setBlendPosition(0)
    expect(getThemeState().blendPosition).toBe(0)
  })

  it('setBlendPosition(1) sets blendPosition to 1', async () => {
    const { getThemeState, setBlendPosition } = await import('../theme-store')
    setBlendPosition(1)
    expect(getThemeState().blendPosition).toBe(1)
  })

  it('setBlendPosition(-0.1) clamps to 0', async () => {
    const { getThemeState, setBlendPosition } = await import('../theme-store')
    setBlendPosition(-0.1)
    expect(getThemeState().blendPosition).toBe(0)
  })

  it('setBlendPosition(1.5) clamps to 1', async () => {
    const { getThemeState, setBlendPosition } = await import('../theme-store')
    setBlendPosition(1.5)
    expect(getThemeState().blendPosition).toBe(1)
  })

  it('setBlendPosition(undefined) clears blendPosition', async () => {
    const { getThemeState, setBlendPosition } = await import('../theme-store')
    setBlendPosition(0.5)
    expect(getThemeState().blendPosition).toBe(0.5)
    setBlendPosition(undefined)
    expect(getThemeState().blendPosition).toBeUndefined()
  })

  it('setMode("system") clears blendPosition', async () => {
    const { getThemeState, setBlendPosition, setMode } = await import('../theme-store')
    setBlendPosition(0.5)
    expect(getThemeState().blendPosition).toBe(0.5)
    setMode('system')
    expect(getThemeState().blendPosition).toBeUndefined()
  })

  it('setMode("dark") preserves blendPosition', async () => {
    const { getThemeState, setBlendPosition, setMode } = await import('../theme-store')
    setBlendPosition(0.7)
    expect(getThemeState().blendPosition).toBe(0.7)
    setMode('dark')
    expect(getThemeState().blendPosition).toBe(0.7)
  })
})
