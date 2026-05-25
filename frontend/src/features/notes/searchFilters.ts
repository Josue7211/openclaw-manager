import type { VaultNote } from './types'

type SearchFilter = {
  key: string
  value: string
  negated?: boolean
}

interface ParsedSearch {
  text: string
  filters: SearchFilter[]
}

interface SearchToken {
  value: string
  quoted: boolean
}

type SearchExpression =
  | { type: 'atom'; token: SearchToken }
  | { type: 'not'; expression: SearchExpression }
  | { type: 'and' | 'or'; left: SearchExpression; right: SearchExpression }

const FILTER_KEYS = new Set([
  'after',
  'before',
  'block',
  'content',
  'deleted',
  'file',
  'folder',
  'has',
  'kind',
  'line',
  'path',
  'prop',
  'property',
  'section',
  'tag',
  'task',
  'text',
  'title',
  'trash',
  'type',
  'updated-after',
  'updated-before',
])

export function parseNoteSearchQuery(query: string): ParsedSearch {
  return parseSearchTokens(tokenizeSearchQuery(query))
}

export function noteSearchText(query: string): string {
  if (requiresLocalBooleanEvaluation(query)) return ''
  return parseNoteSearchQuery(query).text
}

export function matchesNoteSearch(note: VaultNote, query: string): boolean {
  const expression = requiresLocalBooleanEvaluation(query) ? parseSearchExpression(query) : null
  if (expression) return evaluateSearchExpression(note, expression)
  return matchesParsedNoteSearch(note, parseNoteSearchQuery(query))
}

export function matchesNoteSearchFilters(note: VaultNote, query: string): boolean {
  const expression = requiresLocalBooleanEvaluation(query) ? parseSearchExpression(query) : null
  if (expression) {
    return evaluateSearchExpression(note, expression, true)
  }
  const parsed = parseNoteSearchQuery(query)
  return parsed.filters.every(filter => matchesFilter(note, filter))
}

