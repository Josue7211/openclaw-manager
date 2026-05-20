import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Extension, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
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
  Code,
  FileText,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  MagnifyingGlass,
  Minus,
  PaintBucket,
  Quotes,
  Table as TableIcon,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextH,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
} from '@phosphor-icons/react'
import type { NoteReviewMarker, NoteSelectionAnchor, VaultNote } from './types'
import { docToMarkdown, markdownToDoc, splitFrontmatter, type ProseMirrorDoc } from './markdownBridge'
import { documentPageSettings, setFrontmatterProperty, type DocumentMarginPreset, type DocumentPageOrientation, type DocumentPageSize } from './export'
import { normalizeSelectionAnchor } from './reviewAnchors'

type PagePreset = 'compact' | 'normal' | 'wide'

const PAGE_PRESET_STORAGE_KEY = 'mc-notes-page-preset'
const PAGE_SIZE_STORAGE_KEY = 'mc-notes-page-size'
const PAGE_MARGIN_STORAGE_KEY = 'mc-notes-page-margins'
const PAGE_ORIENTATION_STORAGE_KEY = 'mc-notes-page-orientation'
const OUTLINE_OPEN_STORAGE_KEY = 'mc-notes-doc-outline-open'

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
}

interface DocumentReviewHighlightState {
  ranges: DocumentReviewRange[]
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
            return DecorationSet.create(
              state.doc,
              highlightState.ranges.map((range) =>
                Decoration.inline(range.from, range.to, {
                  class: [
                    range.kind === 'comment' ? 'tiptap-review-comment' : 'tiptap-review-suggestion',
                    range.active ? 'tiptap-review-active' : '',
                  ].filter(Boolean).join(' '),
                  'data-review-id': range.id,
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})

const PageBreak = Node.create({
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

const extensions = [
  StarterKit.configure({
    link: false,
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
  Color,
  Highlight.configure({ multicolor: true }),
  Underline,
  Typography,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  PageBreak,
  DocumentFindHighlight,
  DocumentReviewHighlight,
]

export default function DocumentEditor({
  markdown,
  noteId,
  allNotes: _allNotes,
  mode: _mode,
  onMarkdownChange,
  onWikilinkOpen,
  onAttachmentUpload,
  onSelectionChange,
  reviewMarkers = [],
  activeReviewId = null,
}: DocumentEditorProps) {
  const frontmatterRef = useRef(splitFrontmatter(markdown).frontmatter)
  const lastMarkdownRef = useRef(markdown)
  const rootRef = useRef<HTMLDivElement>(null)
  const [pagePreset, setPagePreset] = useState<PagePreset>(() => {
    const stored = localStorage.getItem(PAGE_PRESET_STORAGE_KEY)
    return stored === 'compact' || stored === 'wide' ? stored : 'normal'
  })
  const [pageSize, setPageSize] = useState<DocumentPageSize>(() => documentPageSettings(markdown).size)
  const [pageMargins, setPageMargins] = useState<DocumentMarginPreset>(() => documentPageSettings(markdown).margins)
  const [pageOrientation, setPageOrientation] = useState<DocumentPageOrientation>(() => documentPageSettings(markdown).orientation)
  const [pageHeader, setPageHeader] = useState(() => documentPageSettings(markdown).header)
  const [pageFooter, setPageFooter] = useState(() => documentPageSettings(markdown).footer)
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem(OUTLINE_OPEN_STORAGE_KEY) === 'true')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [docVersion, setDocVersion] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(-1)
  const [findMatchCase, setFindMatchCase] = useState(false)
  const [replaceText, setReplaceText] = useState('')
  const initialDoc = useMemo(() => markdownToDoc(markdown), [noteId])

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
      handleClickOn(_view, _pos, node, _nodePos, event) {
        const target = event.target as HTMLElement
        const link = target.closest('a[href^="#note:"]')
        if (link instanceof HTMLAnchorElement) {
          event.preventDefault()
          onWikilinkOpen(decodeURIComponent(link.getAttribute('href')!.slice('#note:'.length)))
          return true
        }
        if (node.type.name === 'image') return false
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
    },
    onCreate({ editor }) {
      setOutline(collectOutline(editor))
    },
    onUpdate({ editor }) {
      const next = docToMarkdown(editor.getJSON() as ProseMirrorDoc, frontmatterRef.current)
      lastMarkdownRef.current = next
      setOutline(collectOutline(editor))
      setDocVersion((value) => value + 1)
      onMarkdownChange(next)
    },
    onSelectionUpdate({ editor }) {
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
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    frontmatterRef.current = splitFrontmatter(markdown).frontmatter
    if (!editor || markdown === lastMarkdownRef.current) return
    const nextDoc = markdownToDoc(markdown)
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastMarkdownRef.current = markdown
  }, [editor, markdown])

  useEffect(() => {
    const page = documentPageSettings(markdown)
    setPageSize(page.size)
    setPageMargins(page.margins)
    setPageOrientation(page.orientation)
    setPageHeader(page.header)
    setPageFooter(page.footer)
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

  const updatePageProperty = useCallback((key: 'page_size' | 'page_margins' | 'page_orientation' | 'document_header' | 'document_footer', value: string) => {
    const next = setFrontmatterProperty(lastMarkdownRef.current, key, value)
    frontmatterRef.current = splitFrontmatter(next).frontmatter
    lastMarkdownRef.current = next
    onMarkdownChange(next)
  }, [onMarkdownChange])

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

  const handlePageHeaderChange = useCallback(() => {
    const next = window.prompt('Document header', pageHeader) ?? null
    if (next === null) return
    setPageHeader(next.trim())
    updatePageProperty('document_header', next)
  }, [pageHeader, updatePageProperty])

  const handlePageFooterChange = useCallback(() => {
    const next = window.prompt('Document footer', pageFooter) ?? null
    if (next === null) return
    setPageFooter(next.trim())
    updatePageProperty('document_footer', next)
  }, [pageFooter, updatePageProperty])

  useEffect(() => {
    localStorage.setItem(OUTLINE_OPEN_STORAGE_KEY, outlineOpen ? 'true' : 'false')
  }, [outlineOpen])

  const findMatches = useMemo(() => {
    if (!editor || !findQuery) return []
    return collectFindRanges(editor, findQuery, findMatchCase)
  }, [docVersion, editor, findMatchCase, findQuery])

  const activeFindIndex = findMatches.length
    ? Math.min(Math.max(findIndex, 0), findMatches.length - 1)
    : -1

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
    <div ref={rootRef} className="tiptap-note-editor" data-page-preset={pagePreset} data-page-margins={pageMargins}>
      <DocumentToolbar
        editor={editor}
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
        onPageHeaderChange={handlePageHeaderChange}
        onPageFooterChange={handlePageFooterChange}
        outlineOpen={outlineOpen}
        onOutlineOpenChange={setOutlineOpen}
        findOpen={findOpen}
        onFindOpenChange={setFindOpen}
        onAttachmentUpload={onAttachmentUpload}
      />
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
        <div className="tiptap-note-scroller">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

function DocumentToolbar({
  editor,
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
  onPageHeaderChange,
  onPageFooterChange,
  outlineOpen,
  onOutlineOpenChange,
  findOpen,
  onFindOpenChange,
  onAttachmentUpload,
}: {
  editor: Editor | null
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
  onPageHeaderChange: () => void
  onPageFooterChange: () => void
  outlineOpen: boolean
  onOutlineOpenChange: (open: boolean) => void
  findOpen: boolean
  onFindOpenChange: (open: boolean) => void
  onAttachmentUpload?: DocumentEditorProps['onAttachmentUpload']
}) {
  if (!editor) {
    return <div className="tiptap-note-toolbar" aria-label="Document formatting" />
  }

  return (
    <div className="tiptap-note-toolbar" role="toolbar" aria-label="Document formatting">
      <select
        aria-label="Paragraph style"
        value={currentBlock(editor)}
        onChange={(event) => setBlock(editor, event.target.value)}
        className="tiptap-note-select"
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading-1">Heading 1</option>
        <option value="heading-2">Heading 2</option>
        <option value="heading-3">Heading 3</option>
      </select>
      <select
        aria-label="Page zoom width"
        value={pagePreset}
        onChange={(event) => onPagePresetChange(event.target.value as PagePreset)}
        className="tiptap-note-select tiptap-note-page-select"
      >
        <option value="compact">Narrow view</option>
        <option value="normal">Normal view</option>
        <option value="wide">Wide view</option>
      </select>
      <select
        aria-label="Page size"
        value={pageSize}
        onChange={(event) => onPageSizeChange(event.target.value as DocumentPageSize)}
        className="tiptap-note-select tiptap-note-page-select"
      >
        <option value="letter">Letter</option>
        <option value="a4">A4</option>
      </select>
      <select
        aria-label="Page margins"
        value={pageMargins}
        onChange={(event) => onPageMarginsChange(event.target.value as DocumentMarginPreset)}
        className="tiptap-note-select tiptap-note-page-select"
      >
        <option value="compact">Compact margins</option>
        <option value="normal">Normal margins</option>
        <option value="roomy">Roomy margins</option>
      </select>
      <select
        aria-label="Page orientation"
        value={pageOrientation}
        onChange={(event) => onPageOrientationChange(event.target.value as DocumentPageOrientation)}
        className="tiptap-note-select tiptap-note-page-select"
      >
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
      </select>
      <ToolbarTextButton label={pageHeader ? 'Header*' : 'Header'} onClick={onPageHeaderChange} />
      <ToolbarTextButton label={pageFooter ? 'Footer*' : 'Footer'} onClick={onPageFooterChange} />
      <ToolbarButton active={outlineOpen} label="Outline" onClick={() => onOutlineOpenChange(!outlineOpen)}>
        <ListBullets size={14} />
      </ToolbarButton>
      <ToolbarButton active={findOpen} label="Find and replace" onClick={() => onFindOpenChange(!findOpen)}>
        <MagnifyingGlass size={14} />
      </ToolbarButton>
      <Separator />
      <ToolbarButton active={editor.isActive('bold')} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
        <TextB size={14} weight="bold" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <TextItalic size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('underline')} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <TextUnderline size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('strike')} label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
        <TextStrikethrough size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('code')} label="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code size={14} />
      </ToolbarButton>
      <ColorButton label="Text color" onChange={(value) => editor.chain().focus().setColor(value).run()} />
      <ColorButton label="Highlight" icon={<PaintBucket size={14} />} onChange={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()} />
      <Separator />
      <ToolbarButton active={editor.isActive('bulletList')} label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <ListBullets size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('orderedList')} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListNumbers size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('taskList')} label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('blockquote')} label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quotes size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('codeBlock')} label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <TextH size={14} />
      </ToolbarButton>
      <ToolbarButton label="Link" onClick={() => setLink(editor)}>
        <LinkSimple size={14} />
      </ToolbarButton>
      <ToolbarButton label="Image" onClick={() => void insertImage(editor, onAttachmentUpload)}>
        <ImageSquare size={14} />
      </ToolbarButton>
      <ToolbarButton label="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon size={14} />
      </ToolbarButton>
      <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={14} />
      </ToolbarButton>
      <ToolbarButton label="Page break" onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}>
        <FileText size={14} />
      </ToolbarButton>
      <Separator />
      <ToolbarButton label="Align left" onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <TextAlignLeft size={14} />
      </ToolbarButton>
      <ToolbarButton label="Align center" onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <TextAlignCenter size={14} />
      </ToolbarButton>
      <ToolbarButton label="Align right" onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <TextAlignRight size={14} />
      </ToolbarButton>
      {editor.isActive('table') && (
        <>
          <Separator />
          <ToolbarTextButton label="Hdr row" onClick={() => editor.chain().focus().toggleHeaderRow().run()} />
          <ToolbarTextButton label="Hdr col" onClick={() => editor.chain().focus().toggleHeaderColumn().run()} />
          <ToolbarTextButton label="Row +" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarTextButton label="Col +" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolbarTextButton label="Row -" onClick={() => editor.chain().focus().deleteRow().run()} />
          <ToolbarTextButton label="Col -" onClick={() => editor.chain().focus().deleteColumn().run()} />
          <ToolbarTextButton label="Merge" onClick={() => editor.chain().focus().mergeCells().run()} />
          <ToolbarTextButton label="Split" onClick={() => editor.chain().focus().splitCell().run()} />
          <ToolbarTextButton label="Table -" onClick={() => editor.chain().focus().deleteTable().run()} />
        </>
      )}
      {editor.isActive('image') && (
        <>
          <Separator />
          <ToolbarTextButton label="Alt" onClick={() => editImageAttr(editor, 'alt')} />
          <ToolbarTextButton label="Title" onClick={() => editImageAttr(editor, 'title')} />
          <ToolbarTextButton label="Width" onClick={() => editImageWidth(editor)} />
          <ToolbarTextButton label="Img -" onClick={() => editor.chain().focus().deleteSelection().run()} />
        </>
      )}
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

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="tiptap-note-button hover-bg" data-active={active ? 'true' : 'false'} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}

function ToolbarTextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="tiptap-note-text-button hover-bg" title={label} onClick={onClick}>
      {label}
    </button>
  )
}

