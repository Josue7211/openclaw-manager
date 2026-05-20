import { useSyncExternalStore } from 'react'

export interface UiStyleRule {
  id: string
  selector: string
  route?: string
  summary?: string
  styles: Record<string, string>
}

export interface UiCustomizationState {
  rules: UiStyleRule[]
  lastModified: string
}

const STORAGE_KEY = 'ui-customization-state'
const STYLE_ID = 'clawcontrol-ui-customizations'
const MAX_UNDO = 30
const ALLOWED_PROPERTIES = new Set([
  'align-content',
  'align-items',
  'align-self',
  'aspect-ratio',
  'background',
  'background-color',
  'border',
  'border-bottom',
  'border-color',
  'border-left',
  'border-radius',
  'border-right',
  'border-style',
  'border-top',
  'border-width',
  'box-shadow',
  'color',
  'column-gap',
  'display',
  'filter',
  'flex',
  'flex-direction',
  'flex-wrap',
  'font-size',
  'font-weight',
  'gap',
  'grid-column',
  'grid-row',
  'grid-template-columns',
  'grid-template-rows',
  'height',
  'justify-content',
  'justify-items',
  'justify-self',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'opacity',
  'order',
  'outline',
  'outline-color',
  'outline-offset',
  'outline-width',
  'overflow',
  'overflow-wrap',
  'overflow-x',
  'overflow-y',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'place-items',
  'row-gap',
  'text-align',
  'text-transform',
  'transform',
  'visibility',
  'white-space',
  'width',
  'z-index',
])

const listeners = new Set<() => void>()
let savedState: UiCustomizationState = loadState()
let currentState: UiCustomizationState = savedState
let draftBase: UiCustomizationState | null = null
const undoStack: UiCustomizationState[] = []
const redoStack: UiCustomizationState[] = []

function loadState(): UiCustomizationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as UiCustomizationState
      if (parsed && Array.isArray(parsed.rules)) {
        return {
          rules: parsed.rules.map(sanitizeRule).filter(Boolean) as UiStyleRule[],
          lastModified: parsed.lastModified || new Date().toISOString(),
        }
      }
    }
  } catch {
    /* fall through */
  }
  return { rules: [], lastModified: new Date().toISOString() }
}

function emit() {
  applyUiCustomizations()
  listeners.forEach(listener => listener())
}

function persist() {
  currentState = { ...currentState, lastModified: new Date().toISOString() }
  savedState = structuredClone(currentState)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState))
}

function pushUndo() {
  undoStack.push(structuredClone(currentState))
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack.length = 0
}

function cssEscapeSelector(selector: string): string {
  return selector.replace(/[{}]/g, '').trim()
}

function cssEscapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeProperty(property: string): string {
  return property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`).trim().toLowerCase()
}

function sanitizeCssValue(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text || text.length > 180) return null
  if (/[;{}]/.test(text)) return null
  if (/\b(url|expression|javascript:|data:|@import)\b/i.test(text)) return null
  return text
}

function sanitizeRule(rule: unknown): UiStyleRule | null {
  if (!rule || typeof rule !== 'object') return null
  const raw = rule as Record<string, unknown>
  const selector = cssEscapeSelector(String(raw.selector || ''))
  if (!selector || selector.length > 300) return null
  const rawStyles = raw.styles && typeof raw.styles === 'object' ? raw.styles as Record<string, unknown> : {}
  const styles: Record<string, string> = {}
  for (const [property, value] of Object.entries(rawStyles)) {
    const normalized = normalizeProperty(property)
    if (!ALLOWED_PROPERTIES.has(normalized)) continue
    const safeValue = sanitizeCssValue(value)
    if (safeValue) styles[normalized] = safeValue
  }
  if (Object.keys(styles).length === 0) return null
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `ui-rule-${crypto.randomUUID().slice(0, 8)}`,
    selector,
    route: typeof raw.route === 'string' ? raw.route : undefined,
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    styles,
  }
}

function declarations(styles: Record<string, string>): string {
  return Object.entries(styles).map(([property, value]) => `  ${property}: ${value} !important;`).join('\n')
}

export function applyUiCustomizations(): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = currentState.rules
    .map(rule => {
      const routePrefix = rule.route ? `:root[data-claw-route="${cssEscapeAttribute(rule.route)}"] ` : ''
      return `${routePrefix}${rule.selector} {\n${declarations(rule.styles)}\n}`
    })
    .join('\n\n')
}

export function getUiCustomizationState(): UiCustomizationState {
  return currentState
}

export function subscribeUiCustomizations(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function startUiCustomizationDraft(): void {
  if (draftBase) return
  draftBase = structuredClone(currentState)
  undoStack.length = 0
  redoStack.length = 0
}

export function previewUiStyleRule(rule: UiStyleRule): UiStyleRule {
  const safe = sanitizeRule(rule)
  if (!safe) throw new Error('No safe CSS styles were provided.')
  startUiCustomizationDraft()
  pushUndo()
  const existingIndex = currentState.rules.findIndex(item => item.id === safe.id)
  const rules = existingIndex >= 0
    ? currentState.rules.map((item, index) => index === existingIndex ? safe : item)
    : [...currentState.rules, safe]
  currentState = { ...currentState, rules }
  emit()
  return safe
}

export function commitUiCustomizationDraft(): boolean {
  if (!draftBase) return false
  persist()
  draftBase = null
  undoStack.length = 0
  redoStack.length = 0
  emit()
  return true
}

export function discardUiCustomizationDraft(): boolean {
  if (!draftBase) return false
  currentState = draftBase
  draftBase = null
  undoStack.length = 0
  redoStack.length = 0
  emit()
  return true
}

export function undoUiCustomizationDraft(): boolean {
  if (!draftBase) return false
  const prev = undoStack.pop()
  if (!prev) return false
  redoStack.push(structuredClone(currentState))
  currentState = prev
  emit()
  return true
}

export function redoUiCustomizationDraft(): boolean {
  if (!draftBase) return false
  const next = redoStack.pop()
  if (!next) return false
  undoStack.push(structuredClone(currentState))
  currentState = next
  emit()
  return true
}

export function hasUiCustomizationDraft(): boolean {
  return Boolean(draftBase)
}

export function useUiCustomizationState(): UiCustomizationState {
  return useSyncExternalStore(subscribeUiCustomizations, getUiCustomizationState)
}

if (typeof window !== 'undefined') {
  applyUiCustomizations()
}
