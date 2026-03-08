import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

const BASE = "http://localhost:3000"

async function fetchAndCache(key: string, path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" })
    if (!res.ok) return
    const value = await res.json()
    await supabaseAdmin.from("cache").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
  } catch {}
}

export async function POST() {
  await Promise.allSettled([
    fetchAndCache("proxmox", "/api/proxmox"),
    fetchAndCache("opnsense", "/api/opnsense"),
  ])
  return NextResponse.json({ ok: true })
}
