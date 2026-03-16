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

export interface ModelOption {
  id: string
  name: string
  provider: string
  local: boolean
  contextWindow?: number
}

export interface ModelsResponse {
  models: ModelOption[]
  currentModel: string
}

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
