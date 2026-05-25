import type { NoteSelectionAnchor, VaultNote } from './types'

export type WritingAssistIntent = 'polish' | 'concise' | 'continue'
export type WritingAssistProvider = 'local'
export type WritingAssistTone = 'neutral' | 'direct' | 'friendly'
export type WritingAssistLength = 'standard' | 'short'

export interface WritingAssistControls {
  provider: WritingAssistProvider
  tone: WritingAssistTone
  length: WritingAssistLength
}

export interface WritingAssistOption {
  id: WritingAssistIntent
  label: string
  detail: string
  content: string
  note: string
}

export interface WritingAssistDraft {
  anchor: NoteSelectionAnchor
  sourceText: string
  options: WritingAssistOption[]
  cursorInsert: boolean
}

export interface WritingAssistCommentLike {
  body: string
  anchor?: Record<string, unknown>
  replies?: Array<{ body: string }>
}

const MAX_SOURCE_CHARS = 2400
export const DEFAULT_WRITING_ASSIST_CONTROLS: WritingAssistControls = {
  provider: 'local',
  tone: 'neutral',
  length: 'standard',
}

export function writingAssistProviderLabel(provider: WritingAssistProvider): string {
  if (provider === 'local') return 'Local only'
  return provider
}

export function writingAssistPrivacySummary(controls: WritingAssistControls = DEFAULT_WRITING_ASSIST_CONTROLS): string {
  if (controls.provider === 'local') {
    return 'Local-only assistant. Note text stays on this device and is not sent to a remote provider.'
  }
  return 'Remote provider is not configured.'
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function sentenceCase(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
}

function polishText(text: string): string {
  return sentenceCase(
    normalizeWhitespace(text)
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])([^\s\n])/g, '$1 $2'),
  )
}

function conciseText(text: string): string {
  const cleaned = polishText(text)
    .replace(/\b(really|very|basically|actually|literally|just|quite)\b\s*/gi, '')
    .replace(/\bin order to\b/gi, 'to')
    .replace(/\bdue to the fact that\b/gi, 'because')
    .replace(/\bat this point in time\b/gi, 'now')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (cleaned !== polishText(text)) return cleaned
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(sentence => sentence.trim()).filter(Boolean) ?? []
  return sentences.length > 2 ? sentences.slice(0, 2).join(' ') : cleaned
}

