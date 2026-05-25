import { formatTemplateDate } from '@/features/notes/templates'
import {
  DEFAULT_WRITING_ASSIST_CONTROLS,
  type WritingAssistLength,
  type WritingAssistProvider,
  type WritingAssistTone,
} from '@/features/notes/assistiveWriting'

export type NotesMarkdownWidth = 'narrow' | 'normal' | 'wide'
export type NotesMarkdownFontSize = 'small' | 'normal' | 'large'
export type NotesDefaultMode = 'doc' | 'source' | 'split' | 'read'
export type NotesPeriodicKind = 'daily' | 'weekly' | 'monthly'
export type NotesAppearanceMode = 'system' | 'light' | 'dark'

export interface NotesEditorPreferences {
  markdownWidth: NotesMarkdownWidth
  markdownFontSize: NotesMarkdownFontSize
  spellcheck: boolean
  defaultMode: NotesDefaultMode
  appearanceMode: NotesAppearanceMode
  cssSnippetEnabled: boolean
  cssSnippet: string
  dailyNoteFolder: string
  dailyNoteTitleFormat: string
  dailyNoteTemplateId: string
  dailyNoteOpenExisting: boolean
  weeklyNoteFolder: string
  weeklyNoteTemplateId: string
  monthlyNoteFolder: string
  monthlyNoteTemplateId: string
  writingAssistProvider: WritingAssistProvider
  writingAssistTone: WritingAssistTone
  writingAssistLength: WritingAssistLength
  remoteCollaborationEnabled: boolean
  remoteCollaborationBaseUrl: string
  remoteCollaborationPairingKey: string
}

export interface NotesRemoteCollaborationPairingInvite {
  protocol: 'claw-notes-collab-pairing'
  version: 1
  providerUrl: string
  pairingKey: string
  deviceLabel: string
  createdAt: number
  verifier: string
}

export interface CreateNotesRemoteCollaborationPairingInviteOptions {
  providerUrl: string
  pairingKey?: string
  deviceLabel?: string
  now?: number
  randomBytes?: Uint8Array
}

export interface NotesRemoteCollaborationSetupStatus {
  state: 'disabled' | 'missing-provider' | 'invalid-provider' | 'missing-key' | 'invalid-key' | 'ready'
  ready: boolean
  label: string
  detail: string
}

export const DEFAULT_NOTES_EDITOR_PREFERENCES: NotesEditorPreferences = {
  markdownWidth: 'normal',
  markdownFontSize: 'normal',
  spellcheck: true,
  defaultMode: 'doc',
  appearanceMode: 'system',
  cssSnippetEnabled: false,
  cssSnippet: '',
  dailyNoteFolder: 'Daily',
  dailyNoteTitleFormat: '[Daily] YYYY-MM-DD',
  dailyNoteTemplateId: 'daily',
  dailyNoteOpenExisting: true,
  weeklyNoteFolder: 'Weekly',
  weeklyNoteTemplateId: 'weekly',
  monthlyNoteFolder: 'Monthly',
  monthlyNoteTemplateId: 'monthly',
  writingAssistProvider: DEFAULT_WRITING_ASSIST_CONTROLS.provider,
  writingAssistTone: DEFAULT_WRITING_ASSIST_CONTROLS.tone,
  writingAssistLength: DEFAULT_WRITING_ASSIST_CONTROLS.length,
  remoteCollaborationEnabled: false,
  remoteCollaborationBaseUrl: '',
  remoteCollaborationPairingKey: '',
}

