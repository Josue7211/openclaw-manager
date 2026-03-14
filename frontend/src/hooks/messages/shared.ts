// Matches anything.pluginPayloadAttachment and similar iMessage plugin junk
const PLUGIN_PAYLOAD_RE = /\S*\.pluginPayload\w*\r?\n?/gi
// Object replacement characters and other invisible iMessage garbage
const IMSG_JUNK_RE = /[\ufffc\ufffd\u2028\u2029\u200b]+/g

export function cleanPayloadText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(PLUGIN_PAYLOAD_RE, '')
    .replace(IMSG_JUNK_RE, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
