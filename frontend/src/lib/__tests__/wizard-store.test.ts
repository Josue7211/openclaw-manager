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

describe('wizard-store', () => {
  beforeEach(() => {
    for (const key in store) delete store[key]
    vi.clearAllMocks()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('loadInitialState returns DEFAULT_STATE when localStorage is empty', async () => {
    const { getWizardState } = await import('../wizard-store')
    const state = getWizardState()
    expect(state.currentStep).toBe(0)
    expect(state.completedSteps).toEqual([])
    expect(state.stepStatus).toEqual({})
    expect(state.supabaseUrl).toBe('')
    expect(state.supabaseAnonKey).toBe('')
    expect(state.openclawUrl).toBe('')
    expect(state.openclawApiKey).toBe('')
    expect(state.blueBubblesUrl).toBe('')
    expect(state.blueBubblesPassword).toBe('')
    expect(state.macBridgeUrl).toBe('')
    expect(state.macBridgeApiKey).toBe('')
    expect(state.couchdbUrl).toBe('')
    expect(state.couchdbUsername).toBe('')
    expect(state.couchdbPassword).toBe('')
    expect(state.testResults).toEqual({})
    expect(state.enabledModules).toEqual([])
    expect(state.activeBundle).toBe('essentials')
    expect(state.selectedThemeId).toBe('default-dark')
    expect(state.selectedMode).toBe('dark')
  })

  it('loadInitialState restores persisted state from localStorage (except testResults)', async () => {
    const persisted = {
      currentStep: 3,
      completedSteps: [0, 1, 2],
      stepStatus: { 1: 'success', 2: 'success' },
      supabaseUrl: 'https://supabase.example.com',
      supabaseAnonKey: 'anon-key-123',
      openclawUrl: '',
      openclawApiKey: '',
      blueBubblesUrl: '',
      blueBubblesPassword: '',
      macBridgeUrl: '',
      macBridgeApiKey: '',
      couchdbUrl: '',
      couchdbUsername: '',
      couchdbPassword: '',
      testResults: { supabase: { status: 'success', latencyMs: 45 } },
      enabledModules: ['chat', 'todos'],
      activeBundle: 'essentials',
      selectedThemeId: 'dracula',
      selectedMode: 'dark',
      createdAt: Date.now(),
    }
    store['wizard-state'] = JSON.stringify(persisted)

    const { getWizardState } = await import('../wizard-store')
    const state = getWizardState()
    expect(state.currentStep).toBe(3)
    expect(state.completedSteps).toEqual([0, 1, 2])
    expect(state.supabaseUrl).toBe('https://supabase.example.com')
    expect(state.selectedThemeId).toBe('dracula')
    // testResults should be reset to empty on load
    expect(state.testResults).toEqual({})
  })

  it('loadInitialState discards wizard-state older than 24 hours (TTL check)', async () => {
    const oldState = {
      currentStep: 5,
      completedSteps: [0, 1, 2, 3, 4],
      stepStatus: {},
      supabaseUrl: 'https://old.example.com',
      supabaseAnonKey: '',
      openclawUrl: '',
      openclawApiKey: '',
      blueBubblesUrl: '',
      blueBubblesPassword: '',
      macBridgeUrl: '',
      macBridgeApiKey: '',
      couchdbUrl: '',
      couchdbUsername: '',
      couchdbPassword: '',
      enabledModules: [],
      activeBundle: 'essentials',
      selectedThemeId: 'default-dark',
      selectedMode: 'dark',
      createdAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
    }
    store['wizard-state'] = JSON.stringify(oldState)

    const { getWizardState } = await import('../wizard-store')
    const state = getWizardState()
    // Should discard and return default
    expect(state.currentStep).toBe(0)
    expect(state.supabaseUrl).toBe('')
  })

  it('setWizardStep(N) updates currentStep and persists', async () => {
    const { getWizardState, setWizardStep } = await import('../wizard-store')
    setWizardStep(4)
    expect(getWizardState().currentStep).toBe(4)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'wizard-state',
      expect.stringContaining('"currentStep":4')
    )
  })

  it('updateWizardField updates field and persists', async () => {
    const { getWizardState, updateWizardField } = await import('../wizard-store')
    updateWizardField('supabaseUrl', 'https://supabase.example.com')
    expect(getWizardState().supabaseUrl).toBe('https://supabase.example.com')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'wizard-state',
      expect.stringContaining('"supabaseUrl":"https://supabase.example.com"')
    )
  })

  it('completeWizard() deletes wizard-state and sets setup-complete', async () => {
    const { completeWizard, setWizardStep } = await import('../wizard-store')
    setWizardStep(9)
    completeWizard()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('wizard-state')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('setup-complete', 'true')
  })

  it('resetWizard() deletes setup-complete and wizard-state from localStorage', async () => {
    store['setup-complete'] = 'true'
    store['wizard-state'] = '{"currentStep":5}'
    const { resetWizard, getWizardState } = await import('../wizard-store')
    resetWizard()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('setup-complete')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('wizard-state')
    expect(getWizardState().currentStep).toBe(0)
  })

  it('isFirstRun() returns true when no setup-complete key exists', async () => {
    const { isFirstRun } = await import('../wizard-store')
    expect(isFirstRun()).toBe(true)
  })

  it('isFirstRun() returns false when setup-complete key exists', async () => {
    store['setup-complete'] = 'true'
    const { isFirstRun } = await import('../wizard-store')
    expect(isFirstRun()).toBe(false)
  })

  it('activateDemoMode() sets demo-mode in localStorage', async () => {
    const { activateDemoMode } = await import('../wizard-store')
    activateDemoMode()
    expect(localStorageMock.setItem).toHaveBeenCalledWith('demo-mode', 'true')
  })

  it('deactivateDemoMode() removes demo-mode from localStorage', async () => {
    store['demo-mode'] = 'true'
    const { deactivateDemoMode } = await import('../wizard-store')
    deactivateDemoMode()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('demo-mode')
  })

  it('isWizardDemoMode() returns correct boolean', async () => {
    const mod1 = await import('../wizard-store')
    expect(mod1.isWizardDemoMode()).toBe(false)

    store['demo-mode'] = 'true'
    expect(mod1.isWizardDemoMode()).toBe(true)

    delete store['demo-mode']
    expect(mod1.isWizardDemoMode()).toBe(false)
  })

  it('testResults are NOT included in persisted JSON', async () => {
    const { updateTestResult, setWizardStep } = await import('../wizard-store')
    // First trigger a persist by setting a step
    setWizardStep(1)
    updateTestResult('supabase', { status: 'success', latencyMs: 45 })
    // The last persist was from setWizardStep; testResults only notifies listeners
    // Verify that the persisted JSON does NOT contain testResults
    const persisted = store['wizard-state']
    expect(persisted).toBeDefined()
    const parsed = JSON.parse(persisted)
    expect(parsed.testResults).toBeUndefined()
  })

  it('subscribe/unsubscribe works (listener called on mutation, not after unsubscribe)', async () => {
    const { subscribeWizard, setWizardStep } = await import('../wizard-store')
    const listener = vi.fn()
    const unsub = subscribeWizard(listener)

    setWizardStep(2)
    expect(listener).toHaveBeenCalledTimes(1)

    setWizardStep(3)
    expect(listener).toHaveBeenCalledTimes(2)

    unsub()
    setWizardStep(4)
    // Should not be called again after unsubscribe
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('markStepCompleted adds to completedSteps', async () => {
    const { getWizardState, markStepCompleted } = await import('../wizard-store')
    markStepCompleted(0)
    expect(getWizardState().completedSteps).toContain(0)
    // Should not duplicate
    markStepCompleted(0)
    expect(getWizardState().completedSteps.filter(s => s === 0)).toHaveLength(1)
  })

  it('markStepStatus updates stepStatus', async () => {
    const { getWizardState, markStepStatus } = await import('../wizard-store')
    markStepStatus(2, 'success')
    expect(getWizardState().stepStatus[2]).toBe('success')
    markStepStatus(2, 'error')
    expect(getWizardState().stepStatus[2]).toBe('error')
  })

  it('STEP_NAMES exports 10 step names', async () => {
    const { STEP_NAMES } = await import('../wizard-store')
    expect(STEP_NAMES).toHaveLength(10)
    expect(STEP_NAMES[0]).toBe('Welcome')
    expect(STEP_NAMES[9]).toBe('Done')
  })

  it('REQUIRED_STEPS exports Tailscale, Supabase, OpenClaw indices', async () => {
    const { REQUIRED_STEPS } = await import('../wizard-store')
    expect(REQUIRED_STEPS).toEqual([1, 2, 3])
  })

  it('PRESET_BUNDLES maps bundle names to module arrays', async () => {
    const { PRESET_BUNDLES } = await import('../wizard-store')
    expect(PRESET_BUNDLES.essentials).toEqual(['chat', 'todos', 'calendar', 'dashboard', 'notes'])
    expect(PRESET_BUNDLES.minimal).toEqual(['dashboard', 'chat'])
    expect(PRESET_BUNDLES.full).toHaveLength(18)
  })
})
