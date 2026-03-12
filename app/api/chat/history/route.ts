import { NextResponse } from 'next/server'
import fs from 'fs'
import { getSessionFile } from '@/lib/openclaw'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  images?: string[]
}

// Strip the "[Timestamp] Sender metadata" prefix OpenClaw wraps inbound messages with
// Also extract [Image: source: /path] annotations and return them separately
function cleanUserText(raw: string): { text: string; imagePaths: string[] } {
  const imagePaths: string[] = []
  // Extract all image annotations: [Image: source: /path] and [Attached image: /path]
  const withoutImages = raw
    .replace(/\[Image:\s*source:\s*([^\]]+)\]/g, (_, p) => {
      imagePaths.push(p.trim())
      return ''
    })
    .replace(/\[Attached image:\s*([^\]]+)\]/g, (_, p) => {
      imagePaths.push(p.trim())
      return ''
    })
  const text = withoutImages
    .replace(/^Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/m, '')
    .replace(/^\[.*?\]\s+/, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return { text, imagePaths }
}

// Strip [[reply_to_current]] and [[reply_to:...]] tags from assistant messages
function cleanAssistantText(raw: string): string {
  return raw
    .replace(/\[\[\s*reply_to_current\s*\]\]\s*/g, '')
    .replace(/\[\[\s*reply_to\s*:\s*[^\]]*\]\]\s*/g, '')
    .trim()
}

export function parseMessages(filePath: string): ChatMessage[] {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
  const msgs: ChatMessage[] = []

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      if (entry.type !== 'message') continue
      const { role, content } = entry.message
      if (!Array.isArray(content) && typeof content !== 'string') continue

      // User messages
      if (role === 'user') {
        const parts = Array.isArray(content) ? content : [{ type: 'text', text: content }]
        const textParts = parts.filter((p: any) => p.type === 'text')
        const imageParts = parts.filter((p: any) => p.type === 'image_url' || p.type === 'image')
        const rawText = textParts.map((p: any) => p.text || '').join('\n')
        const { text, imagePaths } = cleanUserText(rawText)

        // Build image URLs from inline content parts
        const inlineImages = imageParts.map((p: any) => {
          if (p.image_url?.url) return p.image_url.url          // data URL from completions API
          if (p.data) { const mime = p.data.startsWith('/9j/') ? 'image/jpeg' : p.data.startsWith('iVBOR') ? 'image/png' : 'image/jpeg'; return `data:${mime};base64,${p.data}` } // base64 from JSONL
          if (p.source?.data) return `data:${p.source.media_type || 'image/jpeg'};base64,${p.source.data}`
          return ''
        }).filter(Boolean)

        // Build image URLs for file-path annotations (old gateway behavior)
        const pathImages = imagePaths.map(
          (p) => `/api/chat/image?path=${encodeURIComponent(p)}`
        )

        const allImages = [...inlineImages, ...pathImages]
        if (!text && allImages.length === 0) continue
        // Hide internal session-trigger messages from the UI
        if (text.startsWith('A new session was started via /new or /reset') ||
            text === '/new' || text === '/reset') continue
        msgs.push({
          id: entry.id,
          role: 'user',
          text,
          timestamp: entry.timestamp,
          images: allImages,
        })
      }

      // Assistant messages — only text content, skip toolCall/thinking entries
      if (role === 'assistant') {
        const parts = Array.isArray(content) ? content : [{ type: 'text', text: content }]
        const textParts = parts.filter((p: any) => p.type === 'text')
        if (textParts.length === 0) continue
        const raw = textParts.map((p: any) => p.text || '').join('\n').trim()
        const text = cleanAssistantText(raw)
        if (!text) continue
        msgs.push({ id: entry.id, role: 'assistant', text, timestamp: entry.timestamp })
      }
    } catch { /* skip malformed lines */ }
  }

  return msgs
}

export async function GET() {
  const filePath = getSessionFile()
  if (!filePath) return NextResponse.json({ messages: [] })
  const messages = parseMessages(filePath)
  return NextResponse.json({ messages })
}
