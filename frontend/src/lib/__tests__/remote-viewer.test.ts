import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteViewerWsUrl } from '../remote-viewer'

describe('buildRemoteViewerWsUrl', () => {
  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('uses the configured API base in browser mode', () => {
    expect(buildRemoteViewerWsUrl('https://backend.example.test:8443', 'local key')).toBe(
      'wss://backend.example.test:8443/api/vnc/ws?apiKey=local%20key',
    )
  })

  it('uses the local desktop API base in Tauri mode', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })

    expect(buildRemoteViewerWsUrl('https://backend.example.test:8443', 'local-key')).toBe(
      'ws://127.0.0.1:3010/api/vnc/ws?apiKey=local-key',
    )
  })
})
