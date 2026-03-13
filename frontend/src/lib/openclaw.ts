import { invoke } from '@tauri-apps/api/core'

let _openclawDir: string | null = null

export async function getOpenclawDir(): Promise<string> {
  if (_openclawDir) return _openclawDir
  if ((window as any).__TAURI_INTERNALS__) {
    _openclawDir = await invoke<string>('get_openclaw_dir')
  } else {
    _openclawDir = '~/.openclaw'
  }
  return _openclawDir
}

export interface ChatSendOptions {
  sessionKey?: string
  message: string
  attachments?: { mimeType: string; content: string }[]
  deliver?: boolean
  timeoutMs?: number
  clientMode?: 'backend' | 'ui'
}
