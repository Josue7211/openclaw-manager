/**
 * Static analysis gate for Bjorn-generated code.
 *
 * Validates source text against a regex blocklist of dangerous APIs.
 * This is the first security layer — code that fails analysis never
 * reaches the sandbox iframe.
 *
 * Allowed: window.requestData() (the data bridge API).
 */

import type { AnalysisResult } from './bjorn-types'

// ---------------------------------------------------------------------------
// Blocklist — 17 patterns covering network, DOM escape, storage, IPC
// ---------------------------------------------------------------------------

export const BLOCKLIST: ReadonlyArray<RegExp> = [
  // Network access
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bnew\s+WebSocket\b/,
  /\bnavigator\.sendBeacon\b/,
  /\bimportScripts\b/,

  // DOM escape / parent access
  /\bwindow\.parent\b/,
  /\bwindow\.top\b/,
  /\bparent\.postMessage\b/,
  /\bdocument\.cookie\b/,
  /\bdocument\.domain\b/,

  // Storage access
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,

  // Code execution
  /\beval\s*\(/,
  /\bnew\s+Function\b/,

  // Tauri IPC
  /__TAURI/,

  // Browser API misuse
  /\bwindow\.open\b/,
]

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export function analyzeCode(source: string): AnalysisResult {
  const lines = source.split('\n')
  const violations: AnalysisResult['violations'] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip the allowed bridge API
    if (/\bwindow\.requestData\b/.test(line) && !/\bwindow\.parent\b/.test(line)) {
      // requestData is the sanctioned bridge — don't flag it
      // But still check other patterns on the same line
      for (const pattern of BLOCKLIST) {
        if (pattern.source === '\\bwindow\\.parent\\b') continue
        if (pattern.test(line)) {
          violations.push({
            pattern: pattern.source,
            line: i + 1,
            snippet: line.trim().slice(0, 80),
          })
        }
      }
      continue
    }

    for (const pattern of BLOCKLIST) {
      if (pattern.test(line)) {
        violations.push({
          pattern: pattern.source,
          line: i + 1,
          snippet: line.trim().slice(0, 80),
        })
      }
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  }
}
