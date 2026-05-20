import { useCallback, useEffect, useMemo, useRef, useState, memo, type ElementType } from 'react'
import { Columns, Eye, FileText, LinkSimple, ListBullets, MagnifyingGlass, PenNib, Tag } from '@phosphor-icons/react'
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
  ViewPlugin,
  Decoration,
  WidgetType,
} from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, RangeSetBuilder, Compartment } from '@codemirror/state'
import { noteIdFromTitle, parseFrontmatter, uploadAttachment } from '@/lib/vault'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import type { NoteReviewMarker, NoteSelectionAnchor, VaultNote } from './types'
import EditorToolbar, { toggleWrap, toggleWrapPair, insertLink } from './EditorToolbar'
import { wikilinkCompletions } from './wikilinkCompletion'
import { slashCommandCompletions } from './slashCommands'
import DocumentEditor from './DocumentEditor'
import { markdownToSafeHtml, setFrontmatterProperty } from './export'
import { resolveTextReviewRanges } from './reviewAnchors'
import { documentStats, type DocumentStats } from './documentStats'
import { DEFAULT_NOTES_EDITOR_PREFERENCES, markdownFontSizePx, markdownWidthPx, normalizeNotesEditorPreferences, type NotesEditorPreferences } from './notesPreferences'

// --- Image embed widget for ![[image.png]] syntax ---

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp)$/i
const IMAGE_EMBED_RE = /!\[\[([^\]]+)\]\]/g

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super()
  }

  eq(other: ImageWidget) {
    return this.src === other.src
  }

  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'margin: 8px 0; line-height: 0;'

    // Placeholder shown while loading
    const ph = document.createElement('div')
    ph.style.cssText =
      'width: 120px; height: 80px; border-radius: 6px; background: var(--bg-white-04);'
    wrapper.appendChild(ph)

    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.draggable = false
    img.style.cssText =
      'max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 6px; cursor: pointer; display: none;'

    img.onload = () => {
      ph.style.display = 'none'
      img.style.display = 'block'
    }
    img.onerror = () => {
      // Hide both placeholder and image on error
      wrapper.style.display = 'none'
    }

    wrapper.appendChild(img)
    return wrapper
  }

  ignoreEvent() {
    return false
  }
}

function buildImageDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    let match: RegExpExecArray | null
    IMAGE_EMBED_RE.lastIndex = 0
    while ((match = IMAGE_EMBED_RE.exec(line.text)) !== null) {
      const filename = match[1].trim()
      if (!IMAGE_EXTENSIONS.test(filename)) continue
      const src = `/api/vault/local/media?id=${encodeURIComponent(filename)}`
      builder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new ImageWidget(src, filename),
          block: true,
          side: 1,
        }),
      )
    }
  }

  return builder.finish()
}

const imageEmbedPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildImageDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

function markdownReviewDecorations(markers: NoteReviewMarker[] = [], activeId: string | null = null) {
  return EditorView.decorations.of((view) => {
    const builder = new RangeSetBuilder<Decoration>()
    const ranges = resolveTextReviewRanges(view.state.doc.toString(), markers, activeId, 'markdown')
    for (const range of ranges) {
      builder.add(
        range.from,
        range.to,
        Decoration.mark({
          class: [
            range.kind === 'comment' ? 'cm-review-comment' : 'cm-review-suggestion',
            range.active ? 'cm-review-active' : '',
          ].filter(Boolean).join(' '),
          attributes: {
            'data-review-id': range.id,
          },
        }),
      )
    }
    return builder.finish()
  })
}

