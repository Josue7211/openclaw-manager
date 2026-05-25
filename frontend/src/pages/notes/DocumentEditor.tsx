import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Extension, Mark, Node as TiptapNode } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Blockquote from '@tiptap/extension-blockquote'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  Code,
  DotsThree,
  Eraser,
  FileText,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  MagnifyingGlass,
  Microphone,
  Minus,
  PaintBucket,
  Quotes,
  Table as TableIcon,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextH,
  TextItalic,
  TextStrikethrough,
  TextSubscript,
  TextSuperscript,
  TextUnderline,
} from '@phosphor-icons/react'
import type { NoteReviewMarker, NoteSelectionAnchor, VaultNote } from './types'
import { docToMarkdown, markdownToDoc, splitFrontmatter, type ProseMirrorDoc } from './markdownBridge'
import { documentPageSettings, setFrontmatterProperty, type DocumentMarginPreset, type DocumentPageColumns, type DocumentPageMode, type DocumentPageNumbers, type DocumentPageOrientation, type DocumentPageSize } from './export'
import { normalizeSelectionAnchor } from './reviewAnchors'
import { externalPreviewForHref, imagePreviewForTarget, notePreviewForTarget, noteTargetFromHref } from './noteLinkPreview'
import { NoteLinkPreviewTooltip, type NoteLinkPreviewState } from './NoteLinkPreviewTooltip'

type PagePreset = 'compact' | 'normal' | 'wide'
type PageTextField = 'header' | 'footer' | 'watermark'
type DocumentTextAlignment = 'left' | 'center' | 'right' | 'justify'
type RichBuildingBlock = 'meeting-notes' | 'decision-log'
type RichSmartInsert = RichBuildingBlock | 'today' | 'tomorrow' | 'placeholder'

interface RichBuildingBlockOption {
  id: string
  label: string
  detail: string
  kind: 'building-block' | 'date' | 'note' | 'tag' | 'file' | 'person' | 'place' | 'event' | 'placeholder'
  target?: string
}

interface RichBuildingBlockMenuState {
  query: string
  from: number
  to: number
  top: number
  left: number
  activeIndex: number
  options: RichBuildingBlockOption[]
}

const PAGE_PRESET_STORAGE_KEY = 'mc-notes-page-preset'
const PAGE_SIZE_STORAGE_KEY = 'mc-notes-page-size'
const PAGE_MARGIN_STORAGE_KEY = 'mc-notes-page-margins'
const PAGE_ORIENTATION_STORAGE_KEY = 'mc-notes-page-orientation'
const OUTLINE_OPEN_STORAGE_KEY = 'mc-notes-doc-outline-open'
const COMPACT_DOCUMENT_TOOLBAR_VIEWPORT_WIDTH = 760
const COMPACT_DOCUMENT_TOOLBAR_ACTUAL_WIDTH = 620
const MENU_VIEWPORT_MARGIN = 8
const MAX_TRACKED_CHANGE_PREVIEW_CHARS = 180
const DOCUMENT_FONT_SIZES = ['12px', '14px', '16px', '18px', '24px'] as const
const DOCUMENT_LINE_HEIGHTS = ['1.15', '1.5', '2'] as const
const DOCUMENT_FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Courier', value: 'Courier New' },
] as const
const RICH_BUILDING_BLOCK_OPTIONS: RichBuildingBlockOption[] = [
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    detail: 'Agenda, notes, and action items',
    kind: 'building-block',
  },
  {
    id: 'decision-log',
    label: 'Decision log',
    detail: 'Decision table with owner and status',
    kind: 'building-block',
  },
  {
    id: 'today',
    label: 'Today',
    detail: 'Insert today as a date',
    kind: 'date',
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    detail: 'Insert tomorrow as a date',
    kind: 'date',
  },
  {
    id: 'placeholder',
    label: 'Placeholder',
    detail: 'Insert template placeholder',
    kind: 'placeholder',
  },
]

const PEOPLE_PROPERTY_KEYS = ['author', 'owner', 'assignee', 'assignees', 'attendee', 'attendees', 'reviewer', 'reviewers', 'people']
const PLACE_PROPERTY_KEYS = ['location', 'locations', 'place', 'places', 'venue', 'venues', 'address', 'addresses', 'where']
const EVENT_PROPERTY_KEYS = ['event', 'events', 'meeting', 'meetings', 'calendar_event', 'calendar_events']

function propertyListValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap(item => propertyListValues(item))
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function viewportAnchoredMenuStyle(
  trigger: HTMLElement | null,
  menu: HTMLElement | null,
  fallbackWidth = 220,
): CSSProperties {
  if (typeof window === 'undefined' || !trigger) {
    return {
      position: 'absolute',
      top: 32,
      left: 0,
      right: 'auto',
    }
  }
  const triggerRect = trigger.getBoundingClientRect()
  const measuredWidth = menu?.getBoundingClientRect().width || fallbackWidth
  const width = Math.min(measuredWidth, window.innerWidth - MENU_VIEWPORT_MARGIN * 2)
  const alignRight = triggerRect.left + width > window.innerWidth - MENU_VIEWPORT_MARGIN
  const availableBelow = Math.max(160, window.innerHeight - triggerRect.bottom - MENU_VIEWPORT_MARGIN - 4)

  return {
    position: 'fixed',
    top: Math.min(triggerRect.bottom + 4, window.innerHeight - MENU_VIEWPORT_MARGIN),
    left: alignRight
      ? Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - width - MENU_VIEWPORT_MARGIN)
      : Math.max(MENU_VIEWPORT_MARGIN, triggerRect.left),
    right: 'auto',
    maxWidth: `min(260px, calc(100vw - ${MENU_VIEWPORT_MARGIN * 2}px))`,
    maxHeight: `min(340px, ${availableBelow}px)`,
  }
}

interface OutlineItem {
  id: string
  level: number
  text: string
  pos: number
}

interface FindRange {
  from: number
  to: number
}

interface FindHighlightState {
  ranges: FindRange[]
  activeIndex: number
}

interface DocumentReviewRange {
  id: string
  kind: NoteReviewMarker['kind']
  from: number
  to: number
  active: boolean
  trackedChange?: NoteReviewMarker['trackedChange']
}

interface DocumentReviewHighlightState {
  ranges: DocumentReviewRange[]
}

interface DocumentReviewRailItem {
  id: string
  kind: NoteReviewMarker['kind']
  quote: string
  active: boolean
  trackedChange?: NoteReviewMarker['trackedChange']
}

interface PageTextDialogState {
  field: PageTextField
  title: string
  value: string
}

interface LinkDialogState {
  value: string
}

function compactTrackedChangeText(value: string | undefined): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= MAX_TRACKED_CHANGE_PREVIEW_CHARS) return text
  return `${text.slice(0, MAX_TRACKED_CHANGE_PREVIEW_CHARS - 3).trimEnd()}...`
}

function createTrackedChangeWidget(range: DocumentReviewRange): HTMLElement {
  const element = document.createElement('span')
  const isDocumentReplacement = range.trackedChange?.type === 'replace_document'
  element.className = [
    'tiptap-review-tracked-insert',
    isDocumentReplacement ? 'tiptap-review-tracked-document' : '',
    range.active ? 'tiptap-review-active' : '',
  ].filter(Boolean).join(' ')
  element.setAttribute('data-review-id', range.id)
  element.setAttribute('contenteditable', 'false')
  element.textContent = `${isDocumentReplacement ? 'Replace document' : '+'} ${compactTrackedChangeText(range.trackedChange?.after)}`
  return element
}

function trackedChangeRailLabel(item: DocumentReviewRailItem): string {
  const change = item.trackedChange
  if (!change || item.kind !== 'suggestion') return `${item.kind === 'comment' ? 'Comment' : 'Suggestion'} on ${item.quote}`
  const after = compactTrackedChangeText(change.after)
  if (change.type === 'replace' && after) return `Suggestion replacing ${item.quote} with ${after}`
  if (change.type === 'insert' && after) return `Suggestion inserting ${after}`
  if (change.type === 'replace_document') return 'Suggestion replacing the document'
  return `Suggestion on ${item.quote}`
}

interface ImageInsertDialogState {
  src: string
  alt: string
  title: string
}

interface ImageSettingsDialogState {
  alt: string
  title: string
  width: string
}

interface SelectedImageState {
  pos: number
  settings: ImageSettingsDialogState
}

interface VoiceTypingStatus {
  tone: 'listening' | 'error'
  message: string
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionErrorLike {
  error?: string
  message?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike
}

function speechRecognitionConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as SpeechRecognitionWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function speechRecognitionTranscript(event: SpeechRecognitionEventLike): string {
  const result = event.results[event.resultIndex]
  return result?.[0]?.transcript?.trim() ?? ''
}

const VOICE_TYPING_COMMANDS: Record<string, string> = {
  'period': '.',
  'full stop': '.',
  'comma': ',',
  'question mark': '?',
  'exclamation point': '!',
  'exclamation mark': '!',
  'colon': ':',
  'semicolon': ';',
  'dash': '-',
  'hyphen': '-',
  'slash': '/',
  'open parenthesis': '(',
  'close parenthesis': ')',
  'open quote': '"',
  'close quote': '"',
}

function normalizeVoiceTypingTranscript(transcript: string): string {
  const words = transcript.trim().split(/\s+/).filter(Boolean)
  let output = ''
  let index = 0

  const appendWord = (word: string) => {
    if (output && !/[\s("\-\/]$/.test(output)) output += ' '
    output += word
  }

  const appendPunctuation = (punctuation: string) => {
    if (punctuation === '(' || punctuation === '"') {
      if (output && !/\s$/.test(output)) output += ' '
      output += punctuation
      return
    }
    if (punctuation === '-' || punctuation === '/') {
      output = output.trimEnd()
      output += punctuation
      return
    }
    output = output.trimEnd()
    output += punctuation
  }

  while (index < words.length) {
    const current = words[index]?.toLowerCase()
    const threeWordCommand = words.slice(index, index + 3).join(' ').toLowerCase()
    const twoWordCommand = words.slice(index, index + 2).join(' ').toLowerCase()

    if (threeWordCommand === 'start new paragraph') {
      output = `${output.trimEnd()}\n\n`
      index += 3
      continue
    }
    if (twoWordCommand === 'new paragraph') {
      output = `${output.trimEnd()}\n\n`
      index += 2
      continue
    }
    if (twoWordCommand === 'new line') {
      output = `${output.trimEnd()}\n`
      index += 2
      continue
    }
    if (current === 'newline') {
      output = `${output.trimEnd()}\n`
      index += 1
      continue
    }

    const command = VOICE_TYPING_COMMANDS[threeWordCommand] ?? VOICE_TYPING_COMMANDS[twoWordCommand] ?? VOICE_TYPING_COMMANDS[current ?? '']
    if (command) {
      appendPunctuation(command)
      index += VOICE_TYPING_COMMANDS[threeWordCommand] ? 3 : VOICE_TYPING_COMMANDS[twoWordCommand] ? 2 : 1
      continue
    }

    appendWord(words[index] ?? '')
    index += 1
  }

  return output.trim()
}

function normalizedVoiceCommand(transcript: string): string {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/[.?!]+$/g, '')
    .replace(/\s+/g, ' ')
}

function deletePreviousVoiceWord(editor: Editor): boolean {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (!empty) return editor.chain().focus().deleteRange({ from, to }).run()

  const textBeforeCursor = state.doc.textBetween(0, from, '\n', '\n')
  const match = textBeforeCursor.match(/\s*\S+\s*$/)
  if (!match) return false

  return editor.chain().focus().deleteRange({ from: Math.max(1, from - match[0].length), to: from }).run()
}

function applyVoiceTypingEditorCommand(editor: Editor, transcript: string): boolean {
  switch (normalizedVoiceCommand(transcript)) {
    case 'undo':
      return editor.chain().focus().undo().run()
    case 'redo':
      return editor.chain().focus().redo().run()
    case 'select all':
      return editor.chain().focus().selectAll().run()
    case 'delete last word':
    case 'delete previous word':
      return deletePreviousVoiceWord(editor)
    default:
      return false
  }
}

function todayFormatted(): string {
  return dateOffsetFormatted(0)
}

function dateOffsetFormatted(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export interface DocumentEditorProps {
  markdown: string
  noteId: string
  allNotes: VaultNote[]
  mode: 'doc' | 'split' | 'read'
  onMarkdownChange: (markdown: string) => void
  onWikilinkOpen: (link: string) => void
  onAttachmentUpload?: (file: File) => Promise<{ id: string; mime: string; size: number; created_at: number }>
  onSelectionChange?: (anchor: NoteSelectionAnchor) => void
  reviewMarkers?: NoteReviewMarker[]
  activeReviewId?: string | null
  onReviewMarkerSelect?: (id: string) => void
}

const documentFindHighlightKey = new PluginKey<FindHighlightState>('documentFindHighlight')
const documentReviewHighlightKey = new PluginKey<DocumentReviewHighlightState>('documentReviewHighlight')

const DocumentFindHighlight = Extension.create({
  name: 'documentFindHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindHighlightState>({
        key: documentFindHighlightKey,
        state: {
          init() {
            return { ranges: [], activeIndex: -1 }
          },
          apply(transaction, value) {
            return transaction.getMeta(documentFindHighlightKey) ?? value
          },
        },
        props: {
          decorations(state) {
            const highlightState = documentFindHighlightKey.getState(state)
            if (!highlightState?.ranges.length) return null
            return DecorationSet.create(
              state.doc,
              highlightState.ranges.map((range, index) =>
                Decoration.inline(range.from, range.to, {
                  class: index === highlightState.activeIndex
                    ? 'tiptap-find-match tiptap-find-match-active'
                    : 'tiptap-find-match',
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})

const DocumentReviewHighlight = Extension.create({
  name: 'documentReviewHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DocumentReviewHighlightState>({
        key: documentReviewHighlightKey,
        state: {
          init() {
            return { ranges: [] }
          },
          apply(transaction, value) {
            return transaction.getMeta(documentReviewHighlightKey) ?? value
          },
        },
        props: {
          decorations(state) {
            const highlightState = documentReviewHighlightKey.getState(state)
            if (!highlightState?.ranges.length) return null
            const decorations: Decoration[] = []
            for (const range of highlightState.ranges) {
              const change = range.trackedChange
              const isReplacement = range.kind === 'suggestion' && change?.type === 'replace' && range.to > range.from
              const isInsertion = range.kind === 'suggestion' && (change?.type === 'insert' || change?.type === 'replace' || change?.type === 'replace_document')
              if (range.to > range.from) {
                decorations.push(
                  Decoration.inline(range.from, range.to, {
                    class: [
                      range.kind === 'comment' ? 'tiptap-review-comment' : 'tiptap-review-suggestion',
                      isReplacement ? 'tiptap-review-tracked-delete' : '',
                      range.active ? 'tiptap-review-active' : '',
                    ].filter(Boolean).join(' '),
                    'data-review-id': range.id,
                  }),
                )
              }
              if (isInsertion && change.after?.trim()) {
                decorations.push(
                  Decoration.widget(range.to, () => createTrackedChangeWidget(range), {
                    side: 1,
                    key: `tracked-change-${range.id}`,
                  }),
                )
              }
            }
            return DecorationSet.create(
              state.doc,
              decorations,
            )
          },
        },
      }),
    ]
  },
})

const PageBreak = TiptapNode.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },

  renderHTML() {
    return ['div', { 'data-type': 'page-break', class: 'tiptap-page-break' }]
  },
})

const NoteEmbed = TiptapNode.create({
  name: 'noteEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      target: { default: '' },
      title: { default: '' },
      body: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="note-embed"]' }]
  },

  renderHTML({ node }) {
    const title = String(node.attrs.title || node.attrs.target || 'Embedded note')
    const target = String(node.attrs.target || '')
    const body = String(node.attrs.body || '')
    return [
      'aside',
      {
        'data-type': 'note-embed',
        'data-target': target,
        class: 'tiptap-note-embed',
        contenteditable: 'false',
      },
      ['div', { class: 'tiptap-note-embed-title' }, title],
      ['pre', { class: 'tiptap-note-embed-body' }, body],
    ]
  },
})

const FontSizeStyle = Extension.create({
  name: 'fontSizeStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: Record<string, unknown>) => {
              const fontSize = typeof attributes.fontSize === 'string' ? attributes.fontSize.trim() : ''
              return fontSize ? { style: `font-size: ${fontSize}` } : {}
            },
          },
          fontFamily: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontFamily || null,
            renderHTML: (attributes: Record<string, unknown>) => {
              const fontFamily = typeof attributes.fontFamily === 'string' ? attributes.fontFamily.trim() : ''
              return fontFamily ? { style: `font-family: ${fontFamily}` } : {}
            },
          },
        },
      },
    ]
  },
})

