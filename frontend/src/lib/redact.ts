// Patterns that look like secrets
const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*["']?([a-zA-Z0-9_\-./+]{20,})["']?/gi,
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,                    // OpenAI-style keys
  /\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+)\b/g,  // JWT tokens
  /\b([a-f0-9]{32,})\b/g,                            // Long hex strings (API keys)
]

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex since we reuse regex objects with the 'g' flag
    pattern.lastIndex = 0
    result = result.replace(pattern, (match, group) => {
      if (group && group.length > 8) {
        return match.replace(group, group.slice(0, 4) + '***' + group.slice(-4))
      }
      return match.replace(/[a-zA-Z0-9]{4,}/g, (s) => s.slice(0, 2) + '***')
    })
  }
  return result
}
