// NOTE: To get structured replay events, spawn Gunther with stream-json output:
//   ANTHROPIC_MODEL=claude-sonnet-4-6 claude --output-format stream-json --dangerously-skip-permissions -p "..." > /tmp/gunther-xxx.log 2>&1
// This parser detects the JSONL format automatically and extracts tool_use events.

import fs from 'fs'
import path from 'path'

export type EventType = 'write' | 'edit' | 'bash' | 'read' | 'think' | 'result' | 'glob' | 'grep' | 'user'

export interface ParsedEvent {
  event_type: EventType
  content: string
  file_path?: string
  seq: number
  elapsed_seconds?: number
  tool_input?: string      // full command/content being written
  model_name?: string      // model that ran this, e.g. "claude-opus-4-5"
  timestamp?: string       // ISO timestamp if parsed from log
}

// Agent ID → log file patterns in /tmp
export const AGENT_LOG_PATTERNS: Record<string, RegExp> = {
  koda:   /^(koda|gunther)-.*\.log$/,
  axel:   /^axel-.*\.log$/,
  nova:   /^nova-.*\.log$/,
  pixel:  /^pixel-.*\.log$/,
  roman:  /^(roman|fast)-.*\.log$/,
  review: /^codex-review-.*\.log$/,
  echo:   /^echo-.*\.log$/,
  // fallback: match any agent-style log
  default: /^[a-z]+-.*\.log$/,
}

const MAX_EVENTS = 500
const MAX_TOOL_INPUT_LENGTH = 500

const EVENT_WEIGHTS: Record<EventType, number> = {
  user: 1.5, write: 2, edit: 2, bash: 3, read: 0.5,
  glob: 0.3, grep: 0.5, think: 0.2, result: 1,
}

/** Distribute elapsed_seconds across raw events using weighted allocation */
function assignElapsedSeconds(
  rawEvents: { type: EventType; content: string; filePath?: string; toolInput?: string; model?: string }[],
  duration: number,
  detectedModel?: string,
): ParsedEvent[] {
  let totalWeight = 0
  for (const e of rawEvents) totalWeight += EVENT_WEIGHTS[e.type] || 1

  let cumulativeWeight = 0
  return rawEvents.map((evt, i) => {
    const weight = EVENT_WEIGHTS[evt.type] || 1
    const elapsed = totalWeight > 0
      ? Math.round((cumulativeWeight / totalWeight) * duration)
      : Math.round((i / Math.max(rawEvents.length - 1, 1)) * duration)
    cumulativeWeight += weight
    return {
      event_type: evt.type,
      content: evt.content,
      file_path: evt.filePath,
      seq: i,
      elapsed_seconds: elapsed,
      tool_input: evt.toolInput,
      model_name: evt.model ?? detectedModel,
    }
  })
}

