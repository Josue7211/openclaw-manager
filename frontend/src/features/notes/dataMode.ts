import type { VaultNote } from './types'
import { matchesNoteSearch } from './searchFilters'

export interface VaultDataRow {
  id: string
  title: string
  type: VaultNote['type']
  folder: string
  tags: string[]
  properties: Record<string, string | string[]>
  tasksDone: number
  tasksTotal: number
  updatedAt: number
  trashed: boolean
}

export interface VaultTaskRow {
  id: string
  noteId: string
  title: string
  folder: string
  text: string
  line: number
  done: boolean
  tags: string[]
  updatedAt: number
  trashed: boolean
}

export type VaultDataBuiltinFormulaKey = 'taskPercent' | 'tagCount' | 'propertyCount' | 'pathDepth' | 'staleDays'
export type VaultDataFormulaKey = 'none' | VaultDataBuiltinFormulaKey | 'custom'
export type ActiveVaultDataFormulaKey = Exclude<VaultDataFormulaKey, 'none'>
export type VaultDataFormulaValue = number | string
export interface VaultDataFormulaContext {
  customFormula?: string
  now?: number
}
export interface VaultDataFormulaValidation {
  ok: boolean
  message: string
}
export type VaultDataSortKey =
  | 'updated'
  | 'title'
  | 'folder'
  | 'type'
  | 'tags'
  | 'tasks'
  | `property:${string}`
  | `formula:${ActiveVaultDataFormulaKey}`
export type VaultTaskSortKey = 'updated' | 'title' | 'folder' | 'line' | 'done'
export type VaultSortDirection = 'asc' | 'desc'
export type VaultDataViewMode = 'metadata' | 'tasks'
export type VaultDataGroupKey =
  | 'none'
  | 'folder'
  | 'type'
  | 'tags'
  | 'note'
  | 'done'
  | `property:${string}`
  | `formula:${ActiveVaultDataFormulaKey}`
export type VaultDataViewLayout = 'table' | 'cards'

export interface VaultDataGroup<T> {
  id: string
  label: string
  rows: T[]
}

export interface VaultDataViewPreset {
  id: string
  name: string
  mode: VaultDataViewMode
  query: string
  dataSortKey: VaultDataSortKey
  taskSortKey: VaultTaskSortKey
  sortDirection: VaultSortDirection
  groupKey: VaultDataGroupKey
  layout: VaultDataViewLayout
  formulaKey: VaultDataFormulaKey
  customFormula: string
  updatedAt: number
}

export interface VaultDataWorkspaceContext {
  mode: VaultDataViewMode
  query: string
  dataSortKey: VaultDataSortKey
  taskSortKey: VaultTaskSortKey
  sortDirection: VaultSortDirection
  groupKey: VaultDataGroupKey
  layout: VaultDataViewLayout
  formulaKey: VaultDataFormulaKey
  customFormula: string
}

export const DEFAULT_VAULT_DATA_WORKSPACE_CONTEXT: VaultDataWorkspaceContext = {
  mode: 'metadata',
  query: '',
  dataSortKey: 'updated',
  taskSortKey: 'done',
  sortDirection: 'desc',
  groupKey: 'none',
  layout: 'table',
  formulaKey: 'none',
  customFormula: '',
}

const DATA_SORT_KEYS = new Set(['updated', 'title', 'folder', 'type', 'tags', 'tasks'])
const TASK_SORT_KEYS = new Set(['updated', 'title', 'folder', 'line', 'done'])
const GROUP_KEYS = new Set(['none', 'folder', 'type', 'tags', 'note', 'done'])
const FORMULA_KEYS = new Set(['none', 'taskPercent', 'tagCount', 'propertyCount', 'pathDepth', 'staleDays', 'custom'])
const FORMULA_IDENTIFIER_KEYS = new Set([
  'tasksDone',
  'tasksTotal',
  'taskPercent',
  'tagCount',
  'propertyCount',
  'pathDepth',
  'staleDays',
  'updatedAt',
])
const FORMULA_FUNCTION_KEYS = new Set([
  'round',
  'floor',
  'ceil',
  'abs',
  'min',
  'max',
  'clamp',
  'prop',
  'first',
  'count',
  'lower',
  'upper',
  'concat',
  'contains',
  'listContains',
  'eq',
  'gt',
  'gte',
  'lt',
  'lte',
  'if',
  'daysUntil',
  'daysSince',
  'formatDate',
])