const DocumentBlockStyle = Extension.create({
  name: 'documentBlockStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
            renderHTML: (attributes: Record<string, unknown>) => {
              const lineHeight = typeof attributes.lineHeight === 'string' ? attributes.lineHeight.trim() : ''
              return lineHeight ? { style: `line-height: ${lineHeight}` } : {}
            },
          },
        },
      },
    ]
  },
})

const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',

  parseHTML() {
    return [{ tag: 'sup' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', HTMLAttributes, 0]
  },
})

const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',

  parseHTML() {
    return [{ tag: 'sub' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sub', HTMLAttributes, 0]
  },
})

const SmartChip = Mark.create({
  name: 'smartChip',
  inclusive: false,

  addAttributes() {
    return {
      kind: {
        default: 'entity',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-kind') || 'entity',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-kind': typeof attributes.kind === 'string' ? attributes.kind : 'entity',
        }),
      },
      label: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-label') || element.textContent || '',
        renderHTML: (attributes: Record<string, unknown>) => {
          const label = typeof attributes.label === 'string' ? attributes.label : ''
          return label ? { 'data-label': label } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="smart-chip"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-type': 'smart-chip',
        class: ['tiptap-smart-chip', HTMLAttributes.class].filter(Boolean).join(' '),
      },
      0,
    ]
  },
})

const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute('width') || element.style.width
          const match = value?.match(/^(\d{2,4})/)
          return match ? Number(match[1]) : null
        },
        renderHTML: (attributes) => {
          const width = normalizeImageWidth(attributes.width)
          return width ? { width, style: `width: ${width}px; max-width: 100%;` } : {}
        },
      },
    }
  },
})

function imageSettingsFromAttrs(attrs: Record<string, unknown>): ImageSettingsDialogState {
  return {
    alt: String(attrs.alt || ''),
    title: String(attrs.title || ''),
    width: attrs.width ? String(attrs.width) : '',
  }
}

function findFirstImageState(editor: Editor): SelectedImageState | null {
  let selected: SelectedImageState | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true
    selected = {
      pos,
      settings: imageSettingsFromAttrs(node.attrs),
    }
    return false
  })
  return selected
}

function documentHasImage(editor: Editor): boolean {
  let hasImage = false
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'image') return true
    hasImage = true
    return false
  })
  return hasImage
}

function paragraphNode(text = '') {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' }
}

function headingNode(level: 1 | 2 | 3, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] }
}

function bulletItemNode(text: string) {
  return {
    type: 'listItem',
    content: [paragraphNode(text)],
  }
}

function taskItemNode(text: string) {
  return {
    type: 'taskItem',
    attrs: { checked: false },
    content: [paragraphNode(text)],
  }
}

function tableCellNode(text: string, header = false) {
  return {
    type: header ? 'tableHeader' : 'tableCell',
    content: [paragraphNode(text)],
  }
}

function richBuildingBlockContent(block: RichBuildingBlock) {
  if (block === 'meeting-notes') {
    return [
      headingNode(2, 'Meeting notes'),
      paragraphNode(`Date: ${todayFormatted()}`),
      paragraphNode('Attendees: Name, Name'),
      headingNode(3, 'Agenda'),
      { type: 'bulletList', content: [bulletItemNode('Topic')] },
      headingNode(3, 'Notes'),
      { type: 'bulletList', content: [bulletItemNode('')] },
      headingNode(3, 'Action items'),
      { type: 'taskList', content: [taskItemNode('Owner - Task')] },
    ]
  }

  return [
    headingNode(2, 'Decision log'),
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            tableCellNode('Date', true),
            tableCellNode('Decision', true),
            tableCellNode('Owner', true),
            tableCellNode('Status', true),
          ],
        },
        {
          type: 'tableRow',
          content: [
            tableCellNode(todayFormatted()),
            tableCellNode('Decision'),
            tableCellNode('Owner'),
            tableCellNode('Proposed'),
          ],
        },
      ],
    },
  ]
}

function richBuildingBlockInsertionContent(block: RichBuildingBlock) {
  return [...richBuildingBlockContent(block), paragraphNode()]
}

function matchingRichSmartInsertOptions(query: string, options: RichBuildingBlockOption[]): RichBuildingBlockOption[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return options
  return options
    .map((option, index) => {
      const id = option.id.toLowerCase()
      const label = option.label.toLowerCase()
      const rank =
        id.startsWith(normalized) || label.startsWith(normalized)
          ? 0
          : label.includes(normalized)
            ? 1
            : -1
      return { option, index, rank }
    })
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.option)
}

function richSmartInsertTrigger(
  editor: Editor,
  options: RichBuildingBlockOption[],
): { query: string; from: number; to: number; options: RichBuildingBlockOption[] } | null {
  const { selection } = editor.state
  if (!selection.empty) return null
  const { $from } = selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = textBefore.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match) return null
  const query = match[1] ?? ''
  const matches = matchingRichSmartInsertOptions(query, options)
  if (matches.length === 0) return null
  const triggerLength = query.length + 1
  return {
    query,
    from: $from.pos - triggerLength,
    to: $from.pos,
    options: matches,
  }
}

function richSmartInsertText(insert: RichSmartInsert): string {
  if (insert === 'today') return todayFormatted()
  if (insert === 'tomorrow') return dateOffsetFormatted(1)
  if (insert === 'placeholder') return '{{placeholder}}'
  return ''
}

function richSmartChipText(text: string, kind: 'date' | 'tag' | 'person' | 'place' | 'event' | 'placeholder') {
  return {
    type: 'text',
    text,
    marks: [{ type: 'smartChip', attrs: { kind, label: text } }],
  }
}

function isRichImageAttachment(target: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(target)
}

function expandRichSmartInsertShortcut(editor: Editor): boolean {
  const { selection } = editor.state
  if (!selection.empty) return false
  const { $from } = selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = textBefore.match(/(?:^|\s)@(meeting-notes|decision-log|today|tomorrow|placeholder)$/)
  const insert = match?.[1] as RichSmartInsert | undefined
  if (!insert) return false

  const triggerLength = `@${insert}`.length
  const from = $from.pos - triggerLength
  const to = $from.pos
  const option = RICH_BUILDING_BLOCK_OPTIONS.find((item) => item.id === insert)
  if (!option) return false
  replaceRichSmartInsertTrigger(editor, from, to, option)
  return true
}

function insertRichBuildingBlock(editor: Editor, block: RichBuildingBlock) {
  editor.chain().focus().insertContent(richBuildingBlockInsertionContent(block)).run()
}

function replaceRichSmartInsertTrigger(editor: Editor, from: number, to: number, option: RichBuildingBlockOption) {
  const chain = editor.chain().focus().deleteRange({ from, to })
  if (option.kind === 'building-block') {
    chain.insertContent(richBuildingBlockInsertionContent(option.id as RichBuildingBlock)).run()
    return
  }
  if (option.kind === 'note') {
    const target = option.target || option.label
    chain.insertContent({
      type: 'text',
      text: option.label,
      marks: [{ type: 'link', attrs: { href: `#note:${encodeURIComponent(target)}` } }],
    }).run()
    return
  }
  if (option.kind === 'tag') {
    chain.insertContent(richSmartChipText(`#${option.target || option.label}`, 'tag')).run()
    return
  }
  if (option.kind === 'file') {
    const target = option.target || option.label
    if (isRichImageAttachment(target)) {
      chain.insertContent({
        type: 'image',
        attrs: {
          src: `/api/vault/local/media?id=${encodeURIComponent(target)}`,
          alt: option.label,
          title: target,
        },
      }).run()
      return
    }
    chain.insertContent({
      type: 'text',
      text: option.label,
      marks: [{ type: 'link', attrs: { href: `/api/vault/local/media?id=${encodeURIComponent(target)}` } }],
    }).run()
    return
  }
  if (option.kind === 'person') {
    chain.insertContent(richSmartChipText(`@${option.target || option.label}`, 'person')).run()
    return
  }
  if (option.kind === 'place') {
    chain.insertContent(richSmartChipText(option.target || option.label, 'place')).run()
    return
  }
  if (option.kind === 'event') {
    chain.insertContent(richSmartChipText(option.target || option.label, 'event')).run()
    return
  }
  if (option.kind === 'placeholder') {
    chain.insertContent(richSmartChipText(richSmartInsertText('placeholder'), 'placeholder')).run()
    return
  }
  chain.insertContent(richSmartChipText(richSmartInsertText(option.id as RichSmartInsert), 'date')).run()
}