// Parse claude --output-format stream-json JSONL format
function parseStreamJsonLog(logContent: string, missionDurationSeconds?: number): ParsedEvent[] | null {
  const lines = logContent.split('\n').filter(l => l.trim().startsWith('{"'))
  if (lines.length === 0) return null

  // Verify it looks like stream-json by checking a few lines
  let validCount = 0
  for (const line of lines.slice(0, 5)) {
    try { const o = JSON.parse(line); if (o.type) validCount++ } catch { /* skip */ }
  }
  if (validCount === 0) return null

  const rawEvents: { type: EventType; content: string; filePath?: string; toolInput?: string; model?: string }[] = []
  let detectedModel: string | undefined

  for (const line of lines) {
    let obj: Record<string, unknown>
    try { obj = JSON.parse(line) } catch { continue }

    const type = obj.type as string

    // Extract model from assistant messages
    if (type === 'assistant') {
      const msg = obj.message as Record<string, unknown> | undefined
      if (msg?.model) detectedModel = msg.model as string
      const content = msg?.content as unknown[] | undefined
      if (!Array.isArray(content)) continue

      for (const block of content) {
        const b = block as Record<string, unknown>
        if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
          rawEvents.push({ type: 'think', content: b.thinking.trim().slice(0, 300), model: detectedModel })
        } else if (b.type === 'tool_use') {
          const name = b.name as string
          const input = b.input as Record<string, unknown> | undefined
          const toolInput = input ? JSON.stringify(input).slice(0, MAX_TOOL_INPUT_LENGTH) : undefined

          const toolMap: Record<string, EventType> = {
            Write: 'write', Edit: 'edit', Read: 'read',
            Bash: 'bash', Glob: 'glob', Grep: 'grep',
          }
          const evtType = toolMap[name]
          if (!evtType) continue

          const fileTypes: EventType[] = ['write', 'edit', 'read', 'glob']
          let content = ''
          let filePath: string | undefined

          if (input?.file_path) { content = input.file_path as string; filePath = content }
          else if (input?.command) { content = input.command as string }
          else if (input?.pattern) { content = input.pattern as string }
          else if (input?.path) { content = input.path as string }
          else content = name

          if (fileTypes.includes(evtType) && !filePath) filePath = content

          rawEvents.push({ type: evtType, content, filePath, toolInput, model: detectedModel })
        } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 8) {
          rawEvents.push({ type: 'think', content: b.text.trim().slice(0, 300), model: detectedModel })
        }
      }
    } else if (type === 'result') {
      const resultText = obj.result as string | undefined
      if (resultText && typeof resultText === 'string' && resultText.trim().length > 0) {
        rawEvents.push({ type: 'result', content: resultText.trim().slice(0, 300), model: detectedModel })
      }
    }
  }

  if (rawEvents.length === 0) return null

  return assignElapsedSeconds(rawEvents, missionDurationSeconds ?? 120, detectedModel)
}

