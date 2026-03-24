/**
 * Wizard State Store — centralized setup wizard state via useSyncExternalStore.
 *
 * Follows the exact pattern from theme-store.ts and sidebar-settings.ts:
 *   - Module-level _state + _listeners
 *   - persist() writes to localStorage (excluding testResults) and notifies listeners
 *   - React components subscribe via useSyncExternalStore(subscribeWizard, getWizardState)
 *   - 24-hour TTL on persisted state to limit credential exposure window
 */

import { useSyncExternalStore } from 'react'
import { APP_MODULES } from './modules'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'error'
  latencyMs?: number
  error?: string
}

interface WizardState {
  currentStep: number // 0-9
  completedSteps: number[] // Array, not Set (JSON serialization)
  stepStatus: Record<number, 'idle' | 'testing' | 'success' | 'error' | 'skipped'>
  // Credential fields
  supabaseUrl: string
  supabaseAnonKey: string
  openclawUrl: string
  openclawApiKey: string
  blueBubblesUrl: string
  blueBubblesPassword: string
  macBridgeUrl: string
  macBridgeApiKey: string
  couchdbUrl: string
  couchdbUsername: string
  couchdbPassword: string
  // Non-persisted
  testResults: Record<string, TestResult>
  // Module selection
  enabledModules: string[]
  activeBundle: 'essentials' | 'full' | 'minimal' | null
  // Theme
  selectedThemeId: string
  selectedMode: 'dark' | 'light' | 'system'
  // Metadata
  createdAt: number // Unix ms, for 24h TTL check
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wizard-state'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export const STEP_NAMES = [
  'Welcome',
  'Tailscale',
  'Supabase',
  'OpenClaw',
  'Mac Services',
  'Server Services',
  'Modules',
  'Theme',
  'Summary',
  'Done',
] as const

/** Step indices that require a passing connection test before proceeding */
export const REQUIRED_STEPS = [1, 2, 3] as const // Tailscale, Supabase, OpenClaw

/** Preset bundle definitions mapping to module ID arrays */
export const PRESET_BUNDLES: Record<'essentials' | 'full' | 'minimal', string[]> = {
  essentials: ['chat', 'todos', 'calendar', 'dashboard', 'notes'],
  full: APP_MODULES.map(m => m.id),
  minimal: ['dashboard', 'chat'],
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefaultState(): WizardState {
  return {
    currentStep: 0,
    completedSteps: [],
    stepStatus: {},
    supabaseUrl: '',
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
    testResults: {},
    enabledModules: [],
    activeBundle: 'essentials',
    selectedThemeId: 'default-dark',
    selectedMode: 'dark',
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadInitialState(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WizardState>
      // TTL check: discard state older than 24 hours
      if (parsed.createdAt && Date.now() - parsed.createdAt > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY)
        return createDefaultState()
      }
      // Merge with defaults for forward compatibility; always reset testResults
      return { ...createDefaultState(), ...parsed, testResults: {} }
    }
  } catch { /* fallback to default */ }
  return createDefaultState()
}

let _state: WizardState = loadInitialState()
const _listeners = new Set<() => void>()

function persist() {
  // Exclude testResults from serialized JSON (re-run on resume)
  const { testResults: _, ...persistable } = _state
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
  _listeners.forEach(fn => fn())
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export function getWizardState(): WizardState {
  return _state
}

export function subscribeWizard(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useWizardState(): WizardState {
  return useSyncExternalStore(subscribeWizard, getWizardState)
}

// ---------------------------------------------------------------------------
// Mutation API
// ---------------------------------------------------------------------------

export function setWizardStep(step: number): void {
  _state = { ..._state, currentStep: step }
  persist()
}

export function updateWizardField<K extends keyof WizardState>(
  field: K,
  value: WizardState[K],
): void {
  _state = { ..._state, [field]: value }
  persist()
}

export function updateTestResult(service: string, result: TestResult): void {
  _state = {
    ..._state,
    testResults: { ..._state.testResults, [service]: result },
  }
  // testResults are NOT persisted but listeners still need notification
  _listeners.forEach(fn => fn())
}

export function markStepCompleted(step: number): void {
  if (_state.completedSteps.includes(step)) return
  _state = {
    ..._state,
    completedSteps: [..._state.completedSteps, step],
  }
  persist()
}

export function markStepStatus(
  step: number,
  status: 'idle' | 'testing' | 'success' | 'error' | 'skipped',
): void {
  _state = {
    ..._state,
    stepStatus: { ..._state.stepStatus, [step]: status },
  }
  persist()
}

export function completeWizard(): void {
  localStorage.setItem('setup-complete', 'true')
  localStorage.removeItem(STORAGE_KEY)
  _state = createDefaultState()
  _listeners.forEach(fn => fn())
}

export function resetWizard(): void {
  localStorage.removeItem('setup-complete')
  localStorage.removeItem(STORAGE_KEY)
  _state = createDefaultState()
  _listeners.forEach(fn => fn())
}

// ---------------------------------------------------------------------------
// First-run & Demo mode
// ---------------------------------------------------------------------------

export function isFirstRun(): boolean {
  return !localStorage.getItem('setup-complete')
}

export function isWizardDemoMode(): boolean {
  return localStorage.getItem('demo-mode') === 'true'
}

export function activateDemoMode(): void {
  localStorage.setItem('demo-mode', 'true')
}

export function deactivateDemoMode(): void {
  localStorage.removeItem('demo-mode')
}
