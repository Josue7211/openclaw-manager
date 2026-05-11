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
}

export interface VaultFolder {
  _id: string
  _rev?: string
  type: 'folder'
  path: string
  name: string
  created_at: number
  updated_at: number
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
}

export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}