function ColorButton({ label, icon, onChange }: { label: string; icon?: ReactNode; onChange: (value: string) => void }) {
  return (
    <label className="tiptap-note-button hover-bg" title={label}>
      {icon ?? <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>}
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
    if (!anchor || anchor.scope !== 'selection') continue

    const direct = anchor.mode === 'document' && typeof anchor.start === 'number' && typeof anchor.end === 'number'
      ? {
          from: Math.max(0, Math.min(anchor.start, docSize)),
          to: Math.max(0, Math.min(anchor.end, docSize)),
        }
      : null
    const directMatches = direct && direct.to > direct.from && (!anchor.quote || editor.state.doc.textBetween(direct.from, direct.to, '\n') === anchor.quote)
    const range = directMatches
      ? direct
      : findQuoteInDocument(editor, anchor.quote, quoteOffsets)
    if (!range || range.to <= range.from) continue
    ranges.push({
      id: marker.id,
      kind: marker.kind,
      from: range.from,
      to: range.to,
      active: marker.id === activeId,
    })
  }

  return ranges.sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id))
}

function findQuoteInDocument(
  editor: Editor,
  quote: string | undefined,
  quoteOffsets: Map<string, number>,
): { from: number; to: number } | null {
  const needle = quote?.trim()
  if (!needle) return null
  let seen = 0
  const targetOffset = quoteOffsets.get(needle) ?? 0
  let found: { from: number; to: number } | null = null

  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return
    const index = node.text.indexOf(needle, Math.max(0, targetOffset - seen))
    if (index >= 0) {
      found = { from: pos + index, to: pos + index + needle.length }
      quoteOffsets.set(needle, seen + index + needle.length)
      return false
    }
    seen += node.text.length
  })

  return found
}

function nextFindIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1
  if (current < 0) return direction > 0 ? 0 : count - 1
  return (current + direction + count) % count
}

function editImageAttr(editor: Editor, attr: 'alt' | 'title') {
  const current = String(editor.getAttributes('image')[attr] || '')
  const next = window.prompt(attr === 'alt' ? 'Image alt text' : 'Image title', current)
  if (next === null) return
  editor.chain().focus().updateAttributes('image', { [attr]: next }).run()
}

function editImageWidth(editor: Editor) {
  const current = String(editor.getAttributes('image').width || '')
  const next = window.prompt('Image width in pixels', current)
  if (next === null) return
  const width = normalizeImageWidth(next)
  editor.chain().focus().updateAttributes('image', { width: width ?? null }).run()
}

function normalizeImageWidth(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(80, Math.min(1400, Math.round(value)))
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{2,4})(?:px)?$/i)
  return match ? Math.max(80, Math.min(1400, Number(match[1]))) : null
}

function setLink(editor: Editor) {
  const previousUrl = editor.getAttributes('link').href
  const url = window.prompt('Link URL or [[note]]', previousUrl)
  if (url === null) return
  if (!url) {
    editor.chain().focus().unsetLink().run()
    return
  }
  const wiki = url.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
  const href = wiki ? `#note:${encodeURIComponent(wiki[1].trim())}` : url
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

async function insertImage(editor: Editor, onAttachmentUpload?: DocumentEditorProps['onAttachmentUpload']) {
  if (!onAttachmentUpload) {
    const src = window.prompt('Image URL or /api/vault/local/media?id=...')
    if (!src) return
    editor.chain().focus().setImage({ src }).run()
    return
  }
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
