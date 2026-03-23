export interface VncStatus {
  active: number
  max: number
  available: number
}

export interface VncOptions {
  quality?: number        // 0-9, default 6
  compression?: number    // 0-9, default 2
  viewOnly?: boolean      // default false
}

export interface UseVncReturn {
  connected: boolean
  error: string | null
  disconnect: () => void
  reconnect: () => void
  sendClipboard: (text: string) => void
}
