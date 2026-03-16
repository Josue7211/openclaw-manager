export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  images?: string[]
}

export type MsgStatus = 'sending' | 'sent' | 'permanent' | 'error'

export interface OptimisticMsg {
  id: string
  text: string
  status: MsgStatus
  images?: string[]
}

export const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const

/** Strip [timestamp] prefix and [[reply_to]] tags from message text */
export function cleanText(text: string): string {
  return text
    .replace(/^\[.*?\]\s+/, '')              // leading [Fri, 03/13/2026, ...] prefix
    .replace(/\[\[\s*reply_to_current\s*\]\]\s*/g, '')
    .replace(/\[\[\s*reply_to\s*:\s*[^\]]*\]\]\s*/g, '')
    .trim()
}

export function cleanMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(m => ({ ...m, text: cleanText(m.text) }))
}

export const SLASH_CMDS = ['/new', '/reset']
export const isSlashCommand = (t: string) => SLASH_CMDS.includes(t.toLowerCase())