export const VAULT_DATA_FORMULAS: Array<{ key: VaultDataBuiltinFormulaKey; label: string }> = [
  { key: 'taskPercent', label: 'Task %' },
  { key: 'tagCount', label: 'Tag count' },
  { key: 'propertyCount', label: 'Property count' },
  { key: 'pathDepth', label: 'Path depth' },
  { key: 'staleDays', label: 'Days stale' },
]

export const VAULT_DATA_FORMULA_FIELDS: Array<{ label: string; snippet: string }> = [
  { label: 'Tasks done', snippet: 'tasksDone' },
  { label: 'Tasks total', snippet: 'tasksTotal' },
  { label: 'Task %', snippet: 'taskPercent' },
  { label: 'Tag count', snippet: 'tagCount' },
  { label: 'Property count', snippet: 'propertyCount' },
  { label: 'Path depth', snippet: 'pathDepth' },
  { label: 'Days stale', snippet: 'staleDays' },
]

export const VAULT_DATA_FORMULA_HELPERS: Array<{ label: string; snippet: string }> = [
  { label: 'Round task %', snippet: 'round(taskPercent)' },
  { label: 'Clamp task %', snippet: 'clamp(taskPercent, 0, 100)' },
  { label: 'High task label', snippet: 'if(gte(taskPercent, 80), "high", "normal")' },
  { label: 'Status text', snippet: 'prop("status")' },
  { label: 'Status uppercase', snippet: 'upper(prop("status"))' },
  { label: 'Days until due', snippet: 'daysUntil(prop("due"))' },
  { label: 'Format due date', snippet: 'formatDate(prop("due"))' },
  { label: 'Owner count', snippet: 'count(prop("owners"))' },
  { label: 'First owner', snippet: 'first(prop("owners"))' },
  { label: 'Has owner', snippet: 'listContains(prop("owners"), "Ada")' },
]

export function buildVaultDataRows(notes: VaultNote[], query = ''): VaultDataRow[] {
  const cleanQuery = query.trim()
  return notes
    .filter((note) => !cleanQuery || matchesNoteSearch(note, cleanQuery))
    .map((note) => {
      const tasks = taskStats(note.content)
      return {
        id: note._id,
        title: note.title || note._id,
        type: note.type,
        folder: note.folder,
        tags: note.tags,
        properties: note.properties ?? {},
        tasksDone: tasks.done,
        tasksTotal: tasks.total,
        updatedAt: note.updated_at,
        trashed: Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/'),
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function buildVaultTaskRows(notes: VaultNote[], query = ''): VaultTaskRow[] {
  const cleanQuery = query.trim()
  return notes
    .filter((note) => note.type === 'note')
    .filter((note) => !cleanQuery || matchesNoteSearch(note, cleanQuery))
    .flatMap((note) => extractTasks(note))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.updatedAt - a.updatedAt || a.line - b.line)
}

export function sortVaultDataRows(
  rows: VaultDataRow[],
  sortKey: VaultDataSortKey,
  direction: VaultSortDirection,
  formulaContext: VaultDataFormulaContext = {},
): VaultDataRow[] {
  return [...rows].sort((a, b) => {
    const comparison = compareDataValues(dataRowSortValue(a, sortKey, formulaContext), dataRowSortValue(b, sortKey, formulaContext))
    return (direction === 'asc' ? comparison : -comparison) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  })
}

export function sortVaultTaskRows(
  rows: VaultTaskRow[],
  sortKey: VaultTaskSortKey,
  direction: VaultSortDirection,
): VaultTaskRow[] {
  return [...rows].sort((a, b) => {
    const comparison = compareDataValues(taskRowSortValue(a, sortKey), taskRowSortValue(b, sortKey))
    return (direction === 'asc' ? comparison : -comparison) || Number(a.done) - Number(b.done) || a.line - b.line
  })
}

export function vaultDataPropertyKeys(rows: VaultDataRow[]): string[] {
  return [...new Set(rows.flatMap(row => Object.keys(row.properties)))].sort((a, b) => a.localeCompare(b))
}

export function groupVaultDataRows(
  rows: VaultDataRow[],
  groupKey: VaultDataGroupKey,
  formulaContext: VaultDataFormulaContext = {},
): Array<VaultDataGroup<VaultDataRow>> {
  return groupRows(rows, row => dataGroupLabel(row, groupKey, formulaContext))
}

export function groupVaultTaskRows(rows: VaultTaskRow[], groupKey: VaultDataGroupKey): Array<VaultDataGroup<VaultTaskRow>> {
  return groupRows(rows, row => taskGroupLabel(row, groupKey))
}

export function normalizeVaultDataViewPresets(value: unknown): VaultDataViewPreset[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): VaultDataViewPreset | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim().slice(0, 96) : ''
      const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 80) : ''
      if (!id || !name) return null
      return {
        id,
        name,
        mode: record.mode === 'tasks' ? 'tasks' : 'metadata',
        query: typeof record.query === 'string' ? record.query.slice(0, 500) : '',
        dataSortKey: normalizeVaultDataSortKey(record.dataSortKey),
        taskSortKey: normalizeVaultTaskSortKey(record.taskSortKey),
        sortDirection: record.sortDirection === 'asc' ? 'asc' : 'desc',
        groupKey: normalizeVaultDataGroupKey(record.groupKey),
        layout: record.layout === 'cards' ? 'cards' : 'table',
        formulaKey: normalizeVaultDataFormulaKey(record.formulaKey),
        customFormula: normalizeVaultDataCustomFormula(record.customFormula),
        updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
      }
    })
    .filter((item): item is VaultDataViewPreset => Boolean(item))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
    .slice(0, 24)
}

