/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface Participant { address: string; service: string }

export interface Conversation {
  guid: string
  chatId: string
  displayName: string | null
  participants: Participant[]
  service: string
  lastMessage: string | null
  lastDate: number | null
  lastFromMe: number
  isUnread?: boolean
  isJunk?: boolean
  [key: string]: unknown
}

export interface Reaction {
  type: number        // 2000–2005
  fromMe: boolean
  handle?: string
}

export interface Attachment {
  guid: string
  mimeType: string
  transferName: string
  isSticker?: boolean
  uti?: string
}

export interface Message {
  originalROWID?: number
  guid: string
  text: string
  dateCreated: number
  isFromMe: boolean
  isAudioMessage?: boolean
  handle?: { address: string; service: string }
  attachments?: Attachment[]
  balloonBundleId?: string | null
  groupTitle?: string | null
  groupActionType?: number
  itemType?: number
  dateRead?: number | null
  dateDelivered?: number | null
  reactions?: Reaction[]
  threadOriginatorGuid?: string | null
  _failed?: boolean
  _failedText?: string
  _failedChatGuid?: string
  _failedReplyGuid?: string | null
  [key: string]: unknown
}

export type ServiceFilter = 'all' | 'iMessage' | 'SMS'

export interface ConvContextMenu {
  x: number
  y: number
  convGuid: string
  isUnread: boolean
  isMuted: boolean
  isPinned: boolean
}