function shortenDraft(text: string): string {
  const cleaned = normalizeWhitespace(text)
  const lines = cleaned.split('\n')
  const firstHeading = lines.find(line => /^#{1,6}\s+/.test(line))
  const bullets = lines.filter(line => /^\s*[-*]\s+/.test(line)).slice(0, 3)
  const prose = lines.filter(line => line.trim() && !/^#{1,6}\s+/.test(line) && !/^\s*[-*]\s+/.test(line)).join(' ')
  const firstSentence = prose.match(/[^.!?]+[.!?]+/)?.[0]?.trim() || prose.trim()
  return [
    firstHeading,
    firstSentence,
    ...bullets,
  ].filter(Boolean).join('\n').trim() || cleaned
}

function applyTone(text: string, tone: WritingAssistTone): string {
  if (tone === 'neutral') return text
  if (tone === 'direct') {
    return normalizeWhitespace(text)
      .replace(/^Next step:/i, 'Action:')
      .replace(/\bplease\b\s*/gi, '')
      .replace(/\bI think\b\s*/gi, '')
      .trim()
  }
  const cleaned = normalizeWhitespace(text).replace(/^Action:/i, 'Next step:')
  if (/^[-*]\s+/m.test(cleaned)) return `${cleaned}\n\nPlease review when ready.`
  if (/^Next step:/i.test(cleaned)) return `${cleaned} Please review when ready.`
  return `${cleaned}\n\nPlease review when ready.`
}

function continuationFor(note: VaultNote, sourceText: string): string {
  const title = note.title || note._id.replace(/\.md$/, '').split('/').pop() || 'this note'
  const basis = normalizeWhitespace(sourceText).split('\n').find(line => line.trim()) || title
  return [
    `Next step: clarify how ${basis.replace(/^#+\s*/, '').slice(0, 90)} connects to ${title}.`,
    '',
    '- [ ] Capture the decision',
    '- [ ] Note the owner',
    '- [ ] Add the follow-up date',
  ].join('\n')
}

function currentMarkdownParagraph(content: string, anchor: NoteSelectionAnchor): string {
  if (anchor.mode !== 'markdown' || typeof anchor.start !== 'number') return ''
  const cursor = Math.max(0, Math.min(anchor.start, content.length))
  const beforeBreak = content.lastIndexOf('\n\n', Math.max(0, cursor - 1))
  const afterBreak = content.indexOf('\n\n', cursor)
  const start = beforeBreak === -1 ? 0 : beforeBreak + 2
  const end = afterBreak === -1 ? content.length : afterBreak
  return content.slice(start, end).trim()
}

function uniqueOptions(options: WritingAssistOption[]): WritingAssistOption[] {
  const seen = new Set<string>()
  return options.filter(option => {
    const key = `${option.id}:${option.content}`
    if (seen.has(key) || !option.content.trim()) return false
    seen.add(key)
    return true
  })
}

export function buildWritingAssistDraft(note: VaultNote, anchor: NoteSelectionAnchor | null, content: string): WritingAssistDraft {
  const usableAnchor = anchor?.scope === 'selection' && anchor.quote?.trim()
    ? anchor
    : anchor?.scope === 'cursor'
      ? anchor
      : { scope: 'document' as const }
  const cursorInsert = usableAnchor.scope === 'cursor'
  const selectedText = usableAnchor.scope === 'selection' ? usableAnchor.quote ?? '' : ''
  const paragraphText = cursorInsert ? currentMarkdownParagraph(content, usableAnchor) : ''
  const sourceText = normalizeWhitespace((selectedText || paragraphText || content).slice(0, MAX_SOURCE_CHARS))
  const options = cursorInsert
    ? [{
        id: 'continue' as const,
        label: 'Continue from cursor',
        detail: 'Insert a local continuation draft',
        content: continuationFor(note, sourceText),
        note: 'Generated locally from the current note context.',
      }]
    : [
        {
          id: 'polish' as const,
          label: usableAnchor.scope === 'selection' ? 'Polish selection' : 'Polish document',
          detail: 'Clean spacing, punctuation, and sentence casing',
          content: polishText(sourceText),
          note: 'Generated locally; review before accepting.',
        },
        {
          id: 'concise' as const,
          label: usableAnchor.scope === 'selection' ? 'Make selection concise' : 'Make document concise',
          detail: 'Remove filler and tighten wording',
          content: conciseText(sourceText),
          note: 'Generated locally; review before accepting.',
        },
      ]

  return {
    anchor: usableAnchor,
    sourceText,
    options: uniqueOptions(options),
    cursorInsert,
  }
}

export function writingAssistPatchForDraft(draft: WritingAssistDraft, option: WritingAssistOption): Record<string, unknown> {
  if (draft.anchor.scope === 'selection') return { type: 'replace_selection', content: option.content }
  if (draft.cursorInsert) return { type: 'insert_at_cursor', content: option.content }
  return { type: 'replace_document', content: option.content }
}

export function applyWritingAssistControls(
  option: WritingAssistOption,
  controls: WritingAssistControls = DEFAULT_WRITING_ASSIST_CONTROLS,
): WritingAssistOption {
  const lengthAdjusted = controls.length === 'short' ? shortenDraft(option.content) : option.content
  const content = applyTone(lengthAdjusted, controls.tone)
  const details = [
    controls.tone !== 'neutral' ? `${controls.tone} tone` : '',
    controls.length !== 'standard' ? `${controls.length} length` : '',
  ].filter(Boolean)
  return {
    ...option,
    content,
    note: details.length > 0 ? `${option.note} ${details.join(', ')} applied locally.` : option.note,
  }
}

export function buildCommentReplyDraft(comment: WritingAssistCommentLike, noteTitle = 'this note'): string {
  const commentBody = normalizeWhitespace(comment.body)
  const quote = typeof comment.anchor?.quote === 'string' ? normalizeWhitespace(comment.anchor.quote) : ''
  const lastReply = comment.replies?.slice().reverse().find(reply => reply.body.trim())?.body.trim()
  const target = quote || noteTitle
  if (/done|fixed|resolved|addressed/i.test(lastReply || '')) {
    return 'Thanks. I will leave this open until you confirm the latest change covers it.'
  }
  if (/clarif|unclear|confus|explain|why/i.test(commentBody)) {
    return `Thanks. I clarified ${target.slice(0, 96)} and tightened the surrounding context.`
  }
  if (/short|concise|tight|trim/i.test(commentBody)) {
    return `Thanks. I tightened ${target.slice(0, 96)} and removed the extra wording.`
  }
  if (/typo|grammar|spelling|punctuation/i.test(commentBody)) {
    return `Thanks. I cleaned up the wording and punctuation in ${target.slice(0, 96)}.`
  }
  return `Thanks. I reviewed ${target.slice(0, 96)} and made a local revision for this note.`
}
