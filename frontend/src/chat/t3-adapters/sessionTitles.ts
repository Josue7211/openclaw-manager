/*
 * Copied/adapted from T3 Code's thread title repair boundary.
 * ClawControl keeps title heuristics here so Chat.tsx only decides when to
 * apply a repaired project-scoped chat label.
 */

const DEFAULT_SESSION_LABEL_RE = /^(untitled(?: chat)?|new chat|main session)$/i
const DIRECTIVE_ONLY_RE = /^(reply|respond|say|output|return)\s+(with\s+)?exactly\b/i
const NOTHING_ELSE_RE = /\band nothing else\b/i
const GREETING_ONLY_RE = /^(hi|h+i+|hello|helo|hey|yo|sup|test|testing|ping|thanks?|thank you)$/i
const LOW_SIGNAL_START_RE = /^(that'?s|this is|it'?s|i meant|you'?re right|ok|okay)\b/i

export function sanitizeTitleSource(value: string): string {
  return value
    .replace(/\[Attached image:[^\]]+\]/gi, ' ')
    .replace(/```(?:json|tsx?|jsx?|html|css|bash|sh)?\s*([\s\S]*?)```/gi, ' $1 ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/["{}[\],]/g, ' ')
    .replace(/[#*_>~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDirectiveOnlyText(value: string): boolean {
  const text = sanitizeTitleSource(value)
  if (!text || text.startsWith('/')) return true
  if (DIRECTIVE_ONLY_RE.test(text)) return true
  if (NOTHING_ELSE_RE.test(text) && text.split(/\s+/).length <= 12) return true
  if (/^(compat ok|session ok|ok)$/i.test(text)) return true
  if (GREETING_ONLY_RE.test(text)) return true
  return false
}

export function isRepairableSessionLabel(label: string | null | undefined): boolean {
  const value = String(label ?? '').trim()
  const words = sanitizeTitleSource(value).split(/\s+/).filter(Boolean)
  return !value
    || DEFAULT_SESSION_LABEL_RE.test(value)
    || isDirectiveOnlyText(value)
    || (words.length === 1 && words[0].length < 6)
}

function compactTitle(value: string): string | null {
  const raw = sanitizeTitleSource(value)
  if (isDirectiveOnlyText(raw)) return null
  if (LOW_SIGNAL_START_RE.test(raw) && raw.split(/\s+/).length < 8) return null
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 10)
  let title = words.join(' ').replace(/[.,;:!?-]+$/g, '').trim()
  if (title.length > 64) title = `${title.slice(0, 61).trim()}...`
  if (title.length < 3) return null
  return title
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function deriveTopicTitle(messages: Array<{ role?: string; text?: string; content?: string }>): string | null {
  const meaningful = messages
    .map((message) => sanitizeTitleSource(String(message.text ?? message.content ?? '')))
    .filter((text) => text && !isDirectiveOnlyText(text))

  if (meaningful.length === 0) return null

  const joined = meaningful.join(' ').toLowerCase()
  const subject = /\b(weather|forecast|temperature|\d+\s?f)\b/.test(joined)
    ? 'weather'
    : /\b(calendar|schedule|event)\b/.test(joined)
      ? 'calendar'
      : /\b(email|mail|inbox)\b/.test(joined)
        ? 'email'
        : /\b(todo|task|reminder)\b/.test(joined)
          ? 'task'
          : null

  if (/\bdashboard\b/.test(joined) && /\b(whole page|full page|page)\b/.test(joined)) {
    return subject ? `${titleCase(subject)} dashboard page` : 'Dashboard page request'
  }
  if (/\bdashboard\b/.test(joined) && /\bwidget\b/.test(joined)) {
    return subject ? `${titleCase(subject)} dashboard widget` : 'Dashboard widget request'
  }
  if (/\bmodule\b/.test(joined)) {
    return subject ? `${titleCase(subject)} module` : 'Module request'
  }

  return null
}

export function deriveSessionTitle(messages: Array<{ role?: string; text?: string; content?: string }>): string | null {
  const topicTitle = deriveTopicTitle(messages)
  if (topicTitle) return topicTitle

  const userTitle = messages
    .filter((message) => message.role === 'user')
    .map((message) => compactTitle(String(message.text ?? message.content ?? '')))
    .find((title): title is string => Boolean(title))

  if (userTitle) return userTitle

  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => compactTitle(String(message.text ?? message.content ?? '')))
    .find((title): title is string => Boolean(title)) ?? null
}
