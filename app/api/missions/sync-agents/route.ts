import { NextResponse } from "next/server"
import { execSync } from "child_process"
import { supabaseAdmin } from "@/lib/supabase"

export async function POST() {
  try {
    // Detect running coding agent processes
    const ps = execSync("ps aux", { encoding: "utf-8" })
    const activeProcesses = ps.split("\n").filter(
      l => l.includes("claude") && l.includes("--dangerously-skip-permissions") && !l.includes("grep")
    )

    // Get all active/pending bjorn missions
    const { data: activeMissions } = await supabaseAdmin
      .from("missions")
      .select("*")
      .eq("assignee", "bjorn")
      .in("status", ["active", "pending"])

    // If no processes running, close all active missions
    if (activeProcesses.length === 0 && activeMissions?.length) {
      const ids = activeMissions.map((m: any) => m.id)
      await supabaseAdmin
        .from("missions")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .in("id", ids)
    }

    // Clean up stale "Coding Agent Task" missions
    await supabaseAdmin
      .from("missions")
      .delete()
      .eq("title", "Coding Agent Task")
      .eq("assignee", "bjorn")

    // Delete done missions older than 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabaseAdmin
      .from("missions")
      .delete()
      .eq("assignee", "bjorn")
      .eq("status", "done")
      .lt("updated_at", oneDayAgo)

    return NextResponse.json({ ok: true, processes: activeProcesses.length })
  } catch (e) {
    console.error('[sync-agents]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: 'Internal error' })
  }
}