const extensions = [
  StarterKit.configure({
    blockquote: false,
    link: false,
  }),
  Blockquote.extend({
    addAttributes() {
      return {
        calloutType: {
          default: null,
          parseHTML: element => element.getAttribute('data-callout-type'),
          renderHTML: attributes => {
            const type = typeof attributes.calloutType === 'string' ? attributes.calloutType : ''
            if (!type) return {}
            return {
              'data-callout-type': type,
              class: `tiptap-note-callout tiptap-note-callout-${type}`,
            }
          },
        },
        calloutTitle: {
          default: null,
          parseHTML: element => element.getAttribute('data-callout-title'),
          renderHTML: attributes => {
            const title = typeof attributes.calloutTitle === 'string' ? attributes.calloutTitle : ''
            return title ? { 'data-callout-title': title } : {}
          },
        },
        calloutFold: {
          default: null,
          parseHTML: element => element.getAttribute('data-callout-fold'),
          renderHTML: attributes => {
            const fold = attributes.calloutFold === 'collapsed' || attributes.calloutFold === 'expanded'
              ? attributes.calloutFold
              : ''
            return fold ? { 'data-callout-fold': fold } : {}
          },
        },
      }
    },
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: {
      rel: 'noopener noreferrer',
      target: '_blank',
    },
  }),
  DocumentImage.configure({ allowBase64: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: 'Start writing...' }),
  TextStyle,
  FontSizeStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Underline,
  Superscript,
  Subscript,
  SmartChip,
  Typography,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  DocumentBlockStyle,
  PageBreak,
  NoteEmbed,
  DocumentFindHighlight,
  DocumentReviewHighlight,
]

