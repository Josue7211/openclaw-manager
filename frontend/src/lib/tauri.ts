// Tauri bridge utilities — safe to import in browser (no-ops when not in Tauri)

export async function openInBrowser(url: string): Promise<boolean> {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
    return true
  } catch {
    return false
  }
}
