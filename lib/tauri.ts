// Tauri bridge utilities — safe to import in browser (no-ops when not in Tauri)

let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

async function getTauriInvoke() {
  if (invoke) return invoke
  try {
    const mod = await import('@tauri-apps/api/core')
    invoke = mod.invoke
    return invoke
  } catch {
    return null
  }
}

export async function sendNotification(title: string, body: string) {
  const inv = await getTauriInvoke()
  if (!inv) {
    // Fallback: browser Notification API
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
    return
  }
  try {
    const { sendNotification: tauriNotify } = await import('@tauri-apps/plugin-notification')
    await tauriNotify({ title, body })
  } catch (e) {
    console.warn('Tauri notification failed:', e)
  }
}

export async function isRunningInTauri(): Promise<boolean> {
  return (await getTauriInvoke()) !== null
}
