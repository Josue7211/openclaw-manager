import { noteIdFromTitle } from '@/lib/vault'
import type { VaultNote } from './types'

export const CANVAS_FOLDER = 'Canvas'
export const CANVAS_TITLE = 'Knowledge canvas'
export const CANVAS_NOTE_ID = `${CANVAS_FOLDER}/knowledge-canvas.md`

export interface CanvasNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasData {
  version: 1
  nodes: CanvasNode[]
}

export interface CanvasLink {
  source: string
  target: string
}

const CANVAS_BLOCK_RE = /```clawcontrol-canvas\s*([\s\S]*?)```/m
const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 128

export function isCanvasBoardNote(note: VaultNote): boolean {
  return note._id === CANVAS_NOTE_ID || (note.folder === CANVAS_FOLDER && note.title === CANVAS_TITLE)
}

export function parseCanvasData(content: string): CanvasData {
  const match = content.match(CANVAS_BLOCK_RE)
  if (!match) return emptyCanvas()
  try {
    const raw = JSON.parse(match[1]) as Partial<CanvasData>
    if (!Array.isArray(raw.nodes)) return emptyCanvas()
    return {
      version: 1,
      nodes: raw.nodes
        .map(normalizeCanvasNode)
        .filter((node): node is CanvasNode => node !== null),
    }
  } catch {
    return emptyCanvas()
  }
}

export function serializeCanvasNote(data: CanvasData): string {
  const normalized: CanvasData = {
    version: 1,
    nodes: data.nodes.map((node) => ({
      id: node.id,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width || DEFAULT_NODE_WIDTH),
      height: Math.round(node.height || DEFAULT_NODE_HEIGHT),
    })),
  }
  return [
    '---',
    'type: canvas',
    'privacy: local',
    '---',
    '',
    `# ${CANVAS_TITLE}`,
    '',
    '```clawcontrol-canvas',
    JSON.stringify(normalized, null, 2),
    '```',
    '',
  ].join('\n')
}

export function buildInitialCanvasData(notes: VaultNote[], limit = 24): CanvasData {
  const nodes = visibleCanvasNotes(notes)
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, limit)
    .map((note, index) => layoutNode(note._id, index))
  return { version: 1, nodes }
}

export function hydrateCanvasData(data: CanvasData, notes: VaultNote[], limit = 24): CanvasData {
  const validIds = new Set(visibleCanvasNotes(notes).map((note) => note._id))
  const nodes = data.nodes.filter((node) => validIds.has(node.id))
  if (nodes.length) return { version: 1, nodes }
  return buildInitialCanvasData(notes, limit)
}

export function addCanvasNode(data: CanvasData, noteId: string): CanvasData {
  if (data.nodes.some((node) => node.id === noteId)) return data
  return {
    version: 1,
    nodes: [...data.nodes, layoutNode(noteId, data.nodes.length)],
  }
}

export function buildCanvasLinks(data: CanvasData, notes: VaultNote[]): CanvasLink[] {
  const nodeIds = new Set(data.nodes.map((node) => node.id))
  const noteById = new Map(notes.map((note) => [note._id, note]))
  const links = new Map<string, CanvasLink>()

  for (const node of data.nodes) {
    const note = noteById.get(node.id)
    if (!note) continue
    for (const link of note.links) {
      const target = noteIdFromTitle(link, notes)
      if (!target || !nodeIds.has(target) || target === note._id) continue
      const key = [note._id, target].sort().join('->')
      links.set(key, { source: note._id, target })
    }
  }

  return Array.from(links.values())
}

function emptyCanvas(): CanvasData {
  return { version: 1, nodes: [] }
}

function visibleCanvasNotes(notes: VaultNote[]) {
  return notes.filter((note) =>
    note.type === 'note' &&
    !isCanvasBoardNote(note) &&
    !note.trashed_at &&
    note.folder !== 'Trash' &&
    !note.folder.startsWith('Trash/'),
  )
}

function normalizeCanvasNode(raw: unknown): CanvasNode | null {
  if (!raw || typeof raw !== 'object') return null
  const node = raw as Record<string, unknown>
  if (typeof node.id !== 'string' || !node.id) return null
  return {
    id: node.id,
    x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0,
    y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0,
    width: typeof node.width === 'number' && Number.isFinite(node.width) ? node.width : DEFAULT_NODE_WIDTH,
    height: typeof node.height === 'number' && Number.isFinite(node.height) ? node.height : DEFAULT_NODE_HEIGHT,
  }
}

function layoutNode(id: string, index: number): CanvasNode {
  const column = index % 4
  const row = Math.floor(index / 4)
  return {
    id,
    x: 40 + column * 280,
    y: 40 + row * 180,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  }
}
