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

export interface WizardState {
  currentStep: number // 0-9
  completedSteps: number[] // Array, not Set (JSON serialization)
  stepStatus: Record<number, 'idle' | 'testing' | 'success' | 'error' | 'skipped'>
  backendUrl: string
  pairingToken: string
  // Credential fields
  tailscaleIp: string
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
  couchdbDatabase: string
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
const SETUP_COMPLETE_KEY = 'setup-complete'
const SETUP_ACCOUNT_KEY = 'setup-account-id'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export const STEP_NAMES = [
  'Welcome',
  'Tailscale',
  'Supabase',
  'Harness',
  'Mac Services',
  'Server Services',
  'Modules',
  'Theme',
  'Summary',
  'Done',
] as const

/** Step indices that require a passing connection test before proceeding */
export const REQUIRED_STEPS = [1, 2, 3] as const // Tailscale, Supabase, Harness

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
    backendUrl: '',
    pairingToken: '',
    tailscaleIp: '',
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
    couchdbDatabase: 'clawcontrol-vault',
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
const _setupListeners = new Set<() => void>()

function notifySetupListeners() {
  _setupListeners.forEach(fn => fn())
}

function persist() {
  // Exclude testResults from serialized JSON (re-run on resume)
  // Exclude pairingToken to avoid persisting short-lived credentials in localStorage
  const { testResults: _, pairingToken: _pairingToken, ...persistable } = _state
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

export function getSetupCompletionSnapshot(): boolean {
  return shouldAutoOpenWizard()
}

export function subscribeSetupCompletion(fn: () => void) {
  _setupListeners.add(fn)
  return () => { _setupListeners.delete(fn) }
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

export function completeWizard(accountId?: string): void {
  localStorage.setItem(SETUP_COMPLETE_KEY, 'true')
  if (accountId) localStorage.setItem(SETUP_ACCOUNT_KEY, accountId)
  localStorage.removeItem(STORAGE_KEY)
  _state = createDefaultState()
  _listeners.forEach(fn => fn())
  notifySetupListeners()
}

export function markSetupCompleteForAccount(accountId?: string): void {
  localStorage.setItem(SETUP_COMPLETE_KEY, 'true')
  if (accountId) localStorage.setItem(SETUP_ACCOUNT_KEY, accountId)
  notifySetupListeners()
}

export function resetWizard(): void {
  localStorage.removeItem(SETUP_COMPLETE_KEY)
  localStorage.removeItem(SETUP_ACCOUNT_KEY)
  localStorage.removeItem(STORAGE_KEY)
  _state = createDefaultState()
  _listeners.forEach(fn => fn())
  notifySetupListeners()
}

// ---------------------------------------------------------------------------
// First-run & Demo mode
// ---------------------------------------------------------------------------

export function isFirstRun(): boolean {
  return !localStorage.getItem(SETUP_COMPLETE_KEY)
}

export function isWizardDemoMode(): boolean {
  return localStorage.getItem('demo-mode') === 'true'
}

export function shouldAutoOpenWizard(): boolean {
  return isFirstRun() && !isWizardDemoMode()
}

export function activateDemoMode(): void {
  localStorage.setItem('demo-mode', 'true')
}

export function deactivateDemoMode(): void {
  localStorage.removeItem('demo-mode')
}
