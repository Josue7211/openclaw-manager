import { describe, expect, it } from 'vitest'
import {
  commandForProjectScript,
  nextProjectScriptId,
  primaryProjectScript,
  projectScriptIdFromCommand,
} from '../projectScripts'

describe('T3 copied projectScripts helpers', () => {
  it('generates stable script ids with T3 suffix and length behavior', () => {
    expect(nextProjectScriptId('Run Tauri dev!', [])).toBe('run-tauri-dev')
    expect(nextProjectScriptId('Run Tauri dev!', ['run-tauri-dev'])).toBe('run-tauri-dev-2')
    expect(nextProjectScriptId('x'.repeat(90), [])).toHaveLength(64)
  })

  it('round-trips project script keybinding command ids', () => {
    expect(commandForProjectScript('test-chat')).toBe('script.test-chat.run')
    expect(projectScriptIdFromCommand('script.test-chat.run')).toBe('test-chat')
    expect(projectScriptIdFromCommand('chat.send')).toBeNull()
  })

  it('selects the first non-setup action as primary', () => {
    expect(primaryProjectScript([
      { id: 'setup', name: 'Setup', command: 'npm install', runOnWorktreeCreate: true },
      { id: 'dev', name: 'Dev', command: 'npm run dev' },
    ])?.id).toBe('dev')
    expect(primaryProjectScript([
      { id: 'setup', name: 'Setup', command: 'npm install', runOnWorktreeCreate: true },
    ])?.id).toBe('setup')
    expect(primaryProjectScript([])).toBeNull()
  })
})
