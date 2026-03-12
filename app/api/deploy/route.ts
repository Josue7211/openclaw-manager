import { NextResponse } from 'next/server'
import { execSync, spawn } from 'child_process'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNotify, PROJECT_DIR, REVIEW_STATUS, AGENT_STATUS } from '@/lib/pipeline'

export async function POST(req: Request) {
  // ── Deploy token gate: require explicit confirmation to prevent accidental deploys ──
  const DEPLOY_TOKEN = process.env.MC_DEPLOY_TOKEN || ''
  if (DEPLOY_TOKEN) {
    const provided = req.headers.get('x-deploy-token') || new URL(req.url).searchParams.get('deploy_token')
    if (provided !== DEPLOY_TOKEN) {
      return NextResponse.json({
        ok: false,
        error: 'Deploy requires X-Deploy-Token header or deploy_token query param',
      }, { status: 403 })
    }
  }

  // ── Review gate: block deploy if any code missions are awaiting review ──
  const { data: pendingReviews } = await supabaseAdmin
    .from('missions')
    .select('id, title, review_status')
    .eq('review_status', REVIEW_STATUS.PENDING)

  if (pendingReviews && pendingReviews.length > 0) {
    // Allow override with ?force=true for emergencies
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === 'true'

    if (!force) {
      const titles = pendingReviews.map((m: { id: string; title: string }) => `"${m.title}"`).join(', ')
      sendNotify(
        'Deploy Blocked',
        `${pendingReviews.length} mission(s) awaiting Codex review: ${titles}`,
        4,
        ['warning'],
      ).catch(() => {})

      return NextResponse.json({
        ok: false,
        error: 'Deploy blocked: missions awaiting Codex review',
        pending_reviews: pendingReviews.map((m: { id: string; title: string }) => ({ id: m.id, title: m.title })),
        hint: 'Run Codex review first, or POST /api/deploy?force=true to override',
      }, { status: 403 })
    }
  }

  let log = ''

  try {
    // Run next build
    log = execSync('npm run build', {
      cwd: PROJECT_DIR,
      timeout: 300_000,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const detail = (e.stderr || e.stdout || e.message || 'Build failed').slice(0, 200)
    sendNotify('Mission Control Deploy Failed', detail, 5, ['x']).catch(() => {})
    // Don't leak full build output to client
    return NextResponse.json({
      ok: false,
      error: 'Build failed. Check server logs for details.',
    }, { status: 500 })
  }

  // Kill port 3000 and restart next start (fire-and-forget)
  // Notify: deploy succeeded
  sendNotify('Mission Control Deployed', 'Build succeeded — restarting server.', 3, ['rocket']).catch(() => {})

  try {
    execSync("fuser -k 3000/tcp 2>/dev/null || true", { cwd: PROJECT_DIR })
  } catch { /* ignore */ }

  // Restart server detached so this request can finish
  const child = spawn('npm', ['run', 'start'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  child.unref()

  // Set all awaiting_deploy agents to idle
  await supabaseAdmin
    .from('agents')
    .update({ status: AGENT_STATUS.IDLE, updated_at: new Date().toISOString() })
    .eq('status', AGENT_STATUS.AWAITING_DEPLOY)

  return NextResponse.json({ ok: true })
}