export function normalizeNotesEditorPreferences(value: Partial<NotesEditorPreferences> | null | undefined): NotesEditorPreferences {
  return {
    markdownWidth: isMarkdownWidth(value?.markdownWidth) ? value.markdownWidth : DEFAULT_NOTES_EDITOR_PREFERENCES.markdownWidth,
    markdownFontSize: isMarkdownFontSize(value?.markdownFontSize) ? value.markdownFontSize : DEFAULT_NOTES_EDITOR_PREFERENCES.markdownFontSize,
    spellcheck: typeof value?.spellcheck === 'boolean' ? value.spellcheck : DEFAULT_NOTES_EDITOR_PREFERENCES.spellcheck,
    defaultMode: isDefaultMode(value?.defaultMode) ? value.defaultMode : DEFAULT_NOTES_EDITOR_PREFERENCES.defaultMode,
    appearanceMode: isAppearanceMode(value?.appearanceMode) ? value.appearanceMode : DEFAULT_NOTES_EDITOR_PREFERENCES.appearanceMode,
    cssSnippetEnabled:
      typeof value?.cssSnippetEnabled === 'boolean'
        ? value.cssSnippetEnabled
        : DEFAULT_NOTES_EDITOR_PREFERENCES.cssSnippetEnabled,
    cssSnippet: normalizeNotesCssSnippet(value?.cssSnippet),
    dailyNoteFolder: normalizeNotesDailyFolder(value?.dailyNoteFolder),
    dailyNoteTitleFormat: normalizeNotesDailyTitleFormat(value?.dailyNoteTitleFormat),
    dailyNoteTemplateId: normalizeNotesDailyTemplateId(value?.dailyNoteTemplateId),
    dailyNoteOpenExisting:
      typeof value?.dailyNoteOpenExisting === 'boolean'
        ? value.dailyNoteOpenExisting
        : DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteOpenExisting,
    weeklyNoteFolder: normalizeNotesFolderPreference(value?.weeklyNoteFolder, DEFAULT_NOTES_EDITOR_PREFERENCES.weeklyNoteFolder),
    weeklyNoteTemplateId: normalizeNotesTemplateIdPreference(value?.weeklyNoteTemplateId, DEFAULT_NOTES_EDITOR_PREFERENCES.weeklyNoteTemplateId),
    monthlyNoteFolder: normalizeNotesFolderPreference(value?.monthlyNoteFolder, DEFAULT_NOTES_EDITOR_PREFERENCES.monthlyNoteFolder),
    monthlyNoteTemplateId: normalizeNotesTemplateIdPreference(value?.monthlyNoteTemplateId, DEFAULT_NOTES_EDITOR_PREFERENCES.monthlyNoteTemplateId),
    writingAssistProvider: isWritingAssistProvider(value?.writingAssistProvider)
      ? value.writingAssistProvider
      : DEFAULT_NOTES_EDITOR_PREFERENCES.writingAssistProvider,
    writingAssistTone: isWritingAssistTone(value?.writingAssistTone)
      ? value.writingAssistTone
      : DEFAULT_NOTES_EDITOR_PREFERENCES.writingAssistTone,
    writingAssistLength: isWritingAssistLength(value?.writingAssistLength)
      ? value.writingAssistLength
      : DEFAULT_NOTES_EDITOR_PREFERENCES.writingAssistLength,
    remoteCollaborationEnabled:
      typeof value?.remoteCollaborationEnabled === 'boolean'
        ? value.remoteCollaborationEnabled
        : DEFAULT_NOTES_EDITOR_PREFERENCES.remoteCollaborationEnabled,
    remoteCollaborationBaseUrl: normalizeNotesRemoteCollaborationBaseUrl(value?.remoteCollaborationBaseUrl),
    remoteCollaborationPairingKey: normalizeNotesRemoteCollaborationPairingKey(value?.remoteCollaborationPairingKey),
  }
}

export function notesCssSnippetText(
  preferences: Pick<NotesEditorPreferences, 'cssSnippetEnabled' | 'cssSnippet'>,
): string {
  const css = normalizeNotesCssSnippet(preferences.cssSnippet)
  if (!preferences.cssSnippetEnabled || !css) return ''
  return `@scope ([data-notes-vault-scope="true"]) {\n${css}\n}`
}

export function buildDailyNoteTitle(
  preferences: Pick<NotesEditorPreferences, 'dailyNoteTitleFormat'>,
  now: Date = new Date(),
): string {
  return formatTemplateDate(now, normalizeNotesDailyTitleFormat(preferences.dailyNoteTitleFormat))
}

export function buildPeriodicNoteTitle(
  kind: NotesPeriodicKind,
  preferences: Pick<NotesEditorPreferences, 'dailyNoteTitleFormat'>,
  now: Date = new Date(),
): string {
  if (kind === 'daily') return buildDailyNoteTitle(preferences, now)
  if (kind === 'weekly') {
    const { year, week } = isoWeek(now)
    return `Weekly ${year}-W${String(week).padStart(2, '0')}`
  }
  return formatTemplateDate(now, '[Monthly] YYYY-MM')
}

export function periodicNoteFolder(
  kind: NotesPeriodicKind,
  preferences: Pick<NotesEditorPreferences, 'dailyNoteFolder' | 'weeklyNoteFolder' | 'monthlyNoteFolder'>,
): string {
  if (kind === 'daily') return normalizeNotesDailyFolder(preferences.dailyNoteFolder)
  if (kind === 'weekly') return normalizeNotesFolderPreference(preferences.weeklyNoteFolder, DEFAULT_NOTES_EDITOR_PREFERENCES.weeklyNoteFolder)
  return normalizeNotesFolderPreference(preferences.monthlyNoteFolder, DEFAULT_NOTES_EDITOR_PREFERENCES.monthlyNoteFolder)
}