export default function DocumentEditor({
  markdown,
  noteId,
  allNotes,
  mode: _mode,
  onMarkdownChange,
  onWikilinkOpen,
  onAttachmentUpload,
  onSelectionChange,
  reviewMarkers = [],
  activeReviewId = null,
  onReviewMarkerSelect,
}: DocumentEditorProps) {
  const frontmatterRef = useRef(splitFrontmatter(markdown).frontmatter)
  const lastMarkdownRef = useRef(markdown)
  const rootRef = useRef<HTMLDivElement>(null)
  const [pagePreset, setPagePreset] = useState<PagePreset>(() => {
    const stored = localStorage.getItem(PAGE_PRESET_STORAGE_KEY)
    return stored === 'compact' || stored === 'wide' ? stored : 'normal'
  })
  const [pageMode, setPageMode] = useState<DocumentPageMode>(() => documentPageSettings(markdown).mode)
  const [pageSize, setPageSize] = useState<DocumentPageSize>(() => documentPageSettings(markdown).size)
  const [pageMargins, setPageMargins] = useState<DocumentMarginPreset>(() => documentPageSettings(markdown).margins)
  const [pageOrientation, setPageOrientation] = useState<DocumentPageOrientation>(() => documentPageSettings(markdown).orientation)
  const [pageHeader, setPageHeader] = useState(() => documentPageSettings(markdown).header)
  const [pageFooter, setPageFooter] = useState(() => documentPageSettings(markdown).footer)
  const [pageWatermark, setPageWatermark] = useState(() => documentPageSettings(markdown).watermark)
  const [pageNumbers, setPageNumbers] = useState<DocumentPageNumbers>(() => documentPageSettings(markdown).pageNumbers)
  const [pageColumns, setPageColumns] = useState<DocumentPageColumns>(() => documentPageSettings(markdown).columns)
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem(OUTLINE_OPEN_STORAGE_KEY) === 'true')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [docVersion, setDocVersion] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(-1)
  const [findMatchCase, setFindMatchCase] = useState(false)
  const [replaceText, setReplaceText] = useState('')
  const [linkPreview, setLinkPreview] = useState<NoteLinkPreviewState | null>(null)
  const [pageTextDialog, setPageTextDialog] = useState<PageTextDialogState | null>(null)
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null)
  const [imageInsertDialog, setImageInsertDialog] = useState<ImageInsertDialogState | null>(null)
  const [imageSettingsDialog, setImageSettingsDialog] = useState<ImageSettingsDialogState | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceTypingStatus | null>(null)
  const [hasImageContext, setHasImageContext] = useState(false)
  const [buildingBlockMenu, setBuildingBlockMenu] = useState<RichBuildingBlockMenuState | null>(null)
  const buildingBlockMenuRef = useRef<RichBuildingBlockMenuState | null>(null)
  const selectedImageRef = useRef<SelectedImageState | null>(null)
  const voiceRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const initialDoc = useMemo(
    () => markdownToDoc(markdown, { noteEmbeds: { notes: allNotes, currentId: noteId } }),
    [allNotes, markdown, noteId],
  )
  const richSmartInsertOptions = useMemo<RichBuildingBlockOption[]>(() => {
    const seen = new Set<string>()
    const seenTags = new Set<string>()
    const seenPeople = new Set<string>()
    const seenPlaces = new Set<string>()
    const seenEvents = new Set<string>()
    const tagOptions: RichBuildingBlockOption[] = []
    const personOptions: RichBuildingBlockOption[] = []
    const placeOptions: RichBuildingBlockOption[] = []
    const eventOptions: RichBuildingBlockOption[] = []
    const noteOptions = allNotes.flatMap<RichBuildingBlockOption>((note) => {
      for (const key of PEOPLE_PROPERTY_KEYS) {
        for (const rawName of propertyListValues(note.properties?.[key])) {
          const name = rawName.replace(/^@/, '').trim()
          if (!name || name.length > 80) continue
          const normalized = name.toLowerCase()
          if (seenPeople.has(normalized)) continue
          seenPeople.add(normalized)
          personOptions.push({
            id: `person:${name}`,
            label: name,
            detail: `Person from ${key}`,
            kind: 'person',
            target: name,
          })
        }
      }
      for (const key of EVENT_PROPERTY_KEYS) {
        for (const rawEvent of propertyListValues(note.properties?.[key])) {
          const eventName = rawEvent.trim()
          if (!eventName || eventName.length > 120) continue
          const normalized = eventName.toLowerCase()
          if (seenEvents.has(normalized)) continue
          seenEvents.add(normalized)
          eventOptions.push({
            id: `event:${eventName}`,
            label: eventName,
            detail: `Event from ${key}`,
            kind: 'event',
            target: eventName,
          })
        }
      }
      for (const key of PLACE_PROPERTY_KEYS) {
        for (const rawPlace of propertyListValues(note.properties?.[key])) {
          const place = rawPlace.trim()
          if (!place || place.length > 120) continue
          const normalized = place.toLowerCase()
          if (seenPlaces.has(normalized)) continue
          seenPlaces.add(normalized)
          placeOptions.push({
            id: `place:${place}`,
            label: place,
            detail: `Place from ${key}`,
            kind: 'place',
            target: place,
          })
        }
      }
      for (const rawTag of note.tags ?? []) {
        const tag = rawTag.trim().replace(/^#/, '')
        if (!tag || /\s/.test(tag)) continue
        const normalized = tag.toLowerCase()
        if (seenTags.has(normalized)) continue
        seenTags.add(normalized)
        tagOptions.push({
          id: `tag:${tag}`,
          label: tag,
          detail: `Tag #${tag}`,
          kind: 'tag',
          target: tag,
        })
      }
      if (note.type === 'attachment') {
        const title = (note.title || note._id).trim()
        const target = note._id?.trim() || [note.folder, title].filter(Boolean).join('/')
        if (!title || !target) return []
        const key = `file\u0000${target.toLowerCase()}`
        if (seen.has(key)) return []
        seen.add(key)
        return [{
          id: `file:${target}`,
          label: title,
          detail: note.folder ? `File in ${note.folder}` : 'Vault file',
          kind: 'file',
          target,
        }]
      }
      if (note.type !== 'note' || note._id === noteId) return []
      const title = (note.title || note._id).trim()
      if (!title) return []
      const options: RichBuildingBlockOption[] = []
      const addOption = (label: string, detail: string, target: string, idPrefix: string) => {
        const cleanLabel = label.trim()
        if (!cleanLabel) return
        const key = `${cleanLabel.toLowerCase()}\u0000${target.toLowerCase()}`
        if (seen.has(key)) return
        seen.add(key)
        options.push({
          id: `${idPrefix}:${target}:${cleanLabel}`,
          label: cleanLabel,
          detail,
          kind: 'note',
          target,
        })
      }

      addOption(title, note.folder ? `Link note in ${note.folder}` : 'Link note', title, 'note')
      for (const alias of note.aliases ?? []) {
        const trimmedAlias = alias.trim()
        if (!trimmedAlias || trimmedAlias === title) continue
        addOption(trimmedAlias, `Alias for ${title}`, title, 'note-alias')
      }
      return options
    })
    return [...RICH_BUILDING_BLOCK_OPTIONS, ...noteOptions, ...tagOptions, ...personOptions, ...placeOptions, ...eventOptions]
  }, [allNotes, noteId])
  const setBuildingBlockMenuState = useCallback((next: RichBuildingBlockMenuState | null) => {
    buildingBlockMenuRef.current = next
    setBuildingBlockMenu(next)
  }, [])
  const refreshBuildingBlockMenu = useCallback(
    (editor: Editor, activeIndex = 0) => {
      const trigger = richSmartInsertTrigger(editor, richSmartInsertOptions)
      if (!trigger) {
        setBuildingBlockMenuState(null)
        return
      }
      const coords = editor.view.coordsAtPos(trigger.to)
      const rootRect = rootRef.current?.getBoundingClientRect()
      const top = rootRect ? Math.max(40, coords.bottom - rootRect.top + 6) : 44
      const left = rootRect && rootRect.width > 0
        ? Math.min(Math.max(12, coords.left - rootRect.left), Math.max(12, rootRect.width - 260))
        : 56
      setBuildingBlockMenuState({
        ...trigger,
        top,
        left,
        activeIndex: Math.min(activeIndex, trigger.options.length - 1),
      })
    },
    [richSmartInsertOptions, setBuildingBlockMenuState],
  )
  const applyBuildingBlockMenuOption = useCallback(
    (editor: Editor, option: RichBuildingBlockOption, from: number, to: number) => {
      replaceRichSmartInsertTrigger(editor, from, to, option)
      setBuildingBlockMenuState(null)
    },
    [setBuildingBlockMenuState],
  )

  const editor = useEditor({
    extensions,
    content: initialDoc,
    editorProps: {
      attributes: {
        class: 'tiptap-note-doc rich-note-doc',
        spellcheck: 'true',
        role: 'textbox',
        'aria-label': 'Document editor',
      },
      handleClickOn(_view, _pos, node, nodePos, event) {
        const target = event.target as HTMLElement
        const noteEmbed = target.closest('aside[data-type="note-embed"]')
        if (noteEmbed instanceof HTMLElement) {
          const noteTarget = noteEmbed.dataset.target?.trim()
          if (!noteTarget) return false
          event.preventDefault()
          onWikilinkOpen(noteTarget)
          return true
        }
        const link = target.closest('a[href^="#note:"]')
        if (link instanceof HTMLAnchorElement) {
          const noteTarget = noteTargetFromHref(link.getAttribute('href'))
          if (!noteTarget) return false
          event.preventDefault()
          onWikilinkOpen(noteTarget)
          return true
        }
        if (node.type.name === 'image') {
          selectedImageRef.current = {
            pos: nodePos,
            settings: imageSettingsFromAttrs(node.attrs),
          }
          setHasImageContext(true)
          return false
        }
        return false
      },
      handlePaste(_view, event) {
        const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/'))
        if (!file || !onAttachmentUpload) return false
        event.preventDefault()
        void insertUploadedImage(editor, file, onAttachmentUpload)
        return true
      },
      handleDrop(_view, event) {
        const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith('image/'))
        if (!file || !onAttachmentUpload) return false
        event.preventDefault()
        void insertUploadedImage(editor, file, onAttachmentUpload)
        return true
      },
      handleKeyDown(_view, event) {
        const menu = buildingBlockMenuRef.current
        if (menu && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const direction = event.key === 'ArrowDown' ? 1 : -1
            const nextIndex = (menu.activeIndex + direction + menu.options.length) % menu.options.length
            setBuildingBlockMenuState({ ...menu, activeIndex: nextIndex })
            return true
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            const option = menu.options[menu.activeIndex]
            if (editor && option) applyBuildingBlockMenuOption(editor, option, menu.from, menu.to)
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setBuildingBlockMenuState(null)
            return true
          }
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          (event.key === 'Enter' || event.key === 'Tab' || event.key === ' ')
        ) {
          if (editor && expandRichSmartInsertShortcut(editor)) {
            event.preventDefault()
            return true
          }
        }
        if (!(event.metaKey || event.ctrlKey)) return false
        const key = event.key.toLowerCase()
        if (event.altKey && !event.shiftKey) {
          if (key === '0') {
            event.preventDefault()
            editor?.chain().focus().setParagraph().run()
            return true
          }
          if (key === '1' || key === '2' || key === '3') {
            event.preventDefault()
            editor?.chain().focus().toggleHeading({ level: Number(key) as 1 | 2 | 3 }).run()
            return true
          }
          return false
        }
        if (event.altKey) return false
        if (key === '\\') {
          event.preventDefault()
          clearTextFormatting(editor)
          return true
        }
        if (key === '.') {
          event.preventDefault()
          editor?.chain().focus().toggleMark('superscript').run()
          return true
        }
        if (key === ',') {
          event.preventDefault()
          editor?.chain().focus().toggleMark('subscript').run()
          return true
        }
        if (event.shiftKey && key === 'l') {
          event.preventDefault()
          editor?.chain().focus().setTextAlign('left').run()
          return true
        }
        if (event.shiftKey && key === 'e') {
          event.preventDefault()
          editor?.chain().focus().setTextAlign('center').run()
          return true
        }
        if (event.shiftKey && key === 'r') {
          event.preventDefault()
          editor?.chain().focus().setTextAlign('right').run()
          return true
        }
        if (event.shiftKey && key === 'j') {
          event.preventDefault()
          editor?.chain().focus().setTextAlign('justify').run()
          return true
        }
        if (event.shiftKey && key === '7') {
          event.preventDefault()
          editor?.chain().focus().toggleOrderedList().run()
          return true
        }
        if (event.shiftKey && key === '8') {
          event.preventDefault()
          editor?.chain().focus().toggleBulletList().run()
          return true
        }
        if (event.shiftKey && key === '9') {
          event.preventDefault()
          editor?.chain().focus().toggleTaskList().run()
          return true
        }
        if (key === 'b') {
          event.preventDefault()
          editor?.chain().focus().toggleBold().run()
          return true
        }
        if (key === 'i') {
          event.preventDefault()
          editor?.chain().focus().toggleItalic().run()
          return true
        }
        if (key === 'u') {
          event.preventDefault()
          editor?.chain().focus().toggleUnderline().run()
          return true
        }
        if (key === 'k') {
          event.preventDefault()
          setLinkDialog({ value: String(editor?.getAttributes('link').href || '') })
          return true
        }
        if (event.shiftKey && (key === 'x' || key === 's')) {
          event.preventDefault()
          editor?.chain().focus().toggleStrike().run()
          return true
        }
        return false
      },
    },
    onCreate({ editor }) {
      setOutline(collectOutline(editor))
      refreshBuildingBlockMenu(editor)
    },
    onUpdate({ editor }) {
      const next = docToMarkdown(editor.getJSON() as ProseMirrorDoc, frontmatterRef.current)
      lastMarkdownRef.current = next
      setOutline(collectOutline(editor))
      setDocVersion((value) => value + 1)
      refreshBuildingBlockMenu(editor, buildingBlockMenuRef.current?.activeIndex ?? 0)
      onMarkdownChange(next)
    },
    onSelectionUpdate({ editor }) {
      if (editor.isActive('image')) {
        selectedImageRef.current = {
          pos: editor.state.selection.from,
          settings: imageSettingsFromAttrs(editor.getAttributes('image')),
        }
        setHasImageContext(true)
      }
      const { from, to } = editor.state.selection
      const start = Math.min(from, to)
      const end = Math.max(from, to)
      onSelectionChange?.({
        scope: start === end ? 'cursor' : 'selection',
        mode: 'document',
        start,
        end,
        quote: start === end ? '' : editor.state.doc.textBetween(start, end, '\n'),
      })
      refreshBuildingBlockMenu(editor, buildingBlockMenuRef.current?.activeIndex ?? 0)
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    frontmatterRef.current = splitFrontmatter(markdown).frontmatter
    if (!editor || markdown === lastMarkdownRef.current) return
    const nextDoc = markdownToDoc(markdown, { noteEmbeds: { notes: allNotes, currentId: noteId } })
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastMarkdownRef.current = markdown
  }, [allNotes, editor, markdown, noteId])

  useEffect(() => {
    const page = documentPageSettings(markdown)
    setPageMode(page.mode)
    setPageSize(page.size)
    setPageMargins(page.margins)
    setPageOrientation(page.orientation)
    setPageHeader(page.header)
    setPageFooter(page.footer)
    setPageWatermark(page.watermark)
    setPageNumbers(page.pageNumbers)
    setPageColumns(page.columns)
    const stored = localStorage.getItem(PAGE_PRESET_STORAGE_KEY)
    setPagePreset(stored === 'compact' || stored === 'wide' ? stored : 'normal')
  }, [noteId])

  useEffect(() => {
    localStorage.setItem(PAGE_PRESET_STORAGE_KEY, pagePreset)
  }, [pagePreset])

  useEffect(() => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, pageSize)
  }, [pageSize])

  useEffect(() => {
    localStorage.setItem(PAGE_MARGIN_STORAGE_KEY, pageMargins)
  }, [pageMargins])

  useEffect(() => {
    localStorage.setItem(PAGE_ORIENTATION_STORAGE_KEY, pageOrientation)
  }, [pageOrientation])

  const updatePageProperty = useCallback((key: 'document_page_mode' | 'page_size' | 'page_margins' | 'page_orientation' | 'document_header' | 'document_footer' | 'document_watermark' | 'document_page_numbers' | 'document_columns', value: string) => {
    const next = setFrontmatterProperty(lastMarkdownRef.current, key, value)
    frontmatterRef.current = splitFrontmatter(next).frontmatter
    lastMarkdownRef.current = next
    onMarkdownChange(next)
  }, [onMarkdownChange])

  const handlePageModeChange = useCallback((value: DocumentPageMode) => {
    setPageMode(value)
    updatePageProperty('document_page_mode', value === 'pages' ? '' : value)
  }, [updatePageProperty])

  const handlePageSizeChange = useCallback((value: DocumentPageSize) => {
    setPageSize(value)
    updatePageProperty('page_size', value)
  }, [updatePageProperty])

  const handlePageMarginsChange = useCallback((value: DocumentMarginPreset) => {
    setPageMargins(value)
    updatePageProperty('page_margins', value)
  }, [updatePageProperty])

  const handlePageOrientationChange = useCallback((value: DocumentPageOrientation) => {
    setPageOrientation(value)
    updatePageProperty('page_orientation', value)
  }, [updatePageProperty])

  const handlePageNumbersChange = useCallback((value: DocumentPageNumbers) => {
    setPageNumbers(value)
    updatePageProperty('document_page_numbers', value === 'none' ? '' : value)
  }, [updatePageProperty])

  const handlePageColumnsChange = useCallback((value: DocumentPageColumns) => {
    setPageColumns(value)
    updatePageProperty('document_columns', value === 1 ? '' : String(value))
  }, [updatePageProperty])

  const handlePageHeaderChange = useCallback(() => {
    setPageTextDialog({ field: 'header', title: pageHeader ? 'Edit header' : 'Add header', value: pageHeader })
  }, [pageHeader])

  const handlePageFooterChange = useCallback(() => {
    setPageTextDialog({ field: 'footer', title: pageFooter ? 'Edit footer' : 'Add footer', value: pageFooter })
  }, [pageFooter])

  const handlePageWatermarkChange = useCallback(() => {
    setPageTextDialog({ field: 'watermark', title: pageWatermark ? 'Edit watermark' : 'Add watermark', value: pageWatermark })
  }, [pageWatermark])

  const handleApplyPageText = useCallback((field: PageTextField, value: string) => {
    const next = value.trim()
    if (field === 'header') {
      setPageHeader(next)
      updatePageProperty('document_header', next)
    } else if (field === 'footer') {
      setPageFooter(next)
      updatePageProperty('document_footer', next)
    } else {
      setPageWatermark(next)
      updatePageProperty('document_watermark', next)
    }
    setPageTextDialog(null)
  }, [updatePageProperty])

  const handleOpenLinkDialog = useCallback(() => {
    if (!editor) return
    setLinkDialog({ value: String(editor.getAttributes('link').href || '') })
  }, [editor])

  const handleApplyLink = useCallback((value: string) => {
    if (!editor) return
    applyLink(editor, value)
    setLinkDialog(null)
  }, [editor])

  const handleInsertImage = useCallback(() => {
    if (!editor) return
    if (onAttachmentUpload) {
      void insertUploadedFileImage(editor, onAttachmentUpload)
      return
    }
    setImageInsertDialog({ src: '', alt: '', title: '' })
  }, [editor, onAttachmentUpload])

  const handleApplyImageInsert = useCallback((settings: ImageInsertDialogState) => {
    if (!editor) return
    const src = settings.src.trim()
    if (!src) return
    editor.chain().focus().setImage({
      src,
      alt: settings.alt.trim() || 'image',
      title: settings.title.trim(),
    }).run()
    setImageInsertDialog(null)
  }, [editor])

  const handleOpenImageSettings = useCallback(() => {
    if (!editor) return
    if (editor.isActive('image')) {
      const settings = imageSettingsFromAttrs(editor.getAttributes('image'))
      selectedImageRef.current = { pos: editor.state.selection.from, settings }
      setImageSettingsDialog(settings)
      return
    }
    const selectedImage = selectedImageRef.current ?? findFirstImageState(editor)
    if (!selectedImage) return
    selectedImageRef.current = selectedImage
    setImageSettingsDialog(selectedImage.settings)
  }, [editor])

  const handleVoiceTyping = useCallback(() => {
    if (!editor) return
    const Recognition = speechRecognitionConstructor()
    if (!Recognition) {
      setVoiceStatus({
        tone: 'error',
        message: 'Voice typing is not available in this browser.',
      })
      return
    }

    voiceRecognitionRef.current?.stop()
    const recognition = new Recognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = speechRecognitionTranscript(event)
      if (applyVoiceTypingEditorCommand(editor, transcript)) {
        setVoiceStatus({ tone: 'listening', message: 'Voice command applied.' })
        return
      }
      const normalizedTranscript = normalizeVoiceTypingTranscript(transcript)
      if (normalizedTranscript) {
        editor.chain().focus().insertContent(normalizedTranscript).run()
        setVoiceStatus({ tone: 'listening', message: 'Voice transcript inserted.' })
      }
    }
    recognition.onerror = (event) => {
      setVoiceStatus({
        tone: 'error',
        message: `Voice typing failed${event.error ? `: ${event.error}` : ''}.`,
      })
    }
    recognition.onend = () => {
      voiceRecognitionRef.current = null
      setVoiceStatus(prev => (prev?.message === 'Listening for voice input...' ? null : prev))
    }
    voiceRecognitionRef.current = recognition
    setVoiceStatus({ tone: 'listening', message: 'Listening for voice input...' })
    try {
      recognition.start()
    } catch (err) {
      voiceRecognitionRef.current = null
      setVoiceStatus({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Voice typing could not start.',
      })
    }
  }, [editor])

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.stop()
      voiceRecognitionRef.current = null
    }
  }, [])

  const handleApplyImageSettings = useCallback((settings: ImageSettingsDialogState) => {
    if (!editor) return
    const selectedImage = selectedImageRef.current
    if (!editor.isActive('image') && selectedImage) {
      const node = editor.state.doc.nodeAt(selectedImage.pos)
      if (node?.type.name === 'image') {
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, selectedImage.pos)))
      }
    }
    editor.chain().focus().updateAttributes('image', {
      alt: settings.alt.trim(),
      title: settings.title.trim(),
      width: normalizeImageWidth(settings.width) ?? null,
    }).run()
    selectedImageRef.current = editor.isActive('image')
      ? { pos: editor.state.selection.from, settings: imageSettingsFromAttrs(editor.getAttributes('image')) }
      : selectedImage
    setImageSettingsDialog(null)
  }, [editor])

  const handleLinkPreviewMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const image = (event.target as HTMLElement).closest('img[src^="/api/vault/local/media"]')
      if (image instanceof HTMLImageElement) {
        const url = new URL(image.src, window.location.origin)
        const id = url.searchParams.get('id')
        if (id) {
          setLinkPreview({
            preview: imagePreviewForTarget({ target: id, alt: image.alt || id }),
            x: Math.min(event.clientX + 18, window.innerWidth - 340),
            y: Math.min(event.clientY + 18, window.innerHeight - 260),
          })
          return
        }
      }
      const link = (event.target as HTMLElement).closest('a[href^="#note:"]')
      const target = link instanceof HTMLAnchorElement ? noteTargetFromHref(link.getAttribute('href')) : null
      if (target) {
        setLinkPreview({
          preview: notePreviewForTarget(target, allNotes),
          x: Math.min(event.clientX + 18, window.innerWidth - 340),
          y: Math.min(event.clientY + 18, window.innerHeight - 210),
        })
        return
      }
      const externalLink = (event.target as HTMLElement).closest('a[href^="http://"], a[href^="https://"]')
      if (externalLink instanceof HTMLAnchorElement) {
        setLinkPreview({
          preview: externalPreviewForHref(externalLink.href, externalLink.textContent || undefined),
          x: Math.min(event.clientX + 18, window.innerWidth - 340),
          y: Math.min(event.clientY + 18, window.innerHeight - 210),
        })
        return
      }
      setLinkPreview(null)
    },
    [allNotes],
  )

  const handleWikilinkClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const targetElement = event.target as HTMLElement
      if (!targetElement.closest('img')) {
        selectedImageRef.current = null
        setHasImageContext(false)
      }

      const noteEmbed = targetElement.closest('aside[data-type="note-embed"]')
      if (noteEmbed instanceof HTMLElement) {
        const target = noteEmbed.dataset.target?.trim()
        if (!target) return
        event.preventDefault()
        setLinkPreview(null)
        onWikilinkOpen(target)
        return
      }
      const link = targetElement.closest('a[href^="#note:"]')
      const target = link instanceof HTMLAnchorElement ? noteTargetFromHref(link.getAttribute('href')) : null
      if (!target) {
        if (!targetElement.closest('button, input, select, textarea, a, [contenteditable="false"]')) {
          editor?.chain().focus().run()
        }
        return
      }
      event.preventDefault()
      setLinkPreview(null)
      onWikilinkOpen(target)
    },
    [editor, onWikilinkOpen],
  )

  useEffect(() => {
    localStorage.setItem(OUTLINE_OPEN_STORAGE_KEY, outlineOpen ? 'true' : 'false')
  }, [outlineOpen])

  const findMatches = useMemo(() => {
    if (!editor || !findQuery) return []
    return collectFindRanges(editor, findQuery, findMatchCase)
  }, [docVersion, editor, findMatchCase, findQuery])
  const hasDocumentImage = useMemo(() => {
    if (!editor) return false
    return documentHasImage(editor)
  }, [docVersion, editor])

  const activeFindIndex = findMatches.length
    ? Math.min(Math.max(findIndex, 0), findMatches.length - 1)
    : -1
  const reviewRailItems = useMemo<DocumentReviewRailItem[]>(
    () => reviewMarkers
      .map(marker => {
        const anchor = normalizeSelectionAnchor(marker.anchor)
        const quote = anchor?.quote?.trim() || (marker.kind === 'comment' ? 'Comment marker' : 'Suggestion marker')
        return {
          id: marker.id,
          kind: marker.kind,
          quote,
          active: marker.id === activeReviewId,
          trackedChange: marker.trackedChange,
        }
      })
      .slice(0, 10),
    [activeReviewId, reviewMarkers],
  )

  useEffect(() => {
    setFindIndex((current) => {
      if (!findMatches.length) return -1
      if (current < 0) return 0
      return Math.min(current, findMatches.length - 1)
    })
  }, [findMatches.length])

  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(documentFindHighlightKey, {
      ranges: findOpen ? findMatches : [],
      activeIndex: findOpen ? activeFindIndex : -1,
    }))
  }, [activeFindIndex, editor, findMatches, findOpen])

  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(documentReviewHighlightKey, {
      ranges: collectDocumentReviewRanges(editor, reviewMarkers, activeReviewId),
    }))
  }, [activeReviewId, docVersion, editor, reviewMarkers])

  useEffect(() => {
    if (!editor || !activeReviewId) return
    const marker = reviewMarkers.find((item) => item.id === activeReviewId)
    if (!marker) return
    const [range] = collectDocumentReviewRanges(editor, [marker], activeReviewId)
    if (!range) return
    editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).scrollIntoView().run()
  }, [activeReviewId, editor, reviewMarkers])

  const goToFindIndex = useCallback((index: number) => {
    if (!editor || index < 0 || index >= findMatches.length) return
    setFindIndex(index)
    const match = findMatches[index]
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run()
  }, [editor, findMatches])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inEditor = !!rootRef.current?.contains(target)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && inEditor) {
        event.preventDefault()
        setFindOpen(true)
        return
      }
      if (!findOpen || !inEditor) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setFindOpen(false)
        return
      }
      if (event.key === 'Enter' && target?.closest('.tiptap-find-strip')) {
        event.preventDefault()
        goToFindIndex(nextFindIndex(activeFindIndex, findMatches.length, event.shiftKey ? -1 : 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeFindIndex, findMatches.length, findOpen, goToFindIndex])

  const replaceCurrent = () => {
    if (!editor || activeFindIndex < 0) return
    const match = findMatches[activeFindIndex]
    editor.chain().focus().insertContentAt({ from: match.from, to: match.to }, replaceText).run()
    setFindIndex(Math.min(activeFindIndex, Math.max(0, findMatches.length - 2)))
  }

  const replaceAll = () => {
    if (!editor || !findMatches.length) return
    let transaction = editor.state.tr
    findMatches.slice().reverse().forEach((match) => {
      transaction = transaction.insertText(replaceText, match.from, match.to)
    })
    editor.view.dispatch(transaction)
    setFindIndex(-1)
  }

  return (
    <div
      ref={rootRef}
      className="tiptap-note-editor"
      data-page-preset={pagePreset}
      data-page-mode={pageMode}
      data-page-margins={pageMargins}
      data-page-columns={pageColumns}
    >
      <DocumentToolbar
        editor={editor}
        pageMode={pageMode}
        onPageModeChange={handlePageModeChange}
        pagePreset={pagePreset}
        onPagePresetChange={setPagePreset}
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
        pageMargins={pageMargins}
        onPageMarginsChange={handlePageMarginsChange}
        pageOrientation={pageOrientation}
        onPageOrientationChange={handlePageOrientationChange}
        pageHeader={pageHeader}
        pageFooter={pageFooter}
        pageWatermark={pageWatermark}
        pageNumbers={pageNumbers}
        pageColumns={pageColumns}
        onPageHeaderChange={handlePageHeaderChange}
        onPageFooterChange={handlePageFooterChange}
        onPageWatermarkChange={handlePageWatermarkChange}
        onPageNumbersChange={handlePageNumbersChange}
        onPageColumnsChange={handlePageColumnsChange}
        outlineOpen={outlineOpen}
        onOutlineOpenChange={setOutlineOpen}
        findOpen={findOpen}
        onFindOpenChange={setFindOpen}
        onLinkChange={handleOpenLinkDialog}
        onImageInsert={handleInsertImage}
        onImageSettingsChange={handleOpenImageSettings}
        onVoiceTyping={handleVoiceTyping}
        imageContextAvailable={hasImageContext || selectedImageRef.current !== null || hasDocumentImage}
      />
      {editor && buildingBlockMenu && (
        <RichBuildingBlockMenu
          state={buildingBlockMenu}
          onActiveIndexChange={(activeIndex) => setBuildingBlockMenuState({ ...buildingBlockMenu, activeIndex })}
          onSelect={(option) => applyBuildingBlockMenuOption(editor, option, buildingBlockMenu.from, buildingBlockMenu.to)}
        />
      )}
      {voiceStatus && (
        <VoiceTypingStatusRow
          status={voiceStatus}
          onDismiss={() => setVoiceStatus(null)}
        />
      )}
      {findOpen && (
        <FindReplaceStrip
          query={findQuery}
          replaceText={replaceText}
          matchCase={findMatchCase}
          matchCount={findMatches.length}
          activeIndex={activeFindIndex}
          onQueryChange={(value) => {
            setFindQuery(value)
            setFindIndex(0)
          }}
          onReplaceTextChange={setReplaceText}
          onMatchCaseChange={setFindMatchCase}
          onPrevious={() => goToFindIndex(nextFindIndex(activeFindIndex, findMatches.length, -1))}
          onNext={() => goToFindIndex(nextFindIndex(activeFindIndex, findMatches.length, 1))}
          onReplaceCurrent={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div className="tiptap-note-body" data-outline-open={outlineOpen ? 'true' : 'false'}>
        {outlineOpen && (
          <DocumentOutline
            editor={editor}
            items={outline}
          />
        )}
        <div
          className="tiptap-note-scroller"
          onMouseMove={handleLinkPreviewMouseMove}
          onMouseLeave={() => setLinkPreview(null)}
          onClick={handleWikilinkClick}
        >
          {pageMode === 'pages' && pageWatermark && <div className="tiptap-note-watermark" aria-hidden>{pageWatermark}</div>}
          {pageMode === 'pages' && (pageHeader || pageFooter) && (
            <div className="tiptap-note-page-preview" aria-hidden>
              {pageHeader && <div className="tiptap-note-page-header-preview">{pageHeader}</div>}
              {pageFooter && <div className="tiptap-note-page-footer-preview">{pageFooter}</div>}
            </div>
          )}
          {pageMode === 'pages' && pageNumbers !== 'none' && (
            <div className="tiptap-note-page-number-preview" data-position={pageNumbers} aria-hidden>
              Page 1
            </div>
          )}
          {reviewRailItems.length > 0 && (
            <div className="tiptap-review-rail" role="navigation" aria-label="Document review markers">
              {reviewRailItems.map(item => {
                const label = trackedChangeRailLabel(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="tiptap-review-rail-marker hover-bg"
                    data-kind={item.kind}
                    data-active={item.active ? 'true' : undefined}
                    aria-label={label}
                    title={label}
                    onClick={() => onReviewMarkerSelect?.(item.id)}
                  >
                    {item.kind === 'comment' ? 'C' : 'S'}
                  </button>
                )
              })}
            </div>
          )}
          <EditorContent editor={editor} className="note-editor-selectable" />
        </div>
      </div>
      {linkPreview && <NoteLinkPreviewTooltip preview={linkPreview} />}
      {pageTextDialog && (
        <PageTextDialog
          state={pageTextDialog}
          onSubmit={handleApplyPageText}
          onCancel={() => setPageTextDialog(null)}
        />
      )}
      {linkDialog && (
        <LinkDialog
          state={linkDialog}
          onSubmit={handleApplyLink}
          onCancel={() => setLinkDialog(null)}
        />
      )}
      {imageInsertDialog && (
        <ImageInsertDialog
          state={imageInsertDialog}
          onSubmit={handleApplyImageInsert}
          onCancel={() => setImageInsertDialog(null)}
        />
      )}
      {imageSettingsDialog && (
        <ImageSettingsDialog
          state={imageSettingsDialog}
          onSubmit={handleApplyImageSettings}
          onCancel={() => setImageSettingsDialog(null)}
        />
      )}
    </div>
  )
}

function DocumentToolbar({
  editor,
  pageMode,
  onPageModeChange,
  pagePreset,
  onPagePresetChange,
  pageSize,
  onPageSizeChange,
  pageMargins,
  onPageMarginsChange,
  pageOrientation,
  onPageOrientationChange,
  pageHeader,
  pageFooter,
  pageWatermark,
  pageNumbers,
  pageColumns,
  onPageHeaderChange,
  onPageFooterChange,
  onPageWatermarkChange,
  onPageNumbersChange,
  onPageColumnsChange,
  outlineOpen,
  onOutlineOpenChange,
  findOpen,
  onFindOpenChange,
  onLinkChange,
  onImageInsert,
  onImageSettingsChange,
  onVoiceTyping,
  imageContextAvailable,
}: {
  editor: Editor | null
  pageMode: DocumentPageMode
  onPageModeChange: (mode: DocumentPageMode) => void
  pagePreset: PagePreset
  onPagePresetChange: (preset: PagePreset) => void
  pageSize: DocumentPageSize
  onPageSizeChange: (size: DocumentPageSize) => void
  pageMargins: DocumentMarginPreset
  onPageMarginsChange: (margins: DocumentMarginPreset) => void
  pageOrientation: DocumentPageOrientation
  onPageOrientationChange: (orientation: DocumentPageOrientation) => void
  pageHeader: string
  pageFooter: string
  pageWatermark: string
  pageNumbers: DocumentPageNumbers
  pageColumns: DocumentPageColumns
  onPageHeaderChange: () => void
  onPageFooterChange: () => void
  onPageWatermarkChange: () => void
  onPageNumbersChange: (pageNumbers: DocumentPageNumbers) => void
  onPageColumnsChange: (pageColumns: DocumentPageColumns) => void
  outlineOpen: boolean
  onOutlineOpenChange: (open: boolean) => void
  findOpen: boolean
  onFindOpenChange: (open: boolean) => void
  onLinkChange: () => void
  onImageInsert: () => void
  onImageSettingsChange: () => void
  onVoiceTyping: () => void
  imageContextAvailable: boolean
}) {
  const [openMenu, setOpenMenu] = useState<'style' | 'text' | 'blocks' | 'insert' | 'more' | 'tools' | null>(null)
  const [compactToolbar, setCompactToolbar] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < COMPACT_DOCUMENT_TOOLBAR_VIEWPORT_WIDTH
  })
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && toolbarRef.current?.contains(target)) return
      setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('click', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('click', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  useEffect(() => {
    const updateToolbarDensity = (observedWidth?: number) => {
      const measuredWidth = observedWidth ?? toolbarRef.current?.getBoundingClientRect().width ?? 0
      const nextCompactToolbar =
        window.innerWidth < COMPACT_DOCUMENT_TOOLBAR_VIEWPORT_WIDTH ||
        (measuredWidth > 0 && measuredWidth < COMPACT_DOCUMENT_TOOLBAR_ACTUAL_WIDTH)
      setCompactToolbar((previous) => {
        if (previous !== nextCompactToolbar) setOpenMenu(null)
        return nextCompactToolbar
      })
    }
    updateToolbarDensity()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => {
          updateToolbarDensity(entries[0]?.contentRect.width)
        })
    const handleWindowResize = () => updateToolbarDensity()
    if (toolbarRef.current) observer?.observe(toolbarRef.current)
    window.addEventListener('resize', handleWindowResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  if (!editor) {
    return <div className="tiptap-note-toolbar" aria-label="Document formatting" />
  }

  const block = currentBlock(editor)
  const styleItems = (
    <>
      <ToolbarMenuItem active={block === 'paragraph'} label="Paragraph" onClick={() => { setBlock(editor, 'paragraph'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={block === 'heading-1'} label="Heading 1" onClick={() => { setBlock(editor, 'heading-1'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={block === 'heading-2'} label="Heading 2" onClick={() => { setBlock(editor, 'heading-2'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={block === 'heading-3'} label="Heading 3" onClick={() => { setBlock(editor, 'heading-3'); setOpenMenu(null) }} />
    </>
  )
  const textItems = (
    <>
      <ToolbarMenuItem active={editor.isActive('bold')} label="Bold" icon={<TextB size={14} weight="bold" />} onClick={() => { editor.chain().focus().toggleBold().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('italic')} label="Italic" icon={<TextItalic size={14} />} onClick={() => { editor.chain().focus().toggleItalic().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('underline')} label="Underline" icon={<TextUnderline size={14} />} onClick={() => { editor.chain().focus().toggleUnderline().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('strike')} label="Strikethrough" icon={<TextStrikethrough size={14} />} onClick={() => { editor.chain().focus().toggleStrike().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('code')} label="Inline code" icon={<Code size={14} />} onClick={() => { editor.chain().focus().toggleCode().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('superscript')} label="Superscript" icon={<TextSuperscript size={14} />} onClick={() => { editor.chain().focus().toggleMark('superscript').run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('subscript')} label="Subscript" icon={<TextSubscript size={14} />} onClick={() => { editor.chain().focus().toggleMark('subscript').run(); setOpenMenu(null) }} />
      <ToolbarMenuItem label="Clear formatting" icon={<Eraser size={14} />} onClick={() => { clearTextFormatting(editor); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuSection label={`Font family: ${currentFontFamilyLabel(editor)}`} />
      {DOCUMENT_FONT_FAMILIES.map((fontFamily) => (
        <ToolbarMenuItem
          key={fontFamily.value}
          active={currentFontFamily(editor) === fontFamily.value}
          label={`Font family ${fontFamily.label}`}
          icon={<span style={{ fontFamily: fontFamily.value, fontSize: 11, fontWeight: 700 }}>Aa</span>}
          onClick={() => {
            editor.chain().focus().setMark('textStyle', { fontFamily: fontFamily.value }).run()
            setOpenMenu(null)
          }}
        />
      ))}
      <ToolbarMenuItem
        active={currentFontFamily(editor) === 'default'}
        label="Default font family"
        icon={<span style={{ fontSize: 11, fontWeight: 700 }}>Aa</span>}
        onClick={() => {
          editor.chain().focus().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run()
          setOpenMenu(null)
        }}
      />
      <ToolbarMenuDivider />
      <ToolbarMenuSection label={`Font size: ${currentFontSize(editor)}`} />
      {DOCUMENT_FONT_SIZES.map((fontSize) => (
        <ToolbarMenuItem
          key={fontSize}
          active={currentFontSize(editor) === fontSize}
          label={`Font size ${fontSize}`}
          icon={<span style={{ fontSize: 11, fontWeight: 700 }}>{fontSize.replace('px', '')}</span>}
          onClick={() => {
            editor.chain().focus().setMark('textStyle', { fontSize }).run()
            setOpenMenu(null)
          }}
        />
      ))}
      <ToolbarMenuItem
        active={currentFontSize(editor) === 'default'}
        label="Default font size"
        icon={<span style={{ fontSize: 11, fontWeight: 700 }}>Aa</span>}
        onClick={() => {
          editor.chain().focus().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
          setOpenMenu(null)
        }}
      />
      <ToolbarMenuDivider />
      <ColorMenuItem label="Text color" onChange={(value) => { editor.chain().focus().setColor(value).run(); setOpenMenu(null) }} />
      <ColorMenuItem label="Highlight" icon={<PaintBucket size={14} />} onChange={(value) => { editor.chain().focus().toggleHighlight({ color: value }).run(); setOpenMenu(null) }} />
    </>
  )
  const blockItems = (
    <>
      <ToolbarMenuItem active={editor.isActive('bulletList')} label="Bullet list" icon={<ListBullets size={14} />} onClick={() => { editor.chain().focus().toggleBulletList().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('orderedList')} label="Numbered list" icon={<ListNumbers size={14} />} onClick={() => { editor.chain().focus().toggleOrderedList().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('taskList')} label="Checklist" icon={<ListChecks size={14} />} onClick={() => { editor.chain().focus().toggleTaskList().run(); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={editor.isActive('blockquote')} label="Quote" icon={<Quotes size={14} />} onClick={() => { editor.chain().focus().toggleBlockquote().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={editor.isActive('codeBlock')} label="Code block" icon={<TextH size={14} />} onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setOpenMenu(null) }} />
    </>
  )
  const insertItems = (
    <>
      <ToolbarMenuItem label="Link" icon={<LinkSimple size={14} />} onClick={() => { onLinkChange(); setOpenMenu(null) }} />
      <ToolbarMenuItem label="Image" icon={<ImageSquare size={14} />} onClick={() => { onImageInsert(); setOpenMenu(null) }} />
      <ToolbarMenuItem label="Table" icon={<TableIcon size={14} />} onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setOpenMenu(null) }} />
      <ToolbarMenuItem label="Voice typing" icon={<Microphone size={14} />} onClick={() => { onVoiceTyping(); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuSection label="Building blocks" />
      <ToolbarMenuItem label="Meeting notes" icon={<FileText size={14} />} onClick={() => { insertRichBuildingBlock(editor, 'meeting-notes'); setOpenMenu(null) }} />
      <ToolbarMenuItem label="Decision log" icon={<TableIcon size={14} />} onClick={() => { insertRichBuildingBlock(editor, 'decision-log'); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem label="Divider" icon={<Minus size={14} />} onClick={() => { editor.chain().focus().setHorizontalRule().run(); setOpenMenu(null) }} />
      <ToolbarMenuItem label="Page break" icon={<FileText size={14} />} onClick={() => { editor.chain().focus().insertContent({ type: 'pageBreak' }).run(); setOpenMenu(null) }} />
    </>
  )
  const moreItems = (
    <>
      <ToolbarMenuSection label="Page setup" />
      <ToolbarMenuItem active={pageMode === 'pages'} label="Pages mode" onClick={() => { onPageModeChange('pages'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageMode === 'pageless'} label="Pageless mode" onClick={() => { onPageModeChange('pageless'); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={pagePreset === 'compact'} label="Narrow view" onClick={() => { onPagePresetChange('compact'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pagePreset === 'normal'} label="Normal view" onClick={() => { onPagePresetChange('normal'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pagePreset === 'wide'} label="Wide view" onClick={() => { onPagePresetChange('wide'); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={pageSize === 'letter'} label="Letter page size" onClick={() => { onPageSizeChange('letter'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageSize === 'a4'} label="A4 page size" onClick={() => { onPageSizeChange('a4'); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={pageMargins === 'compact'} label="Compact margins" onClick={() => { onPageMarginsChange('compact'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageMargins === 'normal'} label="Normal margins" onClick={() => { onPageMarginsChange('normal'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageMargins === 'roomy'} label="Roomy margins" onClick={() => { onPageMarginsChange('roomy'); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={pageOrientation === 'portrait'} label="Portrait orientation" onClick={() => { onPageOrientationChange('portrait'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageOrientation === 'landscape'} label="Landscape orientation" onClick={() => { onPageOrientationChange('landscape'); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={pageColumns === 1} label="One column" onClick={() => { onPageColumnsChange(1); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageColumns === 2} label="Two columns" onClick={() => { onPageColumnsChange(2); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageColumns === 3} label="Three columns" onClick={() => { onPageColumnsChange(3); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem label={pageHeader ? 'Edit header' : 'Add header'} onClick={() => { onPageHeaderChange(); setOpenMenu(null) }} />
      <ToolbarMenuItem label={pageFooter ? 'Edit footer' : 'Add footer'} onClick={() => { onPageFooterChange(); setOpenMenu(null) }} />
      <ToolbarMenuItem label={pageWatermark ? 'Edit watermark' : 'Add watermark'} onClick={() => { onPageWatermarkChange(); setOpenMenu(null) }} />
      <ToolbarMenuDivider />
      <ToolbarMenuItem active={pageNumbers === 'none'} label="Hide page numbers" onClick={() => { onPageNumbersChange('none'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageNumbers === 'footer-center'} label="Page numbers centered" onClick={() => { onPageNumbersChange('footer-center'); setOpenMenu(null) }} />
      <ToolbarMenuItem active={pageNumbers === 'footer-right'} label="Page numbers right" onClick={() => { onPageNumbersChange('footer-right'); setOpenMenu(null) }} />
      <ToolbarMenuSection label="View" />
      <ToolbarMenuItem active={outlineOpen} label={outlineOpen ? 'Hide outline' : 'Show outline'} icon={<ListBullets size={14} />} onClick={() => { onOutlineOpenChange(!outlineOpen); setOpenMenu(null) }} />
      <ToolbarMenuItem active={findOpen} label="Find and replace" icon={<MagnifyingGlass size={14} />} onClick={() => { onFindOpenChange(!findOpen); setOpenMenu(null) }} />
      <ToolbarMenuSection label={`Alignment: ${alignmentLabel(currentAlignment(editor))}`} />
      <ToolbarMenuItem active={currentAlignment(editor) === 'left'} label="Align left" icon={<TextAlignLeft size={14} />} onClick={() => { editor.chain().focus().setTextAlign('left').run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={currentAlignment(editor) === 'center'} label="Align center" icon={<TextAlignCenter size={14} />} onClick={() => { editor.chain().focus().setTextAlign('center').run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={currentAlignment(editor) === 'right'} label="Align right" icon={<TextAlignRight size={14} />} onClick={() => { editor.chain().focus().setTextAlign('right').run(); setOpenMenu(null) }} />
      <ToolbarMenuItem active={currentAlignment(editor) === 'justify'} label="Align justify" icon={<TextAlignJustify size={14} />} onClick={() => { editor.chain().focus().setTextAlign('justify').run(); setOpenMenu(null) }} />
      <ToolbarMenuSection label={`Line spacing: ${currentLineHeight(editor)}`} />
      {DOCUMENT_LINE_HEIGHTS.map((lineHeight) => (
        <ToolbarMenuItem
          key={lineHeight}
          active={currentLineHeight(editor) === lineHeight}
          label={`Line spacing ${lineHeight}`}
          onClick={() => {
            setCurrentLineHeight(editor, lineHeight)
            setOpenMenu(null)
          }}
        />
      ))}
      <ToolbarMenuItem
        active={currentLineHeight(editor) === 'default'}
        label="Default line spacing"
        onClick={() => {
          setCurrentLineHeight(editor, null)
          setOpenMenu(null)
        }}
      />
      {editor.isActive('table') && (
        <>
          <ToolbarMenuSection label="Table options" />
          <ToolbarMenuItem label="Toggle header row" onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setOpenMenu(null) }} />
          <ToolbarMenuItem label="Toggle header column" onClick={() => { editor.chain().focus().toggleHeaderColumn().run(); setOpenMenu(null) }} />
          <ToolbarMenuDivider />
          <ToolbarMenuItem label="Add row below" onClick={() => { editor.chain().focus().addRowAfter().run(); setOpenMenu(null) }} />
          <ToolbarMenuItem label="Add column right" onClick={() => { editor.chain().focus().addColumnAfter().run(); setOpenMenu(null) }} />
          <ToolbarMenuItem label="Delete row" onClick={() => { editor.chain().focus().deleteRow().run(); setOpenMenu(null) }} />
          <ToolbarMenuItem label="Delete column" onClick={() => { editor.chain().focus().deleteColumn().run(); setOpenMenu(null) }} />
          <ToolbarMenuDivider />
          <ToolbarMenuItem label="Merge cells" onClick={() => { editor.chain().focus().mergeCells().run(); setOpenMenu(null) }} />
          <ToolbarMenuItem label="Split cell" onClick={() => { editor.chain().focus().splitCell().run(); setOpenMenu(null) }} />
          <ToolbarMenuDivider />
          <ToolbarMenuItem label="Delete table" onClick={() => { editor.chain().focus().deleteTable().run(); setOpenMenu(null) }} />
        </>
      )}
      {(imageContextAvailable || editor.isActive('image')) && (
        <>
          <ToolbarMenuSection label="Image options" />
          <ToolbarMenuItem label="Image settings" onClick={() => { onImageSettingsChange(); setOpenMenu(null) }} />
          <ToolbarMenuDivider />
          <ToolbarMenuItem
            label="Delete image"
            onClick={() => {
              if (imageContextAvailable || editor.isActive('image')) editor.chain().focus().deleteSelection().run()
              setOpenMenu(null)
            }}
          />
        </>
      )}
    </>
  )

  return (
    <div
      ref={toolbarRef}
      className="tiptap-note-toolbar"
      role="toolbar"
      aria-label="Document formatting"
      style={{
        height: 34,
        maxHeight: 34,
        flexWrap: 'nowrap',
      }}
    >
      <ToolbarButton
        disabled={!editor.can().undo()}
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
      >
        <ArrowCounterClockwise size={14} />
      </ToolbarButton>
      <ToolbarButton
        disabled={!editor.can().redo()}
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
      >
        <ArrowClockwise size={14} />
      </ToolbarButton>
      <Separator />
      {compactToolbar ? (
        <ToolbarMenuButton
          label="Document tools"
          text="Tools"
          icon={<FileText size={14} />}
          showText={false}
          open={openMenu === 'tools'}
          onToggle={() => setOpenMenu(openMenu === 'tools' ? null : 'tools')}
        >
          <ToolbarMenuSection label="Style" />
          {styleItems}
          <ToolbarMenuSection label="Text" />
          {textItems}
          <ToolbarMenuSection label="Blocks" />
          {blockItems}
          <ToolbarMenuSection label="Insert" />
          {insertItems}
          {moreItems}
        </ToolbarMenuButton>
      ) : (
        <>
          <ToolbarMenuButton
            label="Paragraph style"
            text="Style"
            icon={<TextH size={14} />}
            open={openMenu === 'style'}
            onToggle={() => setOpenMenu(openMenu === 'style' ? null : 'style')}
          >
            {styleItems}
          </ToolbarMenuButton>
          <Separator />
          <ToolbarMenuButton
            label="Text formatting"
            text="Text"
            icon={<TextB size={14} weight="bold" />}
            open={openMenu === 'text'}
            onToggle={() => setOpenMenu(openMenu === 'text' ? null : 'text')}
          >
            {textItems}
          </ToolbarMenuButton>
          <Separator />
          <ToolbarMenuButton
            label="Blocks and lists"
            text="Blocks"
            icon={<ListBullets size={14} />}
            open={openMenu === 'blocks'}
            onToggle={() => setOpenMenu(openMenu === 'blocks' ? null : 'blocks')}
          >
            {blockItems}
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="Insert"
            text="Insert"
            icon={<LinkSimple size={14} />}
            open={openMenu === 'insert'}
            onToggle={() => setOpenMenu(openMenu === 'insert' ? null : 'insert')}
          >
            {insertItems}
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="More document tools"
            text="More"
            icon={<DotsThree size={14} weight="bold" />}
            open={openMenu === 'more'}
            onToggle={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
          >
            {moreItems}
          </ToolbarMenuButton>
        </>
      )}
    </div>
  )
}

function RichBuildingBlockMenu({
  state,
  onActiveIndexChange,
  onSelect,
}: {
  state: RichBuildingBlockMenuState
  onActiveIndexChange: (index: number) => void
  onSelect: (option: RichBuildingBlockOption) => void
}) {
  return (
    <div
      role="listbox"
      aria-label="Smart insert suggestions"
      className="tiptap-building-block-menu"
      style={{ top: state.top, left: state.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="tiptap-building-block-menu-label">
        @ smart inserts
      </div>
      {state.options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={index === state.activeIndex}
          className="tiptap-building-block-option hover-bg"
          data-active={index === state.activeIndex ? 'true' : undefined}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(option)}
        >
          <span>{option.label}</span>
          <span>{option.detail}</span>
        </button>
      ))}
    </div>
  )
}

function VoiceTypingStatusRow({
  status,
  onDismiss,
}: {
  status: VoiceTypingStatus
  onDismiss: () => void
}) {
  return (
    <div
      className="tiptap-voice-status"
      data-tone={status.tone}
      role="status"
      aria-live="polite"
    >
      <Microphone size={14} aria-hidden />
      <span>{status.message}</span>
      <button
        type="button"
        className="tiptap-voice-status-dismiss hover-bg"
        onClick={onDismiss}
        aria-label="Dismiss voice typing status"
      >
        Close
      </button>
    </div>
  )
}

function FindReplaceStrip({
  query,
  replaceText,
  matchCase,
  matchCount,
  activeIndex,
  onQueryChange,
  onReplaceTextChange,
  onMatchCaseChange,
  onPrevious,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: {
  query: string
  replaceText: string
  matchCase: boolean
  matchCount: number
  activeIndex: number
  onQueryChange: (value: string) => void
  onReplaceTextChange: (value: string) => void
  onMatchCaseChange: (value: boolean) => void
  onPrevious: () => void
  onNext: () => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  onClose: () => void
}) {
  const queryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    queryRef.current?.focus()
    queryRef.current?.select()
  }, [])

  const disabled = matchCount === 0

  return (
    <div className="tiptap-find-strip" role="search" aria-label="Find and replace">
      <input
        ref={queryRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="tiptap-find-input"
        placeholder="Find"
        aria-label="Find text"
      />
      <input
        value={replaceText}
        onChange={(event) => onReplaceTextChange(event.target.value)}
        className="tiptap-find-input"
        placeholder="Replace"
        aria-label="Replace text"
      />
      <span className="tiptap-find-count" aria-live="polite">
        {query ? (matchCount ? `${activeIndex + 1} / ${matchCount}` : '0 matches') : 'No query'}
      </span>
      <label className="tiptap-find-check">
        <input
          type="checkbox"
          checked={matchCase}
          onChange={(event) => onMatchCaseChange(event.target.checked)}
        />
        Aa
      </label>
      <button type="button" className="tiptap-find-button hover-bg" disabled={disabled} onClick={onPrevious}>
        Prev
      </button>
      <button type="button" className="tiptap-find-button hover-bg" disabled={disabled} onClick={onNext}>
        Next
      </button>
      <button type="button" className="tiptap-find-button hover-bg" disabled={disabled} onClick={onReplaceCurrent}>
        Replace
      </button>
      <button type="button" className="tiptap-find-button hover-bg" disabled={disabled} onClick={onReplaceAll}>
        All
      </button>
      <button type="button" className="tiptap-find-button hover-bg" onClick={onClose} aria-label="Close find and replace">
        Close
      </button>
    </div>
  )
}

function PageTextDialog({
  state,
  onSubmit,
  onCancel,
}: {
  state: PageTextDialogState
  onSubmit: (field: PageTextField, value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(state.value)

  useEffect(() => {
    setValue(state.value)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [state])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const fieldLabel =
    state.field === 'header' ? 'Header text' : state.field === 'footer' ? 'Footer text' : 'Watermark text'
  const placeholder =
    state.field === 'header' ? 'Document header' : state.field === 'footer' ? 'Document footer' : 'DRAFT'

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
      }}
    >
      <form
        aria-label={state.title}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(state.field, value)
        }}
        style={{
          width: 'min(420px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{state.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Stored in local note frontmatter for export and sync.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>{fieldLabel}</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
              }}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-a12)',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Save {state.field}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function LinkDialog({
  state,
  onSubmit,
  onCancel,
}: {
  state: LinkDialogState
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(state.value)

  useEffect(() => {
    setValue(state.value)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [state])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
      }}
    >
      <form
        aria-label="Edit link"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(value)
        }}
        style={{
          width: 'min(460px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Edit link</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Use a URL or an Obsidian wikilink like [[Project Note]].
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Link target</span>
            <input
              ref={inputRef}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://example.com or [[Note]]"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                font: 'inherit',
                fontSize: 13,
                minWidth: 0,
              }}
            />
          </label>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-muted)',
              padding: '8px 10px',
              fontSize: 12,
            }}
          >
            Leave blank to remove the current link mark.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-a12)',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Apply link
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ImageInsertDialog({
  state,
  onSubmit,
  onCancel,
}: {
  state: ImageInsertDialogState
  onSubmit: (settings: ImageInsertDialogState) => void
  onCancel: () => void
}) {
  const firstInputRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState(state)
  const valid = values.src.trim().length > 0

  useEffect(() => {
    setValues(state)
    requestAnimationFrame(() => {
      firstInputRef.current?.focus()
      firstInputRef.current?.select()
    })
  }, [state])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
      }}
    >
      <form
        aria-label="Insert image"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onSubmit(values)
        }}
        style={{
          width: 'min(460px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ImageSquare size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Insert image</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Add an image URL with optional alt text and title.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Image URL</span>
            <input
              ref={firstInputRef}
              value={values.src}
              onChange={(event) => setValues(prev => ({ ...prev, src: event.target.value }))}
              placeholder="https://example.com/image.png"
              style={dialogInputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Alt text</span>
            <input
              value={values.alt}
              onChange={(event) => setValues(prev => ({ ...prev, alt: event.target.value }))}
              style={dialogInputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Image title</span>
            <input
              value={values.title}
              onChange={(event) => setValues(prev => ({ ...prev, title: event.target.value }))}
              style={dialogInputStyle}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: valid ? 'var(--accent-a12)' : 'var(--bg-muted)',
                color: valid ? 'var(--accent)' : 'var(--text-muted)',
                cursor: valid ? 'pointer' : 'not-allowed',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Insert image
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ImageSettingsDialog({
  state,
  onSubmit,
  onCancel,
}: {
  state: ImageSettingsDialogState
  onSubmit: (settings: ImageSettingsDialogState) => void
  onCancel: () => void
}) {
  const firstInputRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState(state)

  useEffect(() => {
    setValues(state)
    requestAnimationFrame(() => {
      firstInputRef.current?.focus()
      firstInputRef.current?.select()
    })
  }, [state])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.42)',
      }}
    >
      <form
        aria-label="Image settings"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(values)
        }}
        style={{
          width: 'min(460px, 100%)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>Image settings</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Alt text, title, and export width for the selected image.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="hover-bg"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Alt text</span>
            <input
              ref={firstInputRef}
              value={values.alt}
              onChange={(event) => setValues(prev => ({ ...prev, alt: event.target.value }))}
              style={dialogInputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Image title</span>
            <input
              value={values.title}
              onChange={(event) => setValues(prev => ({ ...prev, title: event.target.value }))}
              style={dialogInputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>Width</span>
            <input
              value={values.width}
              onChange={(event) => setValues(prev => ({ ...prev, width: event.target.value }))}
              placeholder="80-1400 px"
              style={dialogInputStyle}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                border: '1px solid var(--accent-a20)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-a12)',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Apply image settings
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

const dialogInputStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  padding: '8px 9px',
  font: 'inherit',
  fontSize: 13,
  minWidth: 0,
}

function DocumentOutline({ editor, items }: { editor: Editor | null; items: OutlineItem[] }) {
  return (
    <aside className="tiptap-note-outline" aria-label="Document outline">
      <div className="tiptap-note-outline-title">Outline</div>
      {items.length === 0 ? (
        <div className="tiptap-note-outline-empty">No headings</div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tiptap-note-outline-item hover-bg"
            data-level={item.level}
            onClick={() => jumpToOutlineItem(editor, item.pos)}
          >
            {item.text}
          </button>
        ))
      )}
    </aside>
  )
}

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="tiptap-note-button hover-bg"
      data-active={active ? 'true' : 'false'}
      title={label}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ToolbarMenuButton({
  label,
  text,
  icon,
  showText = true,
  open,
  onToggle,
  children,
}: {
  label: string
  text: string
  icon?: ReactNode
  showText?: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pendingOpenFocusRef = useRef<'first' | 'last' | null>(null)
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const restoreTriggerFocus = () => requestAnimationFrame(() => triggerRef.current?.focus())

  const resetTypeahead = () => {
    typeaheadRef.current = ''
    if (typeaheadTimerRef.current) {
      window.clearTimeout(typeaheadTimerRef.current)
      typeaheadTimerRef.current = null
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle({})
      resetTypeahead()
      return
    }
    const updateMenuStyle = () => {
      setMenuStyle(viewportAnchoredMenuStyle(triggerRef.current, menuRef.current))
    }
    updateMenuStyle()
    window.addEventListener('resize', updateMenuStyle)
    window.addEventListener('scroll', updateMenuStyle, true)
    return () => {
      window.removeEventListener('resize', updateMenuStyle)
      window.removeEventListener('scroll', updateMenuStyle, true)
    }
  }, [open])

  useEffect(() => () => resetTypeahead(), [])

  useEffect(() => {
    if (!open) return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (pendingOpenFocusRef.current === 'last') {
      pendingOpenFocusRef.current = null
      items[items.length - 1]?.focus()
      return
    }
    pendingOpenFocusRef.current = null
    const active = menuRef.current?.querySelector<HTMLButtonElement>('button[data-active="true"]:not(:disabled)')
    ;(active ?? items[0])?.focus()
  }, [open])

  const focusItem = (direction: 'next' | 'previous' | 'first' | 'last') => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (items.length === 0) return
    if (direction === 'first') {
      items[0].focus()
      return
    }
    if (direction === 'last') {
      items[items.length - 1].focus()
      return
    }
    const currentIndex = Math.max(0, items.findIndex(item => item === document.activeElement))
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length
    items[nextIndex].focus()
  }

  const focusItemByTypeahead = (key: string) => {
    typeaheadRef.current = `${typeaheadRef.current}${key.toLowerCase()}`.slice(0, 32)
    if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = ''
      typeaheadTimerRef.current = null
    }, 700)

    const query = typeaheadRef.current
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (items.length === 0) return
    const currentIndex = items.findIndex(item => item === document.activeElement)
    const orderedItems = [
      ...items.slice(Math.max(0, currentIndex + 1)),
      ...items.slice(0, Math.max(0, currentIndex + 1)),
    ]
    const match = orderedItems.find(item => item.textContent?.trim().toLowerCase().startsWith(query))
      ?? orderedItems.find(item => item.textContent?.trim().toLowerCase().includes(query))
    match?.focus()
    match?.scrollIntoView?.({ block: 'nearest' })
  }

  return (
    <div className="tiptap-note-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="tiptap-note-text-button tiptap-note-menu-trigger hover-bg"
        data-icon-only={showText ? 'false' : 'true'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onPointerDown={(event) => {
          event.preventDefault()
          onToggle()
        }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          if (event.detail === 0) onToggle()
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            pendingOpenFocusRef.current = 'first'
            onToggle()
          }
          if (event.key === 'ArrowUp' && !open) {
            event.preventDefault()
            pendingOpenFocusRef.current = 'last'
            onToggle()
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            onToggle()
            restoreTriggerFocus()
          }
        }}
      >
        {icon && <span aria-hidden className="tiptap-note-menu-trigger-icon">{icon}</span>}
        {showText && <span className="tiptap-note-menu-trigger-label">{text}</span>}
        {showText && <CaretDown size={11} aria-hidden className="tiptap-note-menu-trigger-caret" />}
      </button>
      {open && typeof document !== 'undefined' && createPortal((
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="tiptap-note-menu"
          style={menuStyle}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button[role="menuitem"]')) restoreTriggerFocus()
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusItem('next')
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusItem('previous')
            }
            if (event.key === 'Home') {
              event.preventDefault()
              focusItem('first')
            }
            if (event.key === 'End') {
              event.preventDefault()
              focusItem('last')
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onToggle()
              restoreTriggerFocus()
            }
            if (
              event.key.length === 1 &&
              event.key.trim().length > 0 &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              focusItemByTypeahead(event.key)
            }
          }}
        >
          {children}
        </div>
      ), document.body)}
    </div>
  )
}

function ToolbarMenuItem({
  label,
  active,
  icon,
  onClick,
}: {
  label: string
  active?: boolean
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="tiptap-note-menu-item hover-bg"
      data-active={active ? 'true' : 'false'}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="tiptap-note-menu-check" aria-hidden>{icon ?? (active ? '*' : '')}</span>
      <span>{label}</span>
    </button>
  )
}

function ToolbarMenuDivider() {
  return <div className="tiptap-note-menu-divider" role="separator" />
}

function ToolbarMenuSection({ label }: { label: string }) {
  return (
    <div className="tiptap-note-menu-section" role="presentation">
      {label}
    </div>
  )
}

function ColorMenuItem({ label, icon, onChange }: { label: string; icon?: ReactNode; onChange: (value: string) => void }) {
  return (
    <label className="tiptap-note-menu-item tiptap-note-color-menu-item hover-bg" role="menuitem" title={label}>
      <span className="tiptap-note-menu-check" aria-hidden>{icon ?? <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>}</span>
      <span>{label}</span>
      <input aria-label={label} type="color" onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Separator() {
  return <div className="tiptap-note-separator" aria-hidden />
}

function currentBlock(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'heading-1'
  if (editor.isActive('heading', { level: 2 })) return 'heading-2'
  if (editor.isActive('heading', { level: 3 })) return 'heading-3'
  return 'paragraph'
}

function currentAlignment(editor: Editor): DocumentTextAlignment {
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  if (editor.isActive({ textAlign: 'justify' })) return 'justify'
  return 'left'
}

function currentFontSize(editor: Editor): string {
  const fontSize = editor.getAttributes('textStyle').fontSize
  return typeof fontSize === 'string' && fontSize.trim() ? fontSize.trim() : 'default'
}

function currentFontFamily(editor: Editor): string {
  const fontFamily = editor.getAttributes('textStyle').fontFamily
  return typeof fontFamily === 'string' && fontFamily.trim() ? fontFamily.trim() : 'default'
}

function currentFontFamilyLabel(editor: Editor): string {
  const current = currentFontFamily(editor)
  if (current === 'default') return 'default'
  return DOCUMENT_FONT_FAMILIES.find((fontFamily) => fontFamily.value === current)?.label ?? current
}

function clearTextFormatting(editor: Editor | null | undefined) {
  editor?.chain().focus().unsetAllMarks().unsetMark('textStyle').removeEmptyTextStyle().run()
}

function currentLineHeight(editor: Editor): string {
  const attrs = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const lineHeight = attrs.lineHeight
  return typeof lineHeight === 'string' && lineHeight.trim() ? lineHeight.trim() : 'default'
}

function setCurrentLineHeight(editor: Editor, lineHeight: string | null) {
  if (editor.isActive('heading')) {
    editor.chain().focus().updateAttributes('heading', { lineHeight }).run()
  } else {
    editor.chain().focus().updateAttributes('paragraph', { lineHeight }).run()
  }
}

function alignmentLabel(alignment: DocumentTextAlignment): string {
  if (alignment === 'center') return 'Center'
  if (alignment === 'right') return 'Right'
  if (alignment === 'justify') return 'Justify'
  return 'Left'
}

function setBlock(editor: Editor, value: string) {
  if (value === 'heading-1') editor.chain().focus().toggleHeading({ level: 1 }).run()
  else if (value === 'heading-2') editor.chain().focus().toggleHeading({ level: 2 }).run()
  else if (value === 'heading-3') editor.chain().focus().toggleHeading({ level: 3 }).run()
  else editor.chain().focus().setParagraph().run()
}

function collectOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    if (!text) return
    const level = Number(node.attrs.level || 1)
    items.push({
      id: `${pos}-${level}-${text}`,
      level,
      text,
      pos,
    })
  })
  return items
}

function jumpToOutlineItem(editor: Editor | null, pos: number) {
  editor?.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
}

function collectFindRanges(editor: Editor, query: string, matchCase: boolean): FindRange[] {
  const needle = matchCase ? query : query.toLocaleLowerCase()
  if (!needle) return []
  const ranges: FindRange[] = []

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const haystack = matchCase ? node.text : node.text.toLocaleLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      ranges.push({ from: pos + index, to: pos + index + query.length })
      index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
    }
  })

  return ranges
}

function collectDocumentReviewRanges(
  editor: Editor,
  markers: NoteReviewMarker[],
  activeId: string | null,
): DocumentReviewRange[] {
  const ranges: DocumentReviewRange[] = []
  const quoteOffsets = new Map<string, number>()
  const docSize = editor.state.doc.content.size

  for (const marker of markers) {
    const anchor = normalizeSelectionAnchor(marker.anchor)
    if (!anchor) continue

    if (marker.kind === 'suggestion' && marker.trackedChange?.type === 'replace_document' && anchor.scope === 'document') {
      ranges.push({
        id: marker.id,
        kind: marker.kind,
        from: 1,
        to: 1,
        active: marker.id === activeId,
        trackedChange: marker.trackedChange,
      })
      continue
    }

    if (marker.kind === 'suggestion' && marker.trackedChange?.type === 'insert' && anchor.scope === 'cursor') {
      const cursorPosition = typeof anchor.start === 'number'
        ? Math.max(0, Math.min(anchor.start, docSize))
        : null
      if (cursorPosition !== null) {
        ranges.push({
          id: marker.id,
          kind: marker.kind,
          from: cursorPosition,
          to: cursorPosition,
          active: marker.id === activeId,
          trackedChange: marker.trackedChange,
        })
      }
      continue
    }

    if (anchor.scope !== 'selection') continue

    const direct = anchor.mode === 'document' && typeof anchor.start === 'number' && typeof anchor.end === 'number'
      ? {
          from: Math.max(0, Math.min(anchor.start, docSize)),
          to: Math.max(0, Math.min(anchor.end, docSize)),
        }
      : null
    const directMatches = direct && direct.to > direct.from && (!anchor.quote || editor.state.doc.textBetween(direct.from, direct.to, '\n') === anchor.quote)
    const range = directMatches
      ? direct
      : findQuoteInDocument(
          editor,
          anchor.quote,
          quoteOffsets,
          anchor.mode === 'document' ? anchor.start : undefined,
        )
    if (!range || range.to <= range.from) continue
    ranges.push({
      id: marker.id,
      kind: marker.kind,
      from: range.from,
      to: range.to,
      active: marker.id === activeId,
      trackedChange: marker.trackedChange,
    })
  }

  return ranges.sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id))
}

function findQuoteInDocument(
  editor: Editor,
  quote: string | undefined,
  quoteOffsets: Map<string, number>,
  preferredStart?: number,
): { from: number; to: number } | null {
  const needle = quote?.trim()
  if (!needle) return null
  let seen = 0
  const targetOffset = quoteOffsets.get(needle) ?? 0
  const matches: Array<{ from: number; to: number; logicalTo: number }> = []

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    let index = node.text.indexOf(needle, Math.max(0, targetOffset - seen))
    while (index >= 0) {
      matches.push({
        from: pos + index,
        to: pos + index + needle.length,
        logicalTo: seen + index + needle.length,
      })
      index = node.text.indexOf(needle, index + Math.max(needle.length, 1))
    }
    seen += node.text.length
  })

  if (matches.length === 0) return null
  const found = typeof preferredStart === 'number'
    ? matches.reduce((best, current) => (
        Math.abs(current.from - preferredStart) < Math.abs(best.from - preferredStart) ? current : best
      ))
    : matches[0]
  quoteOffsets.set(needle, found.logicalTo)
  return found
}

function nextFindIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1
  if (current < 0) return direction > 0 ? 0 : count - 1
  return (current + direction + count) % count
}

function normalizeImageWidth(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(80, Math.min(1400, Math.round(value)))
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{2,4})(?:px)?$/i)
  return match ? Math.max(80, Math.min(1400, Number(match[1]))) : null
}

function applyLink(editor: Editor, value: string) {
  const url = value.trim()
  if (!url) {
    editor.chain().focus().unsetLink().run()
    return
  }
  const wiki = url.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
  const href = wiki ? `#note:${encodeURIComponent(wiki[1].trim())}` : url
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

async function insertUploadedFileImage(editor: Editor, onAttachmentUpload: NonNullable<DocumentEditorProps['onAttachmentUpload']>) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    await insertUploadedImage(editor, file, onAttachmentUpload)
  }
  input.click()
}

async function insertUploadedImage(editor: Editor | null, file: File, onAttachmentUpload: NonNullable<DocumentEditorProps['onAttachmentUpload']>) {
  if (!editor) return
  const uploaded = await onAttachmentUpload(file)
  editor.chain().focus().setImage({
    src: `/api/vault/local/media?id=${encodeURIComponent(uploaded.id)}`,
    alt: file.name,
    title: uploaded.id,
  }).run()
}
