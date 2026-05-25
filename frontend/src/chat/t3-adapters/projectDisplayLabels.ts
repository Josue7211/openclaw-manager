export function hermesAgentProjectDisplayLabel(value: string): string {
  const label = value.trim()
  const normalized = label.toLowerCase()
  const compact = normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (compact === 'remote harness' || compact === 'harness remote') return 'Hermes Agent remote'
  if (compact === 'harness vm' || compact === 'vm harness') return 'Hermes Agent VM'
  if (compact === 'harness') return 'Hermes Agent'
  return value
}