export function normalizeVaultDataWorkspaceContext(value: unknown): VaultDataWorkspaceContext {
  if (!value || typeof value !== 'object') return { ...DEFAULT_VAULT_DATA_WORKSPACE_CONTEXT }
  const record = value as Record<string, unknown>
  return {
    mode: record.mode === 'tasks' ? 'tasks' : 'metadata',
    query: typeof record.query === 'string' ? record.query.trim().slice(0, 500) : '',
    dataSortKey: normalizeVaultDataSortKey(record.dataSortKey),
    taskSortKey: normalizeVaultTaskSortKey(record.taskSortKey),
    sortDirection: record.sortDirection === 'asc' ? 'asc' : 'desc',
    groupKey: normalizeVaultDataGroupKey(record.groupKey),
    layout: record.layout === 'cards' ? 'cards' : 'table',
    formulaKey: normalizeVaultDataFormulaKey(record.formulaKey),
    customFormula: normalizeVaultDataCustomFormula(record.customFormula),
  }
}

export function mergeVaultDataViewPresets(...presetLists: VaultDataViewPreset[][]): VaultDataViewPreset[] {
  const byId = new Map<string, VaultDataViewPreset>()
  for (const preset of normalizeVaultDataViewPresets(presetLists.flat())) {
    const existing = byId.get(preset.id)
    if (!existing || preset.updatedAt > existing.updatedAt) {
      byId.set(preset.id, preset)
    }
  }
  return normalizeVaultDataViewPresets([...byId.values()])
}

export function setTaskLineDone(content: string, lineNumber: number, done: boolean): string | null {
  const lines = content.split('\n')
  const index = lineNumber - 1
  if (index < 0 || index >= lines.length) return null
  const nextLine = lines[index].replace(/^(\s*[-*]\s+\[)([ xX])(\]\s+.+)$/, `$1${done ? 'x' : ' '}$3`)
  if (nextLine === lines[index]) return null
  lines[index] = nextLine
  return lines.join('\n')
}

function taskStats(content: string): { done: number; total: number } {
  const matches = content.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)
  let done = 0
  let total = 0
  for (const match of matches) {
    total += 1
    if (match[1].toLowerCase() === 'x') done += 1
  }
  return { done, total }
}

function extractTasks(note: VaultNote): VaultTaskRow[] {
  const trashed = Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/')
  return note.content.split('\n').flatMap((line, index) => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/)
    if (!match) return []
    return [{
      id: `${note._id}:${index + 1}`,
      noteId: note._id,
      title: note.title || note._id,
      folder: note.folder,
      text: match[2].trim(),
      line: index + 1,
      done: match[1].toLowerCase() === 'x',
      tags: note.tags,
      updatedAt: note.updated_at,
      trashed,
    }]
  })
}