export function periodicNoteTemplateId(
  kind: NotesPeriodicKind,
  preferences: Pick<NotesEditorPreferences, 'dailyNoteTemplateId' | 'weeklyNoteTemplateId' | 'monthlyNoteTemplateId'>,
): string {
  if (kind === 'daily') return normalizeNotesDailyTemplateId(preferences.dailyNoteTemplateId)
  if (kind === 'weekly') return normalizeNotesTemplateIdPreference(preferences.weeklyNoteTemplateId, DEFAULT_NOTES_EDITOR_PREFERENCES.weeklyNoteTemplateId)
  return normalizeNotesTemplateIdPreference(preferences.monthlyNoteTemplateId, DEFAULT_NOTES_EDITOR_PREFERENCES.monthlyNoteTemplateId)
}

export function dailyNoteDateWithOffset(base: Date = new Date(), offsetDays = 0): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + offsetDays,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  )
}

export function dailyNoteDateInputValue(date: Date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function dailyNoteDateFromInput(value: string, base: Date = new Date()): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(
    year,
    month - 1,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  )
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function normalizeNotesDailyFolder(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteFolder
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

function normalizeNotesDailyTitleFormat(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteTitleFormat
  const trimmed = value.trim()
  if (trimmed === 'Daily YYYY-MM-DD') return DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteTitleFormat
  return trimmed || DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteTitleFormat
}

function normalizeNotesDailyTemplateId(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteTemplateId
  const trimmed = value.trim()
  return trimmed || DEFAULT_NOTES_EDITOR_PREFERENCES.dailyNoteTemplateId
}

function normalizeNotesFolderPreference(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/') || fallback
}

function normalizeNotesTemplateIdPreference(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function normalizeNotesCssSnippet(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NOTES_EDITOR_PREFERENCES.cssSnippet
  return value
    .replace(/<\/?style\b[^>]*>/gi, '')
    .slice(0, 20_000)
    .trim()
}

function isWritingAssistProvider(value: unknown): value is WritingAssistProvider {
  return value === 'local'
}

function isWritingAssistTone(value: unknown): value is WritingAssistTone {
  return value === 'neutral' || value === 'direct' || value === 'friendly'
}

function isWritingAssistLength(value: unknown): value is WritingAssistLength {
  return value === 'standard' || value === 'short'
}

function isoWeek(date: Date): { year: number; week: number } {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayNumber = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - dayNumber + 3)
  const firstThursday = new Date(day.getFullYear(), 0, 4)
  const firstThursdayDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDay + 3)
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / 604_800_000)
  return { year: day.getFullYear(), week }
}

function normalizeNotesRemoteCollaborationBaseUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

function normalizeNotesRemoteCollaborationPairingKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, '').slice(0, 240)
}

export function isNotesRemoteCollaborationPairingKey(value: string): boolean {
  return /^[a-zA-Z0-9._~:-]{16,240}$/.test(value)
}

export function createNotesRemoteCollaborationPairingInvite(
  options: CreateNotesRemoteCollaborationPairingInviteOptions,
): { invite: NotesRemoteCollaborationPairingInvite; encoded: string } {
  const providerUrl = normalizeNotesRemoteCollaborationBaseUrl(options.providerUrl)
  if (!isNotesRemoteCollaborationBaseUrl(providerUrl)) throw new Error('Remote collaboration invite needs an HTTP(S) provider URL')
  const pairingKey = normalizeNotesRemoteCollaborationPairingKey(options.pairingKey) || generateNotesPairingKey(options.randomBytes)
  if (!isNotesRemoteCollaborationPairingKey(pairingKey)) throw new Error('Remote collaboration invite needs a valid pairing key')
  const invite: NotesRemoteCollaborationPairingInvite = {
    protocol: 'claw-notes-collab-pairing',
    version: 1,
    providerUrl,
    pairingKey,
    deviceLabel: normalizePairingLabel(options.deviceLabel),
    createdAt: options.now ?? Date.now(),
    verifier: '',
  }
  invite.verifier = notesPairingVerifier(invite)
  return { invite, encoded: encodeNotesRemoteCollaborationPairingInvite(invite) }
}

export function encodeNotesRemoteCollaborationPairingInvite(invite: NotesRemoteCollaborationPairingInvite): string {
  return `clawpair:${base64UrlEncode(JSON.stringify(invite))}`
}

