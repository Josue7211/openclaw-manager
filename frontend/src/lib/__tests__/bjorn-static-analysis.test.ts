import { describe, it, expect } from 'vitest'
import { analyzeCode, BLOCKLIST } from '../bjorn-static-analysis'

describe('analyzeCode', () => {
  it('safe code passes without violations', () => {
    const result = analyzeCode('const x = 1\nconst y = x + 2')
    expect(result.safe).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('blocks fetch calls', () => {
    const result = analyzeCode('const data = fetch("/api")')
    expect(result.safe).toBe(false)
    expect(result.violations[0].pattern).toContain('fetch')
  })

  it('blocks XMLHttpRequest', () => {
    const result = analyzeCode('const xhr = new XMLHttpRequest()')
    expect(result.safe).toBe(false)
  })

  it('blocks WebSocket creation', () => {
    const result = analyzeCode('const ws = new WebSocket("ws://evil")')
    expect(result.safe).toBe(false)
  })

  it('blocks navigator.sendBeacon', () => {
    const result = analyzeCode('navigator.sendBeacon("/track", data)')
    expect(result.safe).toBe(false)
  })

  it('blocks importScripts', () => {
    const result = analyzeCode('importScripts("evil.js")')
    expect(result.safe).toBe(false)
  })

  it('blocks window.parent access', () => {
    const result = analyzeCode('window.parent.postMessage("leak", "*")')
    expect(result.safe).toBe(false)
  })

  it('blocks window.top access', () => {
    const result = analyzeCode('const top = window.top')
    expect(result.safe).toBe(false)
  })

  it('blocks document.cookie access', () => {
    const result = analyzeCode('const c = document.cookie')
    expect(result.safe).toBe(false)
  })

  it('blocks document.domain', () => {
    const result = analyzeCode('document.domain = "evil.com"')
    expect(result.safe).toBe(false)
  })

  it('blocks localStorage', () => {
    const result = analyzeCode('localStorage.setItem("key", "val")')
    expect(result.safe).toBe(false)
  })

  it('blocks sessionStorage', () => {
    const result = analyzeCode('sessionStorage.getItem("key")')
    expect(result.safe).toBe(false)
  })

  it('blocks indexedDB', () => {
    const result = analyzeCode('const db = indexedDB.open("mydb")')
    expect(result.safe).toBe(false)
  })

  // NOTE: The analyzeCode function blocks eval() and Function() constructor
  // patterns in USER-GENERATED code as a security gate. These test strings
  // are static test data checked by regex, not executed.

  it('blocks eval pattern in generated code', () => {
    const result = analyzeCode('eval("alert(1)")')
    expect(result.safe).toBe(false)
  })

  it('blocks Function constructor pattern in generated code', () => {
    // Testing that the static analysis REGEX catches this pattern
    const result = analyzeCode('const fn = new Function("return 1")')
    expect(result.safe).toBe(false)
  })

  it('blocks __TAURI IPC', () => {
    const result = analyzeCode('window.__TAURI__.invoke("cmd")')
    expect(result.safe).toBe(false)
  })

  it('blocks window.open', () => {
    const result = analyzeCode('window.open("https://evil.com")')
    expect(result.safe).toBe(false)
  })

  it('reports correct line numbers for multi-line violations', () => {
    const code = [
      'const x = 1',
      'const y = 2',
      'fetch("/api")',
      'const z = 3',
      'eval("bad")',
    ].join('\n')
    const result = analyzeCode(code)
    expect(result.safe).toBe(false)
    expect(result.violations).toHaveLength(2)
    expect(result.violations[0].line).toBe(3)
    expect(result.violations[1].line).toBe(5)
  })

  it('allows window.requestData (the bridge API)', () => {
    const result = analyzeCode('const data = window.requestData("homelab", "status")')
    expect(result.safe).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('has at least 17 blocklist patterns', () => {
    expect(BLOCKLIST.length).toBeGreaterThanOrEqual(17)
  })

  it('trims snippets to 80 characters', () => {
    const longLine = 'x'.repeat(100) + ' fetch("/api")'
    const result = analyzeCode(longLine)
    expect(result.violations[0].snippet.length).toBeLessThanOrEqual(80)
  })
})