function dataRowSortValue(row: VaultDataRow, sortKey: VaultDataSortKey, formulaContext: VaultDataFormulaContext): string | number {
  if (sortKey === 'updated') return row.updatedAt
  if (sortKey === 'title') return row.title
  if (sortKey === 'folder') return row.folder || 'Vault root'
  if (sortKey === 'type') return row.type
  if (sortKey === 'tags') return row.tags.join(', ')
  if (sortKey === 'tasks') return row.tasksTotal ? row.tasksDone / row.tasksTotal : -1
  if (sortKey.startsWith('property:')) {
    const key = sortKey.slice('property:'.length)
    const value = row.properties[key]
    return Array.isArray(value) ? value.join(', ') : value ?? ''
  }
  if (sortKey.startsWith('formula:')) {
    return vaultDataFormulaValue(
      row,
      sortKey.slice('formula:'.length) as ActiveVaultDataFormulaKey,
      formulaContext.now ?? Date.now(),
      formulaContext.customFormula,
    )
  }
  return row.updatedAt
}

function taskRowSortValue(row: VaultTaskRow, sortKey: VaultTaskSortKey): string | number {
  if (sortKey === 'updated') return row.updatedAt
  if (sortKey === 'title') return row.title
  if (sortKey === 'folder') return row.folder || 'Vault root'
  if (sortKey === 'line') return row.line
  if (sortKey === 'done') return row.done ? 1 : 0
  return row.updatedAt
}