export function parseNotesRemoteCollaborationPairingInvite(value: string): NotesRemoteCollaborationPairingInvite {
  const trimmed = value.trim()
  const encoded = trimmed.startsWith('clawpair:') ? trimmed.slice('clawpair:'.length) : trimmed
  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlDecode(encoded))
  } catch {
    throw new Error('Pairing invite is not valid')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Pairing invite is not valid')
  const invite = parsed as Partial<NotesRemoteCollaborationPairingInvite>
  const normalized: NotesRemoteCollaborationPairingInvite = {
    protocol: invite.protocol === 'claw-notes-collab-pairing' ? invite.protocol : 'claw-notes-collab-pairing',
    version: invite.version === 1 ? 1 : 1,
    providerUrl: normalizeNotesRemoteCollaborationBaseUrl(invite.providerUrl),
    pairingKey: normalizeNotesRemoteCollaborationPairingKey(invite.pairingKey),
    deviceLabel: normalizePairingLabel(invite.deviceLabel),
    createdAt: Number(invite.createdAt || 0),
    verifier: typeof invite.verifier === 'string' ? invite.verifier : '',
  }
  if (invite.protocol !== 'claw-notes-collab-pairing' || invite.version !== 1) {
    throw new Error('Pairing invite uses an unsupported protocol')
  }
  if (!isNotesRemoteCollaborationBaseUrl(normalized.providerUrl)) throw new Error('Pairing invite has an invalid provider URL')
  if (!isNotesRemoteCollaborationPairingKey(normalized.pairingKey)) throw new Error('Pairing invite has an invalid key')
  if (normalized.verifier !== notesPairingVerifier(normalized)) throw new Error('Pairing invite verifier does not match')
  return normalized
}

export function isNotesRemoteCollaborationBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function notesRemoteCollaborationSetupStatus(
  preferences: Pick<
    NotesEditorPreferences,
    'remoteCollaborationEnabled' | 'remoteCollaborationBaseUrl' | 'remoteCollaborationPairingKey'
  >,
): NotesRemoteCollaborationSetupStatus {
  const normalized = normalizeNotesEditorPreferences(preferences)
  if (!normalized.remoteCollaborationEnabled) {
    return {
      state: 'disabled',
      ready: false,
      label: 'Local only',
      detail: 'Local-first editing is the default; remote sync only starts after you enable a paired provider.',
    }
  }
  if (!normalized.remoteCollaborationBaseUrl) {
    return {
      state: 'missing-provider',
      ready: false,
      label: 'Provider needed',
      detail: 'Add the ClawControl provider URL for the device that will relay collaboration events.',
    }
  }
  if (!isNotesRemoteCollaborationBaseUrl(normalized.remoteCollaborationBaseUrl)) {
    return {
      state: 'invalid-provider',
      ready: false,
      label: 'Provider invalid',
      detail: 'Use an HTTP(S) provider URL.',
    }
  }
  if (!normalized.remoteCollaborationPairingKey) {
    return {
      state: 'missing-key',
      ready: false,
      label: 'Pairing key needed',
      detail: 'Create or accept an invite to add pairing material before remote sync starts.',
    }
  }
  if (!isNotesRemoteCollaborationPairingKey(normalized.remoteCollaborationPairingKey)) {
    return {
      state: 'invalid-key',
      ready: false,
      label: 'Pairing key invalid',
      detail: 'Use a pairing key with 16+ safe characters.',
    }
  }
  return {
    state: 'ready',
    ready: true,
    label: 'Remote ready',
    detail: 'This vault can mirror collaboration events and CRDT snapshots to the paired provider while local saves stay primary.',
  }
}

export function markdownWidthPx(width: NotesMarkdownWidth): number {
  if (width === 'narrow') return 560
  if (width === 'wide') return 860
  return 680
}

export function markdownFontSizePx(size: NotesMarkdownFontSize): number {
  if (size === 'small') return 13
  if (size === 'large') return 16
  return 14.5
}

function isMarkdownWidth(value: unknown): value is NotesMarkdownWidth {
  return value === 'narrow' || value === 'normal' || value === 'wide'
}

function isMarkdownFontSize(value: unknown): value is NotesMarkdownFontSize {
  return value === 'small' || value === 'normal' || value === 'large'
}

function isDefaultMode(value: unknown): value is NotesDefaultMode {
  return value === 'doc' || value === 'source' || value === 'split' || value === 'read'
}

function isAppearanceMode(value: unknown): value is NotesAppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function generateNotesPairingKey(randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(24))
  return base64UrlEncode(String.fromCharCode(...bytes))
}

function normalizePairingLabel(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : 'ClawControl Notes'
}

function notesPairingVerifier(invite: Omit<NotesRemoteCollaborationPairingInvite, 'verifier'>): string {
  return checksumString([
    invite.protocol,
    String(invite.version),
    invite.providerUrl,
    invite.pairingKey,
    invite.deviceLabel,
    String(invite.createdAt),
  ].join('\n'))
}

function checksumString(content: string): string {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return atob(padded)
}
