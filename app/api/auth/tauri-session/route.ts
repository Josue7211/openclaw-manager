import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export const dynamic = 'force-dynamic'

const CODE_FILE = join(tmpdir(), 'mc-tauri-auth-code')

export function setPendingCode(code: string) {
  console.log('[tauri-session] storing code to', CODE_FILE)
  writeFileSync(CODE_FILE, code, 'utf-8')
}

// GET: Tauri WebView polls this to pick up the OAuth code after auth in system browser
export async function GET() {
  const headers = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  }

  try {
    const code = readFileSync(CODE_FILE, 'utf-8')
    unlinkSync(CODE_FILE) // One-time use
    console.log('[tauri-session] delivering code to webview')
    return NextResponse.json({ code }, { headers })
  } catch {
    return NextResponse.json({ code: null }, { headers })
  }
}
