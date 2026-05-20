import sharedChatProviders from '../../../../shared/chat-providers.json'
import type { ChatProviderId, ChatProviderOption } from './types'

type SharedChatProviderOption = {
  id: string
  name: string
  description: string
  local: boolean
  modelBacked: boolean
}

const SHARED_CHAT_PROVIDER_OPTIONS = sharedChatProviders as SharedChatProviderOption[]

function toChatProviderId(id: string): ChatProviderId {
  if (id === 'hermes' || id === 'claudeAgent' || id === 'codex-cli') {
    return id
  }
  throw new Error(`Unsupported shared chat provider id: ${id}`)
}

export const CHAT_PROVIDER_IDS = SHARED_CHAT_PROVIDER_OPTIONS.map(
  provider => toChatProviderId(provider.id),
)

const CHAT_PROVIDER_ID_SET = new Set<string>(CHAT_PROVIDER_IDS)

function toChatProviderOption(provider: SharedChatProviderOption): ChatProviderOption {
  if (!CHAT_PROVIDER_ID_SET.has(provider.id)) {
    throw new Error(`Unsupported shared chat provider id: ${provider.id}`)
  }
  return {
    ...provider,
    id: provider.id as ChatProviderOption['id'],
  }
}

export const CHAT_PROVIDER_OPTIONS: ChatProviderOption[] = SHARED_CHAT_PROVIDER_OPTIONS.map(toChatProviderOption)

const CHAT_FALLBACK_PROVIDER_OPTION: ChatProviderOption = CHAT_PROVIDER_OPTIONS
  .find(provider => provider.id === 'hermes')
  ?? toChatProviderOption({
    id: 'hermes',
    name: 'Hermes',
    description: 'Codex LB backed chat',
    local: false,
    modelBacked: true,
  })

export const CHAT_FALLBACK_PROVIDER_OPTIONS: ChatProviderOption[] = [
  CHAT_FALLBACK_PROVIDER_OPTION,
]