const mcTheme = EditorView.theme(
  {
    '&': {
      fontSize: '14.5px',
      lineHeight: '1.7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      height: '100%',
      background: 'transparent',
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
      padding: '24px 0 80px',
      maxWidth: '680px',
      margin: '0 auto',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '1.5px',
    },
    '.cm-selectionBackground': {
      background: 'var(--accent-a15) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      background: 'var(--accent-a30) !important',
    },
    '.cm-review-comment, .cm-review-suggestion': {
      borderRadius: '2px',
      boxShadow: 'inset 0 -2px 0 color-mix(in srgb, var(--accent) 54%, transparent)',
    },
    '.cm-review-comment': {
      background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
    },
    '.cm-review-suggestion': {
      background: 'color-mix(in srgb, var(--green) 18%, transparent)',
      boxShadow: 'inset 0 -2px 0 color-mix(in srgb, var(--green) 54%, transparent)',
    },
    '.cm-review-active': {
      outline: '1px solid var(--accent-dim)',
      background: 'color-mix(in srgb, var(--accent) 28%, transparent)',
    },
    '.cm-activeLine': {
      background: 'transparent',
    },
    '&.cm-focused .cm-activeLine': {
      background: 'var(--bg-white-02)',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      padding: '0 48px',
    },
    // Headings
    '.cm-header-1': {
      fontSize: '1.8em',
      fontWeight: '700',
      color: 'var(--text-primary)',
      lineHeight: '1.3',
      letterSpacing: '-0.02em',
    },
    '.cm-header-2': {
      fontSize: '1.4em',
      fontWeight: '600',
      color: 'var(--text-primary)',
      lineHeight: '1.35',
      letterSpacing: '-0.01em',
    },
    '.cm-header-3': {
      fontSize: '1.15em',
      fontWeight: '600',
      color: 'var(--text-primary)',
      lineHeight: '1.4',
    },
    '.cm-header-4, .cm-header-5, .cm-header-6': {
      fontSize: '1em',
      fontWeight: '600',
      color: 'var(--text-secondary)',
    },
    // Dim formatting markers
    '.cm-formatting': {
      opacity: '0.25',
    },
    // Bold & italic
    '.cm-strong': {
      fontWeight: '600',
      color: 'var(--text-primary)',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
      color: 'var(--text-primary)',
    },
    // Inline code
    '.cm-monospace': {
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
      fontSize: '0.88em',
      background: 'var(--bg-white-04)',
      borderRadius: '3px',
      padding: '1px 5px',
      color: 'var(--accent-bright)',
    },
    // Links
    '.cm-link': {
      color: 'var(--accent)',
      textDecoration: 'none',
    },
    '.cm-url': {
      color: 'var(--text-muted)',
      fontSize: '0.85em',
      opacity: 0.6,
    },
    // Blockquote
    '.cm-quote': {
      color: 'var(--text-secondary)',
      fontStyle: 'italic',
      borderLeft: '2px solid var(--accent-dim)',
      paddingLeft: '14px',
    },
    // Placeholder
    '.cm-placeholder': {
      color: 'var(--text-muted)',
      fontStyle: 'italic',
      opacity: 0.4,
    },
    '.cm-selectionMatch': {
      background: 'var(--accent-a12)',
    },
    // Autocomplete tooltip
    '.cm-tooltip.cm-tooltip-autocomplete': {
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: '0 8px 24px var(--overlay-heavy)',
      overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'inherit',
      fontSize: '13px',
      maxHeight: '200px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      padding: '4px 10px',
      color: 'var(--text-secondary)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'var(--accent-dim)',
      color: 'var(--text-on-color)',
    },
    '.cm-completionIcon': {
      display: 'none',
    },
  },
  { dark: true },
)