function compareDataValues(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function groupRows<T>(rows: T[], labelFor: (row: T) => string): Array<VaultDataGroup<T>> {
  const groups = new Map<string, VaultDataGroup<T>>()
  for (const row of rows) {
    const label = labelFor(row)
    const id = label.toLowerCase()
    const existing = groups.get(id)
    if (existing) {
      existing.rows.push(row)
    } else {
      groups.set(id, { id, label, rows: [row] })
    }
  }
  return [...groups.values()]
}

function dataGroupLabel(row: VaultDataRow, groupKey: VaultDataGroupKey, formulaContext: VaultDataFormulaContext): string {
  if (groupKey === 'folder') return row.folder || 'Vault root'
  if (groupKey === 'type') return row.type === 'attachment' ? 'Attachments' : 'Notes'
  if (groupKey === 'tags') return row.tags.length ? row.tags.map(tag => `#${tag}`).join(', ') : 'No tags'
  if (groupKey === 'done') {
    if (row.tasksTotal === 0) return 'No tasks'
    if (row.tasksDone === row.tasksTotal) return 'All tasks done'
    if (row.tasksDone === 0) return 'Open tasks'
    return 'Mixed tasks'
  }
  if (groupKey.startsWith('property:')) {
    const key = groupKey.slice('property:'.length)
    const value = row.properties[key]
    if (Array.isArray(value)) return value.length ? value.join(', ') : `No ${key}`
    return value || `No ${key}`
  }
  if (groupKey.startsWith('formula:')) {
    const formulaKey = groupKey.slice('formula:'.length) as ActiveVaultDataFormulaKey
    return formatVaultDataFormulaValue(row, formulaKey, formulaContext.now ?? Date.now(), formulaContext.customFormula)
  }
  return 'All rows'
}

function taskGroupLabel(row: VaultTaskRow, groupKey: VaultDataGroupKey): string {
  if (groupKey === 'folder') return row.folder || 'Vault root'
  if (groupKey === 'note') return row.title
  if (groupKey === 'done') return row.done ? 'Done' : 'Open'
  if (groupKey === 'tags') return row.tags.length ? row.tags.map(tag => `#${tag}`).join(', ') : 'No tags'
  return 'All tasks'
}

function normalizeVaultDataSortKey(value: unknown): VaultDataSortKey {
  if (typeof value !== 'string') return 'updated'
  if (DATA_SORT_KEYS.has(value) || value.startsWith('property:')) return value as VaultDataSortKey
  if (value.startsWith('formula:')) {
    const formulaKey = value.slice('formula:'.length)
    if (FORMULA_KEYS.has(formulaKey) && formulaKey !== 'none') return value as VaultDataSortKey
  }
  return 'updated'
}

function normalizeVaultTaskSortKey(value: unknown): VaultTaskSortKey {
  return typeof value === 'string' && TASK_SORT_KEYS.has(value) ? value as VaultTaskSortKey : 'done'
}

function normalizeVaultDataGroupKey(value: unknown): VaultDataGroupKey {
  if (typeof value !== 'string') return 'none'
  if (GROUP_KEYS.has(value) || value.startsWith('property:')) return value as VaultDataGroupKey
  if (value.startsWith('formula:')) {
    const formulaKey = value.slice('formula:'.length)
    if (FORMULA_KEYS.has(formulaKey) && formulaKey !== 'none') return value as VaultDataGroupKey
  }
  return 'none'
}

function normalizeVaultDataFormulaKey(value: unknown): VaultDataFormulaKey {
  return typeof value === 'string' && FORMULA_KEYS.has(value) ? value as VaultDataFormulaKey : 'none'
}

function normalizeVaultDataCustomFormula(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
}

export function vaultDataFormulaValue(
  row: VaultDataRow,
  formulaKey: ActiveVaultDataFormulaKey,
  now = Date.now(),
  customFormula = '',
): VaultDataFormulaValue {
  if (formulaKey === 'taskPercent') return row.tasksTotal ? Math.round((row.tasksDone / row.tasksTotal) * 100) : 0
  if (formulaKey === 'tagCount') return row.tags.length
  if (formulaKey === 'propertyCount') return Object.keys(row.properties).length
  if (formulaKey === 'pathDepth') return row.folder ? row.folder.split('/').filter(Boolean).length : 0
  if (formulaKey === 'staleDays') return Math.max(0, Math.floor((now - row.updatedAt) / 86_400_000))
  if (formulaKey === 'custom') return evaluateVaultDataCustomFormula(row, customFormula, now)
  return 0
}

export function vaultDataFormulaLabel(formulaKey: VaultDataFormulaKey): string {
  if (formulaKey === 'none') return 'Formula'
  if (formulaKey === 'custom') return 'Custom'
  return VAULT_DATA_FORMULAS.find(item => item.key === formulaKey)?.label ?? 'Formula'
}

export function formatVaultDataFormulaValue(
  row: VaultDataRow,
  formulaKey: ActiveVaultDataFormulaKey,
  now = Date.now(),
  customFormula = '',
): string {
  const value = vaultDataFormulaValue(row, formulaKey, now, customFormula)
  if (typeof value === 'string') return value || '-'
  if (formulaKey === 'taskPercent') return row.tasksTotal ? `${value}%` : 'No tasks'
  if (formulaKey === 'staleDays') return `${value}d`
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

export function evaluateVaultDataCustomFormula(row: VaultDataRow, formula: string, now = Date.now()): VaultDataFormulaValue {
  const tokens = tokenizeVaultDataFormula(formula)
  if (tokens.length === 0) return 0
  let index = 0

  const parseExpression = (): VaultDataFormulaValue => {
    let value = parseTerm()
    while (tokens[index]?.type === 'op' && (tokens[index].value === '+' || tokens[index].value === '-')) {
      const op = tokens[index].value
      index += 1
      const right = parseTerm()
      if (op === '+' && (typeof value === 'string' || typeof right === 'string')) {
        value = `${value}${right}`
      } else {
        value = op === '+' ? formulaNumber(value) + formulaNumber(right) : formulaNumber(value) - formulaNumber(right)
      }
    }
    return value
  }

  const parseTerm = (): VaultDataFormulaValue => {
    let value = parseFactor()
    while (tokens[index]?.type === 'op' && ['*', '/', '%'].includes(tokens[index].value)) {
      const op = tokens[index].value
      index += 1
      const right = parseFactor()
      const leftNumber = formulaNumber(value)
      const rightNumber = formulaNumber(right)
      if (op === '*') value = leftNumber * rightNumber
      if (op === '/') value = rightNumber === 0 ? 0 : leftNumber / rightNumber
      if (op === '%') value = rightNumber === 0 ? 0 : leftNumber % rightNumber
    }
    return value
  }

  const parseFactor = (): VaultDataFormulaValue => {
    const token = tokens[index]
    if (!token) return 0
    if (token.type === 'op' && token.value === '-') {
      index += 1
      return -formulaNumber(parseFactor())
    }
    if (token.type === 'op' && token.value === '+') {
      index += 1
      return parseFactor()
    }
    if (token.type === 'paren' && token.value === '(') {
      index += 1
      const value = parseExpression()
      if (tokens[index]?.type === 'paren' && tokens[index].value === ')') index += 1
      return value
    }
    index += 1
    if (token.type === 'number') return Number(token.value)
    if (token.type === 'string') return token.value
    if (token.type === 'identifier') {
      if (tokens[index]?.type === 'paren' && tokens[index].value === '(') {
        index += 1
        const args: VaultDataFormulaValue[] = []
        while (index < tokens.length && !(tokens[index]?.type === 'paren' && tokens[index].value === ')')) {
          args.push(parseExpression())
          if (tokens[index]?.type === 'comma') {
            index += 1
            continue
          }
          if (!(tokens[index]?.type === 'paren' && tokens[index].value === ')')) break
        }
        if (tokens[index]?.type === 'paren' && tokens[index].value === ')') index += 1
        return vaultDataFormulaFunctionValue(row, token.value, args, now)
      }
      return vaultDataFormulaIdentifierValue(row, token.value, now)
    }
    return 0
  }

  const value = parseExpression()
  return typeof value === 'string' || Number.isFinite(value) ? value : 0
}

export function validateVaultDataCustomFormula(formula: string, propertyKeys: string[] = []): VaultDataFormulaValidation {
  if (!formula.trim()) return { ok: false, message: 'Enter formula' }
  const tokens = tokenizeVaultDataFormula(formula)
  if (tokens.length === 0) return { ok: false, message: 'Enter formula' }

  const knownProperties = new Set(propertyKeys)
  const unknownFunctions = new Set<string>()
  const unknownFields = new Set<string>()
  let balance = 0
  let minBalance = 0

  tokens.forEach((token, index) => {
    if (token.type === 'paren') {
      balance += token.value === '(' ? 1 : -1
      minBalance = Math.min(minBalance, balance)
      return
    }
    if (token.type !== 'identifier') return
    const isFunction = tokens[index + 1]?.type === 'paren' && tokens[index + 1]?.value === '('
    if (isFunction) {
      if (!FORMULA_FUNCTION_KEYS.has(token.value)) unknownFunctions.add(token.value)
      return
    }
    if (!FORMULA_IDENTIFIER_KEYS.has(token.value) && !knownProperties.has(token.value)) {
      unknownFields.add(token.value)
    }
  })

  if (minBalance < 0 || balance !== 0) return { ok: false, message: 'Check parentheses' }
  if (unknownFunctions.size > 0) return { ok: false, message: `Unknown helper: ${[...unknownFunctions][0]}` }
  if (unknownFields.size > 0) return { ok: false, message: `Unknown field: ${[...unknownFields][0]}` }
  return { ok: true, message: 'Formula ok' }
}

type VaultDataFormulaToken =
  | { type: 'number'; value: string }
  | { type: 'string'; value: string }
  | { type: 'identifier'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: string }
  | { type: 'comma'; value: string }

function tokenizeVaultDataFormula(formula: string): VaultDataFormulaToken[] {
  const tokens: VaultDataFormulaToken[] = []
  let index = 0
  const source = formula.slice(0, 160)
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === '"' || char === "'") {
      const quote = char
      let value = ''
      index += 1
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\' && index + 1 < source.length) {
          value += source[index + 1]
          index += 2
        } else {
          value += source[index]
          index += 1
        }
      }
      if (source[index] === quote) index += 1
      tokens.push({ type: 'string', value })
      continue
    }
    const numberMatch = source.slice(index).match(/^\d+(?:\.\d+)?/)
    if (numberMatch) {
      tokens.push({ type: 'number', value: numberMatch[0] })
      index += numberMatch[0].length
      continue
    }
    const identifierMatch = source.slice(index).match(/^[A-Za-z_][\w.-]*/)
    if (identifierMatch) {
      tokens.push({ type: 'identifier', value: identifierMatch[0] })
      index += identifierMatch[0].length
      continue
    }
    if ('+-*/%'.includes(char)) {
      tokens.push({ type: 'op', value: char })
    } else if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char })
    } else if (char === ',') {
      tokens.push({ type: 'comma', value: char })
    }
    index += 1
  }
  return tokens
}

