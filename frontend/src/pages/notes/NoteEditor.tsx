import { useEffect, useRef, memo } from 'react'
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
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { API_BASE } from '@/lib/api'
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
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import type { VaultNote } from './types'

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
      const src = `${API_BASE}/api/vault/media/${encodeURIComponent(filename)}`
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

interface NoteEditorProps {
  note: VaultNote
  onChange: (content: string) => void
  onWikilinkClick: (link: string) => void
}

export default memo(function NoteEditor({ note, onChange, onWikilinkClick }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onWikilinkClickRef = useRef(onWikilinkClick)
  const noteIdRef = useRef(note._id)

  onChangeRef.current = onChange
  onWikilinkClickRef.current = onWikilinkClick

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
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
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...closeBracketsKeymap,
          indentWithTab,
        ]),
        updateListener,
        clickHandler,
        imageEmbedPlugin,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    noteIdRef.current = note._id

    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note._id])

  useEffect(() => {
    const view = viewRef.current
    if (!view || note._id !== noteIdRef.current) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== note.content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: note.content },
      })
    }
  }, [note.content, note._id])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg-base)',
        userSelect: 'text',
        WebkitUserSelect: 'text' as never,
      }}
    />
  )
})
