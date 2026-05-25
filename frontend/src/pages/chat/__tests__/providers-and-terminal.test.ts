import { describe, expect, it, beforeEach } from 'vitest'
import { setApiBase, setApiKey, setDesktopApiKeys } from '@/lib/api'
import { buildTerminalWebSocketUrl } from '@/hooks/useTerminal'
import { CHAT_FALLBACK_PROVIDER_OPTIONS, CHAT_PROVIDER_IDS, CHAT_PROVIDER_OPTIONS } from '../providers'
import sharedChatProviders from '../../../../../shared/chat-providers.json'

describe('chat provider and terminal contracts', () => {
  beforeEach(() => {
    setApiKey('')
    setDesktopApiKeys({})
    setApiBase('http://127.0.0.1:3010')
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('keeps chat providers on the Hermes Agent first contract', () => {
    expect(CHAT_PROVIDER_IDS).toEqual(['hermes'])
    expect(CHAT_PROVIDER_OPTIONS).toEqual(sharedChatProviders)
    expect(CHAT_PROVIDER_OPTIONS.map((provider) => provider.id)).toEqual(CHAT_PROVIDER_IDS)
    expect(CHAT_PROVIDER_OPTIONS.find((provider) => provider.id === 'hermes')).toMatchObject({
      name: 'Hermes Agent',
      modelBacked: true,
    })
    expect(CHAT_PROVIDER_OPTIONS.find((provider) => provider.id === 'claudeAgent')).toBeUndefined()
    expect(CHAT_PROVIDER_OPTIONS.find((provider) => provider.id === 'codex-cli')).toBeUndefined()
    expect(CHAT_PROVIDER_OPTIONS.find((provider) => provider.id === 'openclaw')).toBeUndefined()
    expect(CHAT_FALLBACK_PROVIDER_OPTIONS.map((provider) => provider.id)).toEqual(['hermes'])
  })

  it('builds terminal websocket URLs with auth and dock context', () => {
    setApiKey('test-key')

    const url = buildTerminalWebSocketUrl('/Volumes/T7/projects/clawcontrol', 'chat-process-1', {
      CLAWCONTROL_RUNTIME: 'Work locally',
    })

    expect(url).toContain('ws://127.0.0.1:3010/api/terminal/ws?')
    expect(url).toContain('apiKey=test-key')
    expect(url).toContain('cwd=%2FVolumes%2FT7%2Fprojects%2Fclawcontrol')
    expect(url).toContain('processId=chat-process-1')
    expect(url).toContain('CLAWCONTROL_RUNTIME')
  })

  it('uses the local desktop backend and local api key for terminal websocket URLs', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    setApiBase('https://remote.example.test')
    setDesktopApiKeys({
      localApiKey: 'local-terminal-key',
      remoteApiKey: 'remote-key',
    })

    const url = buildTerminalWebSocketUrl('/Volumes/T7/projects/clawcontrol', 'chat-process-2')

    expect(url).toContain('ws://127.0.0.1:3010/api/terminal/ws?')
    expect(url).toContain('apiKey=local-terminal-key')
    expect(url).not.toContain('remote-key')
    expect(url).not.toContain('remote.example.test')
  })
})
