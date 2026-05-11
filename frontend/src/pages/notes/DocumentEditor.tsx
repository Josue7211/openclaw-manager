import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
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
import {
  Code,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
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
import type { VaultNote } from './types'
import { docToMarkdown, markdownToDoc, splitFrontmatter, type ProseMirrorDoc } from './markdownBridge'

export interface DocumentEditorProps {
  markdown: string
  noteId: string
  allNotes: VaultNote[]
  mode: 'doc' | 'split' | 'read'
  onMarkdownChange: (markdown: string) => void
  onWikilinkOpen: (link: string) => void
  onAttachmentUpload?: (file: File) => Promise<{ id: string; mime: string; size: number; created_at: number }>
}

const extensions = [
  StarterKit.configure({
    link: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: {
      rel: 'noopener noreferrer',
      target: '_blank',
    },
  }),
  Image.configure({ allowBase64: true }),
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
  Typography,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
]

export default function DocumentEditor({
  markdown,
  noteId,
  allNotes: _allNotes,
  mode: _mode,
  onMarkdownChange,
  onWikilinkOpen,
  onAttachmentUpload,
}: DocumentEditorProps) {
  const frontmatterRef = useRef(splitFrontmatter(markdown).frontmatter)
  const lastMarkdownRef = useRef(markdown)
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
    onUpdate({ editor }) {
      const next = docToMarkdown(editor.getJSON() as ProseMirrorDoc, frontmatterRef.current)
      lastMarkdownRef.current = next
      onMarkdownChange(next)
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

  return (
    <div className="tiptap-note-editor">
      <DocumentToolbar editor={editor} onAttachmentUpload={onAttachmentUpload} />
      <div className="tiptap-note-scroller">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function DocumentToolbar({
  editor,
  onAttachmentUpload,
}: {
  editor: Editor | null
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
          <ToolbarTextButton label="Row +" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarTextButton label="Col +" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolbarTextButton label="Row -" onClick={() => editor.chain().focus().deleteRow().run()} />
          <ToolbarTextButton label="Col -" onClick={() => editor.chain().focus().deleteColumn().run()} />
        </>
      )}
    </div>
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
    const src = window.prompt('Image URL or /api/vault/media?id=...')
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
    src: `/api/vault/media?id=${encodeURIComponent(uploaded.id)}`,
    alt: file.name,
    title: uploaded.id,
  }).run()
}
