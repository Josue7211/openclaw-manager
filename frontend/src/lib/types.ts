// Shared interfaces used across multiple pages/components.
// Each type is the superset of all local definitions — fields that don't
// appear in every source are marked optional.

export interface Todo {
  id: string
  text: string
  done: boolean
  created_at?: string
  createdAt?: string
  due_date?: string | null
}

export interface Mission {
  id: string
  title: string
  status: string
  assignee?: string
  progress?: number
  created_at?: string
  createdAt?: string
  updated_at?: string
  log_path?: string | null
  complexity?: number | null
  task_type?: string | null
  review_status?: string | null
  review_notes?: string | null
  retry_count?: number
  routed_agent?: string | null
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay: boolean
  calendar: string
}

export interface EmailMessage {
  id: string
  from: string
  subject: string
  date: string
  read: boolean
  preview?: string
  folder?: string
}

export interface Reminder {
  id: string
  title: string
  completed: boolean
  dueDate?: string | null
  priority?: number
  notes?: string | null
  list: string
}

export interface KnowledgeEntry {
  id: string
  title: string
  content?: string
  tags: string[]
}

export interface NoteSearchResult {
  id: string
  path: string
  snippet?: string
}

/** Aggregated search results returned by /api/search */
export interface SearchResults {
  todos: Todo[]
  missions: Mission[]
  events: CalendarEvent[]
  emails: EmailMessage[]
  reminders: Reminder[]
  knowledge: KnowledgeEntry[]
  notes: NoteSearchResult[]
}

export interface FlatSearchResult {
  id: string
  label: string
  sub: string
  href: string
  icon: React.ElementType
}
