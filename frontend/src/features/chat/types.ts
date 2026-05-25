export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  timestamp: string
  images?: string[]
  contextFiles?: ChatContextFileAttachment[]
  localOnly?: boolean
  transcriptId?: string
  turnId?: string
  toolCallId?: string
  toolName?: string
}

export interface ChatContextFileAttachment {
  id: string
  name: string
  path?: string
  mimeType?: string
  size?: number
  content: string
  truncated?: boolean
}

export interface ChatExecutionContext {
  projectId?: string
  project?: string
  projectRoot?: string
  workingDir?: string
  environmentId?: string
  branch?: string
  runtime?: string
}

export type MsgStatus = 'sending' | 'sent' | 'permanent' | 'error' | 'cancelled'

export interface OptimisticMsg {
  id: string
  text: string
  status: MsgStatus
  images?: string[]
  contextFiles?: ChatContextFileAttachment[]
  provider?: ChatProviderId
  model?: string
  providerIsModelBacked?: boolean
  context?: ChatExecutionContext
  error?: string
}

export interface ModelOption {
  id: string
  name: string
  provider?: string
  local?: boolean
  contextWindow?: number
}

export type ChatProviderId = 'hermes' | (string & {})

export interface ChatProviderOption {
  id: ChatProviderId
  name: string
  description: string
  local: boolean
  modelBacked: boolean
  available?: boolean
  unavailableReason?: string
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

export const CHAT_SLASH_COMMANDS = [
  { command: '/new', label: 'New chat', description: 'Start fresh' },
  { command: '/reset', label: 'Reset chat', description: 'Reset session' },
  { command: '/clear', label: 'Clear chat', description: 'Clear local view' },
] as const

export const SLASH_CMDS = CHAT_SLASH_COMMANDS.map(item => item.command)
export const isSlashCommand = (value: string) => (
  (SLASH_CMDS as readonly string[]).includes(value.trim().toLowerCase())
)
