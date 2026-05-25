export interface ModelIdentity {
  id: string
  name?: string | null
  provider?: string | null
}

export const CANONICAL_GPT_55_MODEL_ID = 'openai/gpt-5.5'

function compact(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function lookupKey(value: string): string {
  return compact(value)
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function slug(value: string): string {
  return value.split('/').at(-1) ?? value
}

function canonicalAlias(value: string): string {
  const key = lookupKey(value)
  if (key === 'gpt 5 5' || key === 'openai gpt 5 5') return CANONICAL_GPT_55_MODEL_ID
  return compact(value)
}

export function canonicalizeModelId(value: string): string {
  return canonicalAlias(value)
}

export function resolveModelId(value: string | null | undefined, models: ModelIdentity[] = []): string {
  const candidate = canonicalizeModelId(value ?? '')
  if (!candidate) return ''

  const exact = models.find(model => model.id === candidate)
  if (exact) return exact.id

  const labelMatch = models.find(model => model.name && lookupKey(model.name) === lookupKey(value ?? ''))
  if (labelMatch) return labelMatch.id

  const canonicalLabelMatch = models.find(model => model.name && canonicalizeModelId(model.name) === candidate)
  if (canonicalLabelMatch) return canonicalLabelMatch.id

  const candidateSlug = slug(candidate)
  const slugMatch = models.find(model => slug(model.id) === candidateSlug)
  if (slugMatch) return slugMatch.id

  return models.length > 0 ? '' : candidate
}

export function resolveStoredModelId(value: string | null | undefined, models: ModelIdentity[] = []): string {
  const resolved = resolveModelId(value, models)
  return canonicalizeModelId(resolved || value || '')
}

export function modelIdentifiersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = canonicalizeModelId(a ?? '')
  const right = canonicalizeModelId(b ?? '')
  if (!left || !right) return false
  return left === right || slug(left) === slug(right)
}