const mcHighlighting = HighlightStyle.define([
  { tag: tags.heading1, class: 'cm-header-1' },
  { tag: tags.heading2, class: 'cm-header-2' },
  { tag: tags.heading3, class: 'cm-header-3' },
  { tag: tags.heading4, class: 'cm-header-4' },
  { tag: tags.heading5, class: 'cm-header-5' },
  { tag: tags.heading6, class: 'cm-header-6' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-emphasis' },
  { tag: tags.monospace, class: 'cm-monospace' },
  { tag: tags.link, class: 'cm-link' },
  { tag: tags.url, class: 'cm-url' },
  { tag: tags.quote, class: 'cm-quote' },
  { tag: tags.processingInstruction, class: 'cm-formatting' },
  { tag: tags.meta, class: 'cm-formatting' },
  { tag: tags.comment, color: 'var(--text-muted)' },
  // Code block syntax highlighting
  { tag: tags.keyword, color: 'var(--accent-bright)' },
  { tag: tags.string, color: 'var(--secondary-bright)' },
  { tag: tags.number, color: 'var(--orange)' },
  { tag: tags.bool, color: 'var(--red)' },
  { tag: tags.variableName, color: 'var(--blue)' },
  { tag: tags.function(tags.variableName), color: 'var(--blue)' },
  { tag: tags.typeName, color: 'var(--warning)' },
  { tag: tags.className, color: 'var(--warning)' },
  { tag: tags.propertyName, color: 'var(--red)' },
  { tag: tags.operator, color: 'var(--cyan)' },
  { tag: tags.punctuation, color: 'var(--cyan)' },
])

function markdownPreferenceExtension(preferences: NotesEditorPreferences) {
  return [
    EditorView.theme({
      '&': {
        fontSize: `${markdownFontSizePx(preferences.markdownFontSize)}px`,
      },
      '.cm-content': {
        maxWidth: `${markdownWidthPx(preferences.markdownWidth)}px`,
      },
    }),
    EditorView.contentAttributes.of({
      spellcheck: String(preferences.spellcheck),
    }),
  ]
}

interface NoteEditorProps {
  note: VaultNote
  onChange: (content: string) => void
  onWikilinkClick: (link: string) => void
  allNoteTitles?: string[]
  allNotes?: VaultNote[]
  onSelectionChange?: (anchor: NoteSelectionAnchor) => void
  reviewMarkers?: NoteReviewMarker[]
  activeReviewId?: string | null
  preferences?: NotesEditorPreferences
}

interface HeadingInfo {
  level: number
  text: string
  lineNumber: number
}

const DOCUMENT_INFO_FIELDS = [
  { key: 'status', label: 'Status', placeholder: 'draft, final, submitted' },
  { key: 'tags', label: 'Tags', placeholder: 'school, essay' },
  { key: 'class', label: 'Class', placeholder: 'English' },
  { key: 'due', label: 'Due', placeholder: '2026-05-09' },
  { key: 'author', label: 'Author', placeholder: 'Your name' },
] as const

export default memo(function NoteEditor({
  note,
  onChange,
  onWikilinkClick,
  allNoteTitles = [],
  allNotes = [],
  onSelectionChange,
  reviewMarkers = [],
  activeReviewId = null,
  preferences = DEFAULT_NOTES_EDITOR_PREFERENCES,
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onWikilinkClickRef = useRef(onWikilinkClick)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const noteIdRef = useRef(note._id)
  const autocompleteCompartment = useRef(new Compartment())
  const reviewCompartment = useRef(new Compartment())
  const preferenceCompartment = useRef(new Compartment())
  const effectivePreferences = normalizeNotesEditorPreferences(preferences)
  const [draftContent, setDraftContent] = useState(note.content)
  const [docMode, setDocMode] = useState<'doc' | 'source' | 'split' | 'read'>(effectivePreferences.defaultMode)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [wordCountOpen, setWordCountOpen] = useState(false)
  const [selectionText, setSelectionText] = useState('')

  onChangeRef.current = onChange
  onWikilinkClickRef.current = onWikilinkClick
  onSelectionChangeRef.current = onSelectionChange

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const nextContent = update.state.doc.toString()
        setDraftContent(nextContent)
        onChangeRef.current(nextContent)
      }
      if (update.selectionSet || update.docChanged) {
        const selection = update.state.selection.main
        const from = Math.min(selection.from, selection.to)
        const to = Math.max(selection.from, selection.to)
        const fromLine = update.state.doc.lineAt(from)
        const toLine = update.state.doc.lineAt(to)
        const quote = from === to ? '' : update.state.doc.sliceString(from, to)
        setSelectionText(quote)
        onSelectionChangeRef.current?.({
          scope: from === to ? 'cursor' : 'selection',
          mode: 'markdown',
          start: from,
          end: to,
          from_line: fromLine.number,
          to_line: toLine.number,
          quote,
        })
      }
    })

    const clickHandler = EditorView.domEventHandlers({
      click(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false
        const line = view.state.doc.lineAt(pos)
        const col = pos - line.from
        const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
        let m
        while ((m = re.exec(line.text)) !== null) {
          if (col >= m.index && col <= m.index + m[0].length) {
            event.preventDefault()
            onWikilinkClickRef.current(m[1].trim())
            return true
          }
        }
        return false
      },
    })

    const state = EditorState.create({
      doc: note.content,
      extensions: [
        mcTheme,
        syntaxHighlighting(mcHighlighting),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        history(),
        drawSelection(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        placeholder('Start writing...'),
        keymap.of([
          { key: 'Mod-b', run: (v) => { toggleWrap(v, '**'); return true } },
          { key: 'Mod-i', run: (v) => { toggleWrap(v, '*'); return true } },
          { key: 'Mod-u', run: (v) => { toggleWrapPair(v, '<u>', '</u>'); return true } },
          { key: 'Mod-k', run: (v) => { insertLink(v); return true } },
          { key: 'Mod-Shift-s', run: (v) => { toggleWrap(v, '~~'); return true } },
          { key: 'Mod-Shift-x', run: (v) => { toggleWrap(v, '~~'); return true } },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...closeBracketsKeymap,
          indentWithTab,
        ]),
        autocompleteCompartment.current.of(
          autocompletion({
            override: [wikilinkCompletions(allNoteTitles), slashCommandCompletions],
            activateOnTyping: true,
          }),
        ),
        updateListener,
        clickHandler,
        imageEmbedPlugin,
        reviewCompartment.current.of(markdownReviewDecorations(reviewMarkers, activeReviewId)),
        preferenceCompartment.current.of(markdownPreferenceExtension(effectivePreferences)),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    noteIdRef.current = note._id
    setDraftContent(note.content)

    return () => { view.destroy(); viewRef.current = null }
     
  }, [note._id])

  useEffect(() => {
    setDocMode(effectivePreferences.defaultMode)
  }, [effectivePreferences.defaultMode, note._id])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: preferenceCompartment.current.reconfigure(markdownPreferenceExtension(effectivePreferences)),
    })
  }, [effectivePreferences.markdownFontSize, effectivePreferences.markdownWidth, effectivePreferences.spellcheck])

  useEffect(() => {
    const view = viewRef.current
    if (!view || note._id !== noteIdRef.current) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== note.content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: note.content },
      })
      setDraftContent(note.content)
    }
  }, [note.content, note._id])

  useEffect(() => {
    if (docMode !== 'source' && docMode !== 'split') return
    const view = viewRef.current
    if (!view || note._id !== noteIdRef.current) return
    const currentContent = view.state.doc.toString()
    if (currentContent === draftContent) return
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: draftContent },
    })
  }, [docMode, draftContent, note._id])

  // Update wikilink autocomplete when available note titles change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: autocompleteCompartment.current.reconfigure(
        autocompletion({
          override: [wikilinkCompletions(allNoteTitles), slashCommandCompletions],
          activateOnTyping: true,
        }),
      ),
    })
  }, [allNoteTitles])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: reviewCompartment.current.reconfigure(markdownReviewDecorations(reviewMarkers, activeReviewId)),
    })
  }, [activeReviewId, reviewMarkers])

  useEffect(() => {
    if (!activeReviewId) return
    const view = viewRef.current
    const marker = reviewMarkers.find((item) => item.id === activeReviewId)
    if (!view || !marker) return
    const [range] = resolveTextReviewRanges(view.state.doc.toString(), [marker], activeReviewId, 'markdown')
    if (!range) return
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
    })
    view.focus()
  }, [activeReviewId, reviewMarkers])

  const stats = useMemo(() => documentStats(draftContent), [draftContent])
  const selectionStats = useMemo(() => selectionText.trim() ? documentStats(selectionText) : null, [selectionText])

  const handleSelectionChange = useCallback((anchor: NoteSelectionAnchor) => {
    setSelectionText(anchor.scope === 'selection' ? anchor.quote ?? '' : '')
    onSelectionChangeRef.current?.(anchor)
  }, [])

  const headings = useMemo<HeadingInfo[]>(() => {
    return draftContent
      .split('\n')
      .map((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
        if (!match) return null
        return {
          level: match[1].length,
          text: match[2].trim(),
          lineNumber: index + 1,
        }
      })
      .filter((heading): heading is HeadingInfo => heading !== null)
  }, [draftContent])

  const draftProperties = useMemo(() => parseFrontmatter(draftContent).properties, [draftContent])

  const documentInfoFields = useMemo(() => {
    const used = new Set<string>(DOCUMENT_INFO_FIELDS.map((field) => field.key))
    const standard = DOCUMENT_INFO_FIELDS.map((field) => ({
      ...field,
      value: draftProperties[field.key] ?? '',
    }))
    const custom = Object.entries(draftProperties)
      .filter(([key, value]) => !used.has(key) && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0))
      .map(([key, value]) => ({
        key,
        label: key.replace(/[-_]/g, ' '),
        placeholder: '',
        value,
      }))
    return [...standard, ...custom].slice(0, 12)
  }, [draftProperties])

  const updateProperty = (key: string, value: string) => {
    const nextContent = setFrontmatterProperty(draftContent, key, value)
    setDraftContent(nextContent)
    onChangeRef.current(nextContent)
  }

  const linkedNotes = useMemo(() => {
    return note.links
      .map((link) => {
        const id = noteIdFromTitle(link, allNotes)
        const target = id ? allNotes.find((item) => item._id === id && item.type === 'note') : null
        return target ? { link, target } : { link, target: null }
      })
      .slice(0, 12)
  }, [allNotes, note.links])

  const previewContent = useMemo(() => expandNoteEmbeds(draftContent, allNotes, note._id), [allNotes, draftContent, note._id])
  const previewHtml = useMemo(
    () => markdownToSafeHtml(previewContent, { notes: allNotes, currentId: note._id }),
    [allNotes, note._id, previewContent],
  )

  const jumpToHeading = (lineNumber: number) => {
    if (docMode === 'read') setDocMode('source')
    requestAnimationFrame(() => {
      const view = viewRef.current
      if (!view) return
      const line = view.state.doc.line(lineNumber)
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      })
      view.focus()
    })
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      {(docMode === 'source' || docMode === 'split') && <EditorToolbar viewRef={viewRef} noteTitle={note.title} />}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {docMode === 'doc' && (
          <DocumentEditor
            markdown={draftContent}
            noteId={note._id}
            allNotes={allNotes}
            mode={docMode}
            onSelectionChange={handleSelectionChange}
            reviewMarkers={reviewMarkers}
            activeReviewId={activeReviewId}
            onMarkdownChange={(nextContent) => {
              setDraftContent(nextContent)
              onChangeRef.current(nextContent)
            }}
            onWikilinkOpen={onWikilinkClick}
            onAttachmentUpload={(file) => uploadAttachment(file, note.folder || 'attachments')}
          />
        )}
        <div
          ref={containerRef}
          style={{
            flex: docMode === 'split' ? '1 1 50%' : 1,
            minWidth: 0,
            display: docMode === 'source' || docMode === 'split' ? 'block' : 'none',
            overflow: 'hidden',
            userSelect: 'text',
            WebkitUserSelect: 'text' as never,
          }}
        />
        {(docMode === 'split' || docMode === 'read') && (
          <div
            style={{
              flex: docMode === 'split' ? '1 1 50%' : 1,
              minWidth: 0,
              overflow: 'auto',
              borderLeft: docMode === 'split' ? '1px solid var(--border)' : 'none',
              padding: '12px 48px 80px',
              background: 'var(--bg-base)',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            <div
              className="md-display-content"
              style={{ maxWidth: markdownWidthPx(effectivePreferences.markdownWidth) + 80, margin: '0 auto', color: 'var(--text-primary)', fontSize: markdownFontSizePx(effectivePreferences.markdownFontSize), lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
        {inspectorOpen && (
          <div
            style={{
              width: 220,
              minWidth: 220,
              borderLeft: '1px solid var(--border)',
              background: 'var(--bg-card-solid)',
              overflow: 'auto',
              padding: '10px 10px 16px',
              flexShrink: 0,
            }}
          >
            {docMode === 'doc' && (
              <div style={{ marginBottom: 14 }}>
                <PanelHeading icon={Tag} label="Document info" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {documentInfoFields.map(({ key, label, placeholder, value }) => (
                    <div key={key} style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2 }}>
                        {label}
                      </div>
                      <input
                        type="text"
                        value={Array.isArray(value) ? value.join(', ') : value}
                        placeholder={placeholder}
                        onChange={(event) => updateProperty(key, event.target.value)}
                        title={Array.isArray(value) ? value.join(', ') : value}
                        style={{
                          width: '100%',
                          minWidth: 0,
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-white-02)',
                          color: 'var(--text-secondary)',
                          fontSize: 11,
                          lineHeight: 1.35,
                          padding: '4px 6px',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {note.tags.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <PanelHeading icon={Tag} label="Tags" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {note.tags.slice(0, 18).map((tag) => (
                    <span
                      key={tag}
                      title={`#${tag}`}
                      style={{
                        maxWidth: '100%',
                        padding: '3px 7px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-white-02)',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {linkedNotes.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <PanelHeading icon={LinkSimple} label="Links" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {linkedNotes.map(({ link, target }, index) => (
                    <button
                      key={`${link}-${index}`}
                      type="button"
                      onClick={() => onWikilinkClick(link)}
                      className="hover-bg"
                      title={target ? target._id : `Create ${link}`}
                      style={{
                        width: '100%',
                        minHeight: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        color: target ? 'var(--text-secondary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: '4px 6px',
                      }}
                    >
                      <LinkSimple size={12} style={{ flexShrink: 0, opacity: target ? 0.75 : 0.35 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {target?.title || link}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {headings.length > 0 && (
              <>
                <PanelHeading icon={ListBullets} label="Outline" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {headings.map((heading, index) => (
                    <button
                      key={`${heading.lineNumber}-${index}`}
                      type="button"
                      onClick={() => jumpToHeading(heading.lineNumber)}
                      className="hover-bg"
                      title={heading.text}
                      style={{
                        width: '100%',
                        minHeight: 24,
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        color: heading.level <= 2 ? 'var(--text-secondary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: heading.level <= 2 ? 12 : 11,
                        fontWeight: heading.level === 1 ? 600 : 400,
                        padding: '4px 6px',
                        paddingLeft: 6 + Math.min(heading.level - 1, 4) * 10,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {heading.text}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div
        style={{
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 18px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-card-solid)',
          color: 'var(--text-muted)',
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {[
            { id: 'doc' as const, icon: FileText, label: 'Doc' },
            { id: 'source' as const, icon: PenNib, label: 'Markdown' },
            { id: 'split' as const, icon: Columns, label: 'Split' },
            { id: 'read' as const, icon: Eye, label: 'Read' },
          ].map((mode) => {
            const Icon = mode.icon
            const active = docMode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setDocMode(mode.id)}
                title={mode.label}
                aria-label={`${mode.label} mode`}
                style={{
                  height: 22,
                  minWidth: 26,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--bg-white-04)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <Icon size={13} />
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setInspectorOpen((open) => !open)}
            title="Document info, tags, links, and outline"
            aria-label="Toggle document inspector"
            style={{
              height: 22,
              minWidth: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: inspectorOpen ? 'var(--bg-white-04)' : 'transparent',
              color: inspectorOpen ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Tag size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (docMode === 'read') setDocMode('source')
              requestAnimationFrame(() => {
                const view = viewRef.current
                if (!view) return
                openSearchPanel(view)
                view.focus()
              })
            }}
            title="Find in note"
            aria-label="Find in note"
            style={{
              height: 22,
              minWidth: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <MagnifyingGlass size={13} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => setWordCountOpen(true)}
            title="Word count"
            aria-label="Open word count"
            style={{
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 11,
              padding: '3px 5px',
            }}
          >
            {stats.words} words
          </button>
          <span>{stats.chars} chars</span>
          <span>{stats.lines} lines</span>
          <span>{stats.links} links</span>
          <span>{stats.tags} tags</span>
        </div>
      </div>
      {wordCountOpen && (
        <WordCountDialog
          stats={stats}
          selectionStats={selectionStats}
          onClose={() => setWordCountOpen(false)}
        />
      )}
    </div>
  )
})

function expandNoteEmbeds(content: string, allNotes: VaultNote[], currentId: string): string {
  return content.replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (match, rawTarget: string) => {
    if (IMAGE_EXTENSIONS.test(rawTarget.trim())) return match
    const id = noteIdFromTitle(rawTarget, allNotes)
    const embedded = id ? allNotes.find((item) => item._id === id && item._id !== currentId && item.type === 'note') : null
    if (!embedded) return match
    const body = embedded.content
      .replace(/^---[\s\S]*?\n---\s*/m, '')
      .trim()
      .split('\n')
      .slice(0, 32)
      .join('\n')
    return `\n> [!note] ${embedded.title || rawTarget}\n${body.split('\n').map((line) => `> ${line}`).join('\n')}\n`
  })
}

function WordCountDialog({
  stats,
  selectionStats,
  onClose,
}: {
  stats: DocumentStats
  selectionStats: DocumentStats | null
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Word count"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 0, 0, 0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <section
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 650 }}>Word count</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>Document and current selection</div>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          <WordCountSection title="Document" stats={stats} />
          <WordCountSection title="Selection" stats={selectionStats} emptyLabel="No selected text" />
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-white-04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  )
}

function WordCountSection({
  title,
  stats,
  emptyLabel,
}: {
  title: string
  stats: DocumentStats | null
  emptyLabel?: string
}) {
  const rows = stats ? [
    ['Words', stats.words],
    ['Characters', stats.chars],
    ['Characters excluding spaces', stats.charsNoSpaces],
    ['Paragraphs', stats.paragraphs],
    ['Lines', stats.lines],
    ['Estimated pages', stats.estimatedPages],
  ] : []

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <div style={{ padding: '7px 9px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 650, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {!stats ? (
        <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 12 }}>{emptyLabel || 'No text'}</div>
      ) : rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 12, padding: '7px 9px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 650 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function PanelHeading({
  icon: Icon,
  label,
  actionLabel,
  onAction,
}: {
  icon: ElementType
  label: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      <Icon size={13} />
      <span style={{ flex: 1 }}>{label}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="hover-bg"
          style={{
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 10,
            padding: '2px 4px',
            textTransform: 'none',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
