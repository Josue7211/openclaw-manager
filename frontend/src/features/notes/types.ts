export interface VaultNote {
  _id: string
  _rev?: string
  type: 'note' | 'attachment'
  title: string
  content: string
  folder: string
  tags: string[]
  links: string[]
  aliases?: string[]
  properties?: Record<string, string | string[]>
  created_at: number
  updated_at: number
  trashed_at?: number | null
  trash_origin_path?: string | null
}

export interface VaultFolder {
  _id: string
  _rev?: string
  type: 'folder'
  path: string
  name: string
  created_at: number
  updated_at: number
  trashed_at?: number | null
  trash_origin_path?: string | null
}

export interface NoteSelectionAnchor {
  scope: 'selection' | 'cursor' | 'document'
  mode?: 'markdown' | 'document'
  start?: number
  end?: number
  from_line?: number
  to_line?: number
  quote?: string
}

export interface NoteReviewMarker {
  id: string
  kind: 'comment' | 'suggestion'
  status?: string
  anchor?: NoteSelectionAnchor | Record<string, unknown>
}

export interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  notes: VaultNote[]
  isExpanded: boolean
}

export interface GraphNode {
  id: string
  title: string
  links: number
  val: number
  cluster?: string
}

export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}