function vaultDataFormulaFunctionValue(
  row: VaultDataRow,
  name: string,
  args: VaultDataFormulaValue[],
  now: number,
): VaultDataFormulaValue {
  if (name === 'round') return Math.round(formulaNumber(args[0] ?? 0))
  if (name === 'floor') return Math.floor(formulaNumber(args[0] ?? 0))
  if (name === 'ceil') return Math.ceil(formulaNumber(args[0] ?? 0))
  if (name === 'abs') return Math.abs(formulaNumber(args[0] ?? 0))
  if (name === 'min') return Math.min(...(args.length ? args.map(formulaNumber) : [0]))
  if (name === 'max') return Math.max(...(args.length ? args.map(formulaNumber) : [0]))
  if (name === 'clamp') {
    const value = formulaNumber(args[0] ?? 0)
    const min = formulaNumber(args[1] ?? 0)
    const max = args.length > 2 ? formulaNumber(args[2]) : min
    return Math.min(max, Math.max(min, value))
  }
  if (name === 'prop') return vaultDataPropertyFormulaValue(row, formulaString(args[0] ?? ''))
  if (name === 'first') return formulaList(args[0] ?? '')[0] ?? ''
  if (name === 'count') return formulaList(args[0] ?? '').length
  if (name === 'lower') return formulaString(args[0] ?? '').toLowerCase()
  if (name === 'upper') return formulaString(args[0] ?? '').toUpperCase()
  if (name === 'concat') return args.map(formulaString).join('')
  if (name === 'contains') return formulaString(args[0] ?? '').includes(formulaString(args[1] ?? '')) ? 1 : 0
  if (name === 'listContains') return formulaList(args[0] ?? '').includes(formulaString(args[1] ?? '')) ? 1 : 0
  if (name === 'eq') return formulaString(args[0] ?? '') === formulaString(args[1] ?? '') ? 1 : 0
  if (name === 'gt') return formulaNumber(args[0] ?? 0) > formulaNumber(args[1] ?? 0) ? 1 : 0
  if (name === 'gte') return formulaNumber(args[0] ?? 0) >= formulaNumber(args[1] ?? 0) ? 1 : 0
  if (name === 'lt') return formulaNumber(args[0] ?? 0) < formulaNumber(args[1] ?? 0) ? 1 : 0
  if (name === 'lte') return formulaNumber(args[0] ?? 0) <= formulaNumber(args[1] ?? 0) ? 1 : 0
  if (name === 'if') return formulaNumber(args[0] ?? 0) !== 0 ? args[1] ?? 0 : args[2] ?? 0
  if (name === 'daysUntil') return formulaDaysBetween(now, formulaDateMs(args[0] ?? 0))
  if (name === 'daysSince') return formulaDaysBetween(formulaDateMs(args[0] ?? 0), now)
  if (name === 'formatDate') return formulaDateString(args[0] ?? '')
  return 0
}

