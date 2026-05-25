const HERMES_ACTIVE_PROVIDER_MESSAGE = 'Hermes Agent is the active agent right now.'
const HERMES_NOT_CONFIGURED_MESSAGE = 'Hermes Agent is not configured. Open Settings > Connections to connect it.'
const LEGACY_HERMES_ACTIVE_PROVIDER_RE = /Hermes Agent is the only\s+supported chat provider right now\./
const LEGACY_PROVIDER_RE = /\b(?:codex-cli|codex cli|codex-lb|codex lb|claudeagent|claude code|openclaw)\b/i
const PROVIDER_SCOPE_RE = /\b(?:unsupported|unknown|out-of-scope|not\s+supported)\s+(?:chat\s+)?provider\b/i
const PROVIDER_CWD_RE = /\b(?:provider\s+cwd|cwd|working\s+dir(?:ectory)?).*\b(?:required|absolute|folder|does\s+not\s+exist|cannot\s+be\s+read|cannot\s+be\s+resolved)\b/i
const NOT_CONFIGURED_RE = /\b(?:harness_not_configured|hermes_not_configured|harness\s+not\s+configured|Harness(?:\s+Agent)?\s+URL\s+is\s+not\s+configured|Hermes Agent\s+not\s+configured)\b/i

export function hermesChatErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const message = raw.trim()
  if (!message) return 'Chat send failed'
  if (NOT_CONFIGURED_RE.test(message)) return HERMES_NOT_CONFIGURED_MESSAGE
  if (
    message.includes(HERMES_ACTIVE_PROVIDER_MESSAGE) ||
    LEGACY_HERMES_ACTIVE_PROVIDER_RE.test(message)
  ) return HERMES_ACTIVE_PROVIDER_MESSAGE
  if (PROVIDER_CWD_RE.test(message)) {
    return 'Hermes Agent needs a project folder. Select or add a project before sending.'
  }
  if (LEGACY_PROVIDER_RE.test(message) || PROVIDER_SCOPE_RE.test(message)) {
    return HERMES_ACTIVE_PROVIDER_MESSAGE
  }
  return message
}
