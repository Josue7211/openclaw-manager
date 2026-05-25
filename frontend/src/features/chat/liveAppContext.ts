import type { ChatExecutionContext } from './types'

type ChatRequestContext = ChatExecutionContext

interface LiveAppContextOptions {
  requestText: string
  route?: string
  pageTitle?: string
  context?: ChatRequestContext
  timeoutMs?: number
  apiPost?: ApiPost
}

type ApiGet = <T = unknown>(path: string) => Promise<T>
type ApiPost = <T = unknown>(path: string, body?: unknown) => Promise<T>

interface LiveAppContextFetch {
  key: string
  data: unknown
  summary: string
}

interface LiveStateRecord {
  sourceApp: string
  module: string
  scope: string
  visibility: 'private' | 'workspace' | 'public'
  privacy: 'metadata' | 'redacted' | 'approved' | 'aggregate' | 'public'
  approved: boolean
  agentsecretsApproved: boolean
  freshnessSecs: number
  labels: string[]
  summary: string
  payload: unknown
}

const CORE_LIVE_ENDPOINTS = [
  { key: 'calendar', path: '/api/calendar' },
  { key: 'todos', path: '/api/todos' },
  { key: 'reminders', path: '/api/reminders' },
  { key: 'missions', path: '/api/missions' },
  { key: 'email', path: '/api/email?folder=INBOX&limit=10' },
  { key: 'messages', path: '/api/messages?limit=10' },
] as const

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object').map(item => item as Record<string, unknown>)
    : []
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function boolValue(value: unknown): boolean {
  return value === true
}