export function searchHighlightTerms(query: string): string[] {
  const terms: string[] = []
  const expression = parseSearchExpression(query)
  if (expression) collectSearchHighlightTerms(expression, false, terms)
  return [...new Set(terms.map(term => term.toLowerCase()))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
}

export function noteSearchRank(note: VaultNote, query: string): number {
  const terms = searchHighlightTerms(query)
  if (terms.length === 0) return 0
  let score = 0
  const title = note.title.toLowerCase()
  const folder = note.folder.toLowerCase()
  const id = note._id.toLowerCase()
  const content = note.content.toLowerCase()
  const aliases = note.aliases?.map(alias => alias.toLowerCase()) ?? []
  const tags = note.tags.map(tag => tag.toLowerCase())
  const properties = propertyText(note)

  for (const term of terms) {
    const tagTerm = term.replace(/^#/, '')
    if (title === term) score += 120
    else if (title.startsWith(term)) score += 95
    else if (title.includes(term)) score += 80
    if (aliases.some(alias => alias === term)) score += 85
    else if (aliases.some(alias => alias.includes(term))) score += 70
    if (tags.some(tag => tag === tagTerm)) score += 75
    else if (tags.some(tag => tag.includes(tagTerm))) score += 55
    if (folder.includes(term) || id.includes(term)) score += 35
    if (properties.includes(term)) score += 30
    if (content.includes(term)) score += 15
  }
  return score
}

export function noteSearchMatchSummary(note: VaultNote, query: string): string {
  const terms = searchHighlightTerms(query)
  if (terms.length === 0) return ''
  const title = note.title.toLowerCase()
  const aliases = note.aliases ?? []
  const tags = note.tags
  const folder = note.folder
  const properties = propertyText(note)

  for (const term of terms) {
    const tagTerm = term.replace(/^#/, '')
    if (title.includes(term)) continue
    const alias = aliases.find(value => value.toLowerCase().includes(term))
    if (alias) return `alias: ${alias}`
    const tag = tags.find(value => value.toLowerCase().includes(tagTerm))
    if (tag) return `#${tag}`
    if (folder.toLowerCase().includes(term) || note._id.toLowerCase().includes(term)) return 'path'
    if (properties.includes(term)) return `prop: ${term}`
    const snippet = contentSnippet(note.content, term)
    if (snippet) return snippet
  }
  return ''
}

function matchesParsedNoteSearch(note: VaultNote, parsed: ParsedSearch): boolean {
  const text = parsed.text.toLowerCase()
  if (text && !matchesFreeText(note, text)) return false
  return parsed.filters.every(filter => matchesFilter(note, filter))
}

function matchesFreeText(note: VaultNote, text: string): boolean {
  const tagText = text.replace(/^#/, '')
  return (
    note.title.toLowerCase().includes(text) ||
    note.aliases?.some(alias => alias.toLowerCase().includes(text)) === true ||
    note.content.toLowerCase().includes(text) ||
    note.folder.toLowerCase().includes(text) ||
    note.tags.some(tag => tag.toLowerCase().includes(tagText)) ||
    propertyText(note).includes(text)
  )
}

function matchesFilter(note: VaultNote, filter: SearchFilter): boolean {
  const value = filter.value.toLowerCase().replace(/^#/, '')
  let matches = true
  switch (filter.key) {
    case 'tag':
      matches = note.tags.some(tag => tag.toLowerCase().includes(value))
      break
    case 'path':
    case 'folder':
      matches = note._id.toLowerCase().includes(value) || note.folder.toLowerCase().includes(value)
      break
    case 'content':
    case 'line':
      matches = note.content.toLowerCase().includes(value)
      break
    case 'text':
      matches = matchesFreeText(note, value)
      break
    case 'title':
    case 'file':
      matches = (
        note.title.toLowerCase().includes(value) ||
        note.aliases?.some(alias => alias.toLowerCase().includes(value)) === true
      )
      break
    case 'section':
      matches = matchesSection(note, value)
      break
    case 'block':
      matches = matchesBlockReference(note, value)
      break
    case 'prop':
    case 'property':
      matches = matchesProperty(note, filter.value)
      break
    case 'has':
      matches = matchesHas(note, value)
      break
    case 'task':
      matches = matchesTask(note, value)
      break
    case 'type':
    case 'kind':
      matches = note.type === value || (value === 'image' && note.type === 'attachment')
      break
    case 'trash':
    case 'deleted':
      matches = matchesBoolean(isTrashed(note), value)
      break
    case 'before':
    case 'updated-before':
      matches = matchesDate(note.updated_at, filter.value, (updated, target) => updated <= target)
      break
    case 'after':
    case 'updated-after':
      matches = matchesDate(note.updated_at, filter.value, (updated, target) => updated >= target)
      break
    default:
      matches = true
  }
  return filter.negated ? !matches : matches
}

function tokenizeSearchQuery(query: string): SearchToken[] {
  const tokens: SearchToken[] = []
  let current = ''
  let quoted = false
  let tokenQuoted = false
  for (const char of query) {
    if (char === '"') {
      quoted = !quoted
      tokenQuoted = true
      continue
    }
    if (/\s/.test(char) && !quoted) {
      if (current.trim()) tokens.push({ value: current.trim(), quoted: tokenQuoted })
      current = ''
      tokenQuoted = false
      continue
    }
    current += char
  }
  if (current.trim()) tokens.push({ value: current.trim(), quoted: tokenQuoted })
  return tokens
}

function tokenizeBooleanSearchQuery(query: string): SearchToken[] {
  const tokens: SearchToken[] = []
  let current = ''
  let quoted = false
  let tokenQuoted = false

  const flush = () => {
    if (!current.trim()) return
    tokens.push({ value: current.trim(), quoted: tokenQuoted })
    current = ''
    tokenQuoted = false
  }

  for (const char of query) {
    if (char === '"') {
      quoted = !quoted
      tokenQuoted = true
      continue
    }
    if (!quoted && (char === '(' || char === ')')) {
      flush()
      tokens.push({ value: char, quoted: false })
      continue
    }
    if (/\s/.test(char) && !quoted) {
      flush()
      continue
    }
    current += char
  }
  flush()
  return tokens
}

function parseSearchExpression(query: string): SearchExpression | null {
  const tokens = tokenizeBooleanSearchQuery(query)
  if (tokens.length === 0) return null
  let index = 0

  const peek = () => tokens[index]
  const consume = () => tokens[index++]
  const isOperator = (token: SearchToken | undefined, value: string) =>
    !!token && !token.quoted && token.value.toLowerCase() === value

  const parseOr = (): SearchExpression | null => {
    let left = parseAnd()
    if (!left) return null
    while (isOperator(peek(), 'or')) {
      consume()
      const right = parseAnd()
      if (!right) break
      left = { type: 'or', left, right }
    }
    return left
  }

  const parseAnd = (): SearchExpression | null => {
    let left = parseUnary()
    if (!left) return null
    while (true) {
      const next = peek()
      if (!next || next.value === ')' || isOperator(next, 'or')) break
      if (isOperator(next, 'and')) consume()
      const right = parseUnary()
      if (!right) break
      left = { type: 'and', left, right }
    }
    return left
  }

  const parseUnary = (): SearchExpression | null => {
    if (isOperator(peek(), 'not')) {
      consume()
      const expression = parseUnary()
      return expression ? { type: 'not', expression } : null
    }
    return parsePrimary()
  }

  const parsePrimary = (): SearchExpression | null => {
    const token = peek()
    if (!token) return null
    if (!token.quoted && token.value === '(') {
      consume()
      const expression = parseOr()
      if (peek()?.value === ')') consume()
      return expression
    }
    if (!token.quoted && token.value === ')') return null
    consume()
    return { type: 'atom', token }
  }

  const expression = parseOr()
  return expression
}

function evaluateSearchExpression(note: VaultNote, expression: SearchExpression, filtersOnly = false): boolean {
  switch (expression.type) {
    case 'atom':
      return matchesSearchAtom(note, expression.token, filtersOnly)
    case 'not':
      return !evaluateSearchExpression(note, expression.expression, filtersOnly)
    case 'and':
      return evaluateSearchExpression(note, expression.left, filtersOnly) && evaluateSearchExpression(note, expression.right, filtersOnly)
    case 'or':
      return evaluateSearchExpression(note, expression.left, filtersOnly) || evaluateSearchExpression(note, expression.right, filtersOnly)
  }
}

function matchesSearchAtom(note: VaultNote, token: SearchToken, filtersOnly: boolean): boolean {
  if (!token.quoted && (token.value.toLowerCase() === 'and' || token.value.toLowerCase() === 'or')) return true
  const parsed = parseSearchTokens([token])
  if (filtersOnly && parsed.filters.length === 0) return true
  return matchesParsedNoteSearch(note, parsed)
}

function collectSearchHighlightTerms(expression: SearchExpression, negated: boolean, terms: string[]) {
  switch (expression.type) {
    case 'atom': {
      if (negated) return
      const term = searchTokenHighlightValue(expression.token)
      if (term) terms.push(term)
      return
    }
    case 'not':
      collectSearchHighlightTerms(expression.expression, !negated, terms)
      return
    case 'and':
    case 'or':
      collectSearchHighlightTerms(expression.left, negated, terms)
      collectSearchHighlightTerms(expression.right, negated, terms)
      return
  }
}

function parseSearchTokens(tokens: SearchToken[]): ParsedSearch {
  const filters: SearchFilter[] = []
  const textParts: string[] = []
  let negateNext = false

  for (const rawToken of tokens) {
    let token = rawToken.value.trim()
    if (!rawToken.quoted && token.toLowerCase() === 'and') continue
    if (!rawToken.quoted && token.toLowerCase() === 'not') {
      negateNext = true
      continue
    }

    const prefixedNegation = token.startsWith('-') && token.length > 1
    const negated = negateNext || prefixedNegation
    negateNext = false
    if (prefixedNegation) token = token.slice(1)
    const colon = token.indexOf(':')
    if (colon > 0) {
      const key = normalizeFilterKey(token.slice(0, colon).toLowerCase())
      const value = token.slice(colon + 1).trim()
      if (FILTER_KEYS.has(key) && value) {
        filters.push(negated ? { key, value, negated: true } : { key, value })
        continue
      }
    }
    if (token) {
      if (negated) filters.push({ key: 'text', value: token, negated: true })
      else textParts.push(token)
    }
  }

  return { text: textParts.join(' ').trim(), filters }
}

function searchTokenHighlightValue(token: SearchToken): string {
  let value = token.value.trim()
  if (!value) return ''
  const colon = value.indexOf(':')
  if (colon > 0) {
    const key = normalizeFilterKey(value.slice(0, colon).toLowerCase())
    const rawValue = value.slice(colon + 1).trim()
    if (!FILTER_KEYS.has(key) || !rawValue) return ''
    if (key === 'has' || key === 'trash' || key === 'deleted' || key === 'before' || key === 'after' || key === 'updated-before' || key === 'updated-after') return ''
    value = rawValue.includes('=') ? rawValue.split('=').pop() || '' : rawValue
  }
  return value.replace(/^#/, '').toLowerCase()
}

function contentSnippet(content: string, term: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const lower = normalized.toLowerCase()
  const index = lower.indexOf(term)
  if (index === -1) return ''
  const start = Math.max(0, index - 18)
  const end = Math.min(normalized.length, index + term.length + 24)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < normalized.length ? '...' : ''
  return `${prefix}${normalized.slice(start, end)}${suffix}`
}

function requiresLocalBooleanEvaluation(query: string): boolean {
  const tokens = tokenizeBooleanSearchQuery(query)
  return tokens.some(token => !token.quoted && (token.value === '(' || token.value === ')' || token.value.toLowerCase() === 'or'))
}

function normalizeFilterKey(key: string): string {
  if (key === 'file') return 'title'
  if (key === 'alias') return 'title'
  return key
}

function propertyText(note: VaultNote): string {
  return Object.entries(note.properties ?? {})
    .flatMap(([key, raw]) => [key, ...(Array.isArray(raw) ? raw : [raw])])
    .join(' ')
    .toLowerCase()
}

function matchesProperty(note: VaultNote, rawValue: string): boolean {
  const [rawKey, ...rawNeedleParts] = rawValue.split('=')
  const key = rawKey.trim().toLowerCase()
  const needle = rawNeedleParts.join('=').trim().toLowerCase()
  if (!key) return true

  for (const [propKey, raw] of Object.entries(note.properties ?? {})) {
    if (!propKey.toLowerCase().includes(key)) continue
    if (!needle) return true
    const values = Array.isArray(raw) ? raw : [raw]
    if (values.some(value => value.toLowerCase().includes(needle))) return true
  }
  return false
}

function matchesHas(note: VaultNote, value: string): boolean {
  if (value === 'tag' || value === 'tags') return note.tags.length > 0
  if (value === 'alias' || value === 'aliases') return (note.aliases?.length ?? 0) > 0
  if (value === 'link' || value === 'links') return note.links.length > 0
  if (value === 'property' || value === 'properties' || value === 'prop') return Object.keys(note.properties ?? {}).length > 0
  if (value === 'task' || value === 'tasks') return taskLines(note).length > 0
  if (value === 'attachment') return note.type === 'attachment'
  return Object.prototype.hasOwnProperty.call(note.properties ?? {}, value)
}

function matchesTask(note: VaultNote, value: string): boolean {
  const tasks = taskLines(note)
  if (value === 'done' || value === 'checked' || value === 'complete') return tasks.some(line => /^-\s*\[[xX]\]/.test(line))
  if (value === 'todo' || value === 'open' || value === 'unchecked') return tasks.some(line => /^-\s*\[\s\]/.test(line))
  return tasks.some(line => line.toLowerCase().includes(value))
}

function matchesSection(note: VaultNote, value: string): boolean {
  return note.content
    .split('\n')
    .some(line => /^#{1,6}\s+/.test(line) && line.replace(/^#{1,6}\s+/, '').toLowerCase().includes(value))
}

function matchesBlockReference(note: VaultNote, value: string): boolean {
  const normalized = value.replace(/^\^/, '')
  return new RegExp(`\\^${escapeRegExp(normalized)}\\b`).test(note.content)
}

function taskLines(note: VaultNote): string[] {
  return note.content.split('\n').filter(line => /^-\s*\[[ xX]\]/.test(line))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isTrashed(note: VaultNote): boolean {
  return Boolean(note.trashed_at) || note.folder === 'Trash' || note.folder.startsWith('Trash/')
}

function matchesBoolean(actual: boolean, value: string): boolean {
  if (['1', 'true', 'yes', 'y'].includes(value)) return actual
  if (['0', 'false', 'no', 'n'].includes(value)) return !actual
  return actual
}

function matchesDate(updatedAt: number, value: string, compare: (updated: number, target: number) => boolean): boolean {
  const target = Date.parse(value)
  if (!Number.isFinite(target)) return true
  return compare(updatedAt, target)
}