export function parseClaudeLog(logContent: string, missionDurationSeconds?: number): ParsedEvent[] {
  // Try stream-json JSONL format first
  const streamJsonResult = parseStreamJsonLog(logContent, missionDurationSeconds)
  if (streamJsonResult) return streamJsonResult

  const lines = logContent.split('\n')
  const events: ParsedEvent[] = []
  let seq = 0
  let detectedModel: string | undefined

  // Try to detect model from early lines (header info)
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i]
    const modelMatch = line.match(/claude[- ](opus|sonnet|haiku)[- ]?(\d+[\.\d]*)?/i)
    if (modelMatch) {
      detectedModel = `claude-${modelMatch[1].toLowerCase()}${modelMatch[2] ? '-' + modelMatch[2] : ''}`
      break
    }
    // Also check for model ID patterns
    const modelIdMatch = line.match(/(claude-opus-4-5|claude-sonnet-4-6|claude-haiku-4-5)/i)
    if (modelIdMatch) {
      detectedModel = modelIdMatch[1].toLowerCase()
      break
    }
  }

  // Collect indented lines following tool calls for tool_input
  let pendingEvent: ParsedEvent | null = null
  let pendingInputLines: string[] = []

  function flushPending() {
    if (pendingEvent) {
      if (pendingInputLines.length > 0) {
        pendingEvent.tool_input = pendingInputLines.join('\n').slice(0, MAX_TOOL_INPUT_LENGTH)
      }
      events.push(pendingEvent)
      pendingEvent = null
      pendingInputLines = []
    }
  }

  // First pass: collect raw events
  const rawEvents: { type: EventType; content: string; filePath?: string; toolInput?: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (!line) continue

    // Skip separators
    if (/^[─═━\-=*]{4,}$/.test(line)) continue

    // Detect user prompts (lines starting with ">")
    if (line.startsWith('>')) {
      flushPending()
      const userContent = line.slice(1).trim()
      if (userContent.length > 0) {
        rawEvents.push({ type: 'user', content: userContent })
      }
      continue
    }

    // Match tool calls with ⎿, ●, or plain "Tool(path)" style
    const toolPatterns: { type: EventType; patterns: RegExp[] }[] = [
      { type: 'write', patterns: [
        /^[⎿●]\s*Write\s+(.+)$/,
        /^Write\s*\(\s*(.+?)\s*\)$/,
        /^[⎿●]?\s*Writing\s+(.+)$/,
      ]},
      { type: 'edit', patterns: [
        /^[⎿●]\s*Edit\s+(.+)$/,
        /^Edit\s*\(\s*(.+?)\s*\)$/,
        /^[⎿●]?\s*Editing\s+(.+)$/,
      ]},
      { type: 'read', patterns: [
        /^[⎿●]\s*Read\s+(.+)$/,
        /^Read\s*\(\s*(.+?)\s*\)$/,
        /^[⎿●]?\s*Reading\s+(.+)$/,
      ]},
      { type: 'bash', patterns: [
        /^[⎿●]\s*Bash\s+(.+)$/,
        /^Bash\s*\(\s*(.+?)\s*\)$/,
        /^\$\s+(.+)$/,
      ]},
      { type: 'glob', patterns: [
        /^[⎿●]\s*Glob\s+(.+)$/,
        /^Glob\s*\(\s*(.+?)\s*\)$/,
      ]},
      { type: 'grep', patterns: [
        /^[⎿●]\s*Grep\s+(.+)$/,
        /^Grep\s*\(\s*(.+?)\s*\)$/,
      ]},
    ]

    let matched = false
    for (const { type, patterns } of toolPatterns) {
      for (const pattern of patterns) {
        const m = line.match(pattern)
        if (m) {
          flushPending()
          const content = m[1].trim()
          const isFileType = ['write', 'edit', 'read', 'glob'].includes(type)
          pendingEvent = {
            event_type: type,
            content,
            file_path: isFileType ? content : undefined,
            seq: 0, // will assign later
            model_name: detectedModel,
          }
          pendingInputLines = []
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (matched) continue

    // Check for result patterns (build output, errors)
    if (
      line.includes('compiled successfully') ||
      line.includes('Build error') ||
      line.includes('build failed') ||
      line.includes('✓ Compiled') ||
      line.includes('✗ Build') ||
      (line.includes('Error:') && (line.includes('build') || line.includes('Build'))) ||
      line.includes('✓ Ready')
    ) {
      flushPending()
      rawEvents.push({ type: 'result', content: line })
      continue
    }

    // If we have a pending tool event and this line is indented or a continuation, collect it
    if (pendingEvent && (rawLine.startsWith('  ') || rawLine.startsWith('\t') || rawLine.startsWith('│') || rawLine.startsWith('⎿'))) {
      // This is tool output/input - collect first N lines
      if (pendingInputLines.length < 10) {
        const cleaned = line.replace(/^[│⎿\s]+/, '')
        if (cleaned) pendingInputLines.push(cleaned)
      }
      continue
    }

    // Everything else that's substantial text → thinking/reasoning
    if (line.length > 8) {
      flushPending()
      rawEvents.push({ type: 'think', content: line })
    }
  }

  flushPending()

  // Add pending events to rawEvents
  for (const evt of events) {
    rawEvents.push({
      type: evt.event_type,
      content: evt.content,
      filePath: evt.file_path,
      toolInput: evt.tool_input,
    })
  }
  events.length = 0

  // If we have too many events, prioritize non-think events
  let finalRaw = rawEvents
  if (rawEvents.length > MAX_EVENTS) {
    // Tag each event with its original index for O(n log n) re-sorting
    const indexed = rawEvents.map((e, i) => ({ e, i }))
    const important = indexed.filter(x => x.e.type !== 'think')
    const thinks = indexed.filter(x => x.e.type === 'think')
    const remaining = MAX_EVENTS - important.length
    const kept = [...important, ...thinks.slice(0, Math.max(0, remaining))]
    kept.sort((a, b) => a.i - b.i)
    finalRaw = kept.map(x => x.e)
  }

  return assignElapsedSeconds(finalRaw, missionDurationSeconds ?? 120, detectedModel)
}

// Find most recent log file for an agent in /tmp
export function findAgentLogFile(assignee: string): string | null {
  try {
    const pattern = AGENT_LOG_PATTERNS[assignee] || AGENT_LOG_PATTERNS.default
    const files = fs.readdirSync('/tmp').filter((f: string) => pattern.test(f))

    if (files.length === 0) return null

    const sorted = files
      .map((f: string) => ({
        name: f,
        mtime: fs.statSync(path.join('/tmp', f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)

    const RECENT_THRESHOLD_MS = 30 * 60 * 1000
    if (sorted[0] && Date.now() - sorted[0].mtime < RECENT_THRESHOLD_MS) {
      return path.join('/tmp', sorted[0].name)
    }

    return sorted[0] ? path.join('/tmp', sorted[0].name) : null
  } catch {
    return null
  }
}
