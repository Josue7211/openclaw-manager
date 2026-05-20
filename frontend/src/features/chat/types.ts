export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  timestamp: string
  images?: string[]
  localOnly?: boolean
  transcriptId?: string
  turnId?: string
  toolCallId?: string
  toolName?: string
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
  provider?: string
  local?: boolean
  contextWindow?: number
}

export type ChatProviderId = 'hermes' | 'claudeAgent' | 'codex-cli' | (string & {})

export interface ChatProviderOption {
  id: ChatProviderId
  name: string
  description: string
  local: boolean
  modelBacked: boolean
  available?: boolean
}

export interface ChatProviderWireOption {
  id: string
  name?: string
  description?: string
  local?: boolean
  modelBacked?: boolean
  ready?: boolean
  selectable?: boolean
  detail?: string
}

export interface ModelsResponse {
  models: ModelOption[]
  currentModel: string
  agentLabel?: string
  providers?: ChatProviderWireOption[]
}

export function cleanText(text: string): string {
  return text
    .replace(/^\[.*?\]\s+/, '')
    .replace(/\[\[\s*reply_to_current\s*\]\]\s*/g, '')
    .replace(/\[\[\s*reply_to\s*:\s*[^\]]*\]\]\s*/g, '')
    .trim()
}

export function cleanMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(m => ({ ...m, text: cleanText(m.text) }))
}

export const SLASH_CMDS = ['/new', '/reset', '/clear']
export const isSlashCommand = (value: string) => SLASH_CMDS.includes(value.toLowerCase())