function compactLine(value: string, max = 140): string {
  const single = value.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 3).trim()}...` : single
}

function summarizeDate(value: unknown): string {
  const raw = textValue(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toISOString()
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<undefined>(resolve => {
    timeout = setTimeout(() => resolve(undefined), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function endpointStatus(key: string, data: unknown): string {
  const record = asRecord(data)
  const error = textValue(record.error)
  if (error) return `${key}: unavailable (${compactLine(error, 80)})`
  return `${key}: unavailable`
}

function summarizeCalendar(data: unknown): string {
  const record = asRecord(data)
  const events = asArray(record.events)
    .map(event => ({
      title: compactLine(textValue(event.title) || 'Untitled event', 80),
      start: summarizeDate(event.start),
      end: summarizeDate(event.end),
      calendar: compactLine(textValue(event.calendar), 48),
      allDay: boolValue(event.allDay),
    }))
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(0, 8)

  if (events.length === 0) return 'calendar: loaded; upcoming_events=0'

  return [
    `calendar: loaded; source=${textValue(record.source) || 'unknown'}; upcoming_events=${events.length}`,
    ...events.map(
      event =>
        `- ${event.title} | ${event.start || 'unknown start'}${event.end ? ` to ${event.end}` : ''}${event.calendar ? ` | ${event.calendar}` : ''}${event.allDay ? ' | all-day' : ''}`,
    ),
  ].join('\n')
}

function summarizeTodos(data: unknown): string {
  const todos = asArray(asRecord(data).todos)
  const open = todos.filter(todo => !boolValue(todo.done) && !boolValue(todo.completed)).slice(0, 8)
  if (open.length === 0) return `todos: loaded; open=0 total=${todos.length}`
  return [
    `todos: loaded; open=${open.length} total=${todos.length}`,
    ...open.map(todo => {
      const title = compactLine(textValue(todo.text) || textValue(todo.title) || 'Untitled todo', 90)
      const due = textValue(todo.due_date) || textValue(todo.dueDate)
      return `- ${title}${due ? ` | due ${due}` : ''}`
    }),
  ].join('\n')
}

function summarizeReminders(data: unknown): string {
  const reminders = asArray(asRecord(data).reminders)
  const open = reminders.filter(reminder => !boolValue(reminder.completed)).slice(0, 8)
  if (open.length === 0) return `reminders: loaded; open=0 total=${reminders.length}`
  return [
    `reminders: loaded; open=${open.length} total=${reminders.length}`,
    ...open.map(reminder => {
      const title = compactLine(textValue(reminder.title) || textValue(reminder.text) || 'Untitled reminder', 90)
      const due = textValue(reminder.due_date) || textValue(reminder.dueDate)
      return `- ${title}${due ? ` | due ${due}` : ''}`
    }),
  ].join('\n')
}

function summarizeMissions(data: unknown): string {
  const missions = asArray(asRecord(data).missions).slice(0, 8)
  if (missions.length === 0) return 'missions: loaded; count=0'
  return [
    `missions: loaded; count=${missions.length}`,
    ...missions.map(mission => {
      const title = compactLine(textValue(mission.title) || textValue(mission.name) || 'Untitled mission', 90)
      const status = textValue(mission.status)
      return `- ${title}${status ? ` | ${status}` : ''}`
    }),
  ].join('\n')
}

function summarizeEmail(data: unknown): string {
  const emails = asArray(asRecord(data).emails).slice(0, 8)
  if (emails.length === 0) return 'email: loaded; inbox_items=0'
  return [
    `email: loaded; inbox_items=${emails.length}`,
    ...emails.map(email => {
      const from = compactLine(textValue(email.from) || textValue(email.sender) || 'unknown sender', 56)
      const subject = compactLine(textValue(email.subject) || 'No subject', 90)
      const unread = boolValue(email.read) ? '' : ' | unread'
      return `- ${from}: ${subject}${unread}`
    }),
  ].join('\n')
}

function summarizeMessages(data: unknown): string {
  const conversations = asArray(asRecord(data).conversations).slice(0, 8)
  if (conversations.length === 0) return 'messages: loaded; conversations=0'
  return [
    `messages: loaded; conversations=${conversations.length}`,
    ...conversations.map(conversation => {
      const name = compactLine(
        textValue(conversation.displayName) ||
          textValue(conversation.name) ||
          textValue(conversation.chatIdentifier) ||
          'Unknown conversation',
        70,
      )
      const unread = Number(conversation.unreadCount ?? conversation.unread_count ?? 0)
      return `- ${name}${unread > 0 ? ` | unread ${unread}` : ''}`
    }),
  ].join('\n')
}

function summarizeEndpoint(key: string, data: unknown): string {
  if (data === undefined) return `${key}: not loaded before send timeout`
  switch (key) {
    case 'calendar':
      return summarizeCalendar(data)
    case 'todos':
      return summarizeTodos(data)
    case 'reminders':
      return summarizeReminders(data)
    case 'missions':
      return summarizeMissions(data)
    case 'email':
      return summarizeEmail(data)
    case 'messages':
      return summarizeMessages(data)
    default:
      return endpointStatus(key, data)
  }
}

function isSensitiveModule(key: string): boolean {
  return key === 'messages' || key === 'email'
}

function liveStatePayload(key: string, data: unknown, summary: string): unknown {
  if (isSensitiveModule(key)) {
    return { summary }
  }
  return data ?? { summary }
}

function buildLiveStateRecords(fetched: LiveAppContextFetch[], freshnessSecs: number): LiveStateRecord[] {
  return fetched.map(item => {
    const sensitive = isSensitiveModule(item.key)
    return {
      sourceApp: 'clawctrl',
      module: item.key,
      scope: 'current',
      visibility: 'private',
      privacy: sensitive ? 'metadata' : 'approved',
      approved: !sensitive,
      agentsecretsApproved: false,
      freshnessSecs,
      labels: ['live-app-state', item.key],
      summary: item.summary,
      payload: liveStatePayload(item.key, item.data, item.summary),
    }
  })
}

async function persistLiveState(apiPost: ApiPost | undefined, records: LiveStateRecord[]): Promise<void> {
  if (!apiPost || records.length === 0) return
  await apiPost('/api/memd/live-state', { records })
}

export async function buildLiveAppContext(apiGet: ApiGet, options: LiveAppContextOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 1500
  const fetched = await Promise.all(
    CORE_LIVE_ENDPOINTS.map(async endpoint => {
      try {
        const data = await withTimeout(apiGet(endpoint.path), timeoutMs)
        return { key: endpoint.key, data, summary: summarizeEndpoint(endpoint.key, data) }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'request failed'
        return {
          key: endpoint.key,
          data: undefined,
          summary: `${endpoint.key}: unavailable (${compactLine(message, 80)})`,
        }
      }
    }),
  )
  const freshnessSecs = Math.max(60, Math.ceil((timeoutMs / 1000) * 60))
  await persistLiveState(options.apiPost, buildLiveStateRecords(fetched, freshnessSecs)).catch(err => {
    console.warn('Failed to persist memd live app state:', err)
  })

  const context = options.context ?? {}
  return [
    `captured_at: ${new Date().toISOString()}`,
    `route: ${options.route || 'unknown'}`,
    `page_title: ${options.pageTitle || 'unknown'}`,
    `project_id: ${context.projectId || 'unknown'}`,
    `project: ${context.project || 'unknown'}`,
    `project_root: ${context.projectRoot || 'unknown'}`,
    `working_dir: ${context.workingDir || 'unknown'}`,
    `environment_id: ${context.environmentId || 'unknown'}`,
    `branch: ${context.branch || 'unknown'}`,
    `runtime: ${context.runtime || 'unknown'}`,
    `user_request: ${compactLine(options.requestText, 240)}`,
    '',
    ...fetched.map(item => item.summary),
  ].join('\n')
}
