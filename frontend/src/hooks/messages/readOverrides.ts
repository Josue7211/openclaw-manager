// Module-level read overrides — persist until app reload
// Used by both Messages.tsx and useConversationList.ts

const readOverrides = new Map<string, boolean>()

export function getReadOverrides(): Map<string, boolean> {
  return readOverrides
}

export function setReadOverride(guid: string, unread: boolean) {
  readOverrides.set(guid, unread)
}

export function clearReadOverride(guid: string) {
  readOverrides.delete(guid)
}