function vaultDataFormulaIdentifierValue(row: VaultDataRow, identifier: string, now: number): number {
  if (identifier === 'tasksDone') return row.tasksDone
  if (identifier === 'tasksTotal') return row.tasksTotal
  if (identifier === 'taskPercent') return formulaNumber(vaultDataFormulaValue(row, 'taskPercent', now))
  if (identifier === 'tagCount') return row.tags.length
  if (identifier === 'propertyCount') return Object.keys(row.properties).length
  if (identifier === 'pathDepth') return row.folder ? row.folder.split('/').filter(Boolean).length : 0
  if (identifier === 'staleDays') return formulaNumber(vaultDataFormulaValue(row, 'staleDays', now))
  if (identifier === 'updatedAt') return row.updatedAt

  const value = row.properties[identifier]
  const raw = Array.isArray(value) ? value[0] : value
  const numeric = Number(String(raw ?? '').replace(/,/g, '').trim())
  return Number.isFinite(numeric) ? numeric : 0
}

function vaultDataPropertyFormulaValue(row: VaultDataRow, key: string): string {
  const value = row.properties[key]
  if (Array.isArray(value)) return value.join(', ')
  return value ?? ''
}

function formulaNumber(value: VaultDataFormulaValue): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const numeric = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(numeric) ? numeric : 0
}

function formulaString(value: VaultDataFormulaValue): string {
  return typeof value === 'string' ? value : String(value)
}

function formulaList(value: VaultDataFormulaValue): string[] {
  const raw = formulaString(value).trim()
  if (!raw) return []
  return raw.split(',').map(item => item.trim()).filter(Boolean)
}

function formulaDateMs(value: VaultDataFormulaValue): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formulaDaysBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0
  const dayMs = 86_400_000
  return Math.floor((startOfUtcDay(endMs) - startOfUtcDay(startMs)) / dayMs)
}

function formulaDateString(value: VaultDataFormulaValue): string {
  const ms = formulaDateMs(value)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function startOfUtcDay(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}
