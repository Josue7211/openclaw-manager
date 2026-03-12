import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { supabaseAdmin } from '@/lib/supabase'

interface AccountCredentials {
  host: string
  port: number
  username: string
  password: string
  tls: boolean
}

async function getCredentials(accountId?: string | null): Promise<AccountCredentials | null> {
  // Try to fetch from Supabase
  if (supabaseAdmin) {
    let query = supabaseAdmin.from('email_accounts').select('host, port, username, password, tls')
    if (accountId) {
      query = query.eq('id', accountId)
    } else {
      query = query.eq('is_default', true)
    }
    const { data } = await query.limit(1).maybeSingle()
    if (data) {
      return { host: data.host, port: data.port, username: data.username, password: data.password, tls: data.tls }
    }

    // If no default found and no accountId, try any account
    if (!accountId) {
      const { data: any } = await supabaseAdmin
        .from('email_accounts')
        .select('host, port, username, password, tls')
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (any) {
        return { host: any.host, port: any.port, username: any.username, password: any.password, tls: any.tls }
      }
    }
  }

  // Fall back to env vars
  const host = process.env.EMAIL_HOST || ''
  const port = parseInt(process.env.EMAIL_PORT || '993', 10)
  const username = process.env.EMAIL_USER || ''
  const password = process.env.EMAIL_PASSWORD || ''
  const tls = process.env.EMAIL_TLS !== 'false'

  if (!host || !username || !password) return null
  return { host, port, username, password, tls }
}

function makeClient(creds: AccountCredentials) {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.tls,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
  })
}

async function fetchEmails(creds: AccountCredentials, folder: string, limit: number = 20) {
  const client = makeClient(creds)
  await client.connect()

  const emails: {
    id: string
    from: string
    subject: string
    date: string
    preview: string
    read: boolean
    folder: string
  }[] = []

  try {
    const mailbox = await client.mailboxOpen(folder, { readOnly: true })
    const total = mailbox.exists

    if (total === 0) return emails

    const start = Math.max(1, total - limit + 1)
    const range = `${start}:${total}`

    for await (const msg of client.fetch(range, {
      envelope: true,
      bodyStructure: true,
      flags: true,
      bodyParts: ['TEXT'],
    })) {
      const env = msg.envelope
      const from = env?.from?.[0]
        ? (env.from[0].name || env.from[0].address || '')
        : 'Unknown'
      const subject = env?.subject || '(no subject)'
      const date = env?.date?.toISOString() || new Date().toISOString()
      const read = msg.flags?.has('\\Seen') ?? false

      let preview = ''
      const textPart = msg.bodyParts?.get('TEXT')
      if (textPart) {
        const raw = Buffer.isBuffer(textPart) ? textPart.toString('utf8') : String(textPart)
        preview = raw
          .replace(/=\r?\n/g, '')
          .replace(/\r?\n/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/<[^>]+>/g, '')
          .trim()
          .slice(0, 200)
      }

      emails.push({ id: `${folder}:${msg.uid}`, from, subject, date, preview, read, folder })
    }

    emails.reverse()
  } finally {
    await client.logout()
  }

  return emails
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawFolder = searchParams.get('folder') || 'INBOX'
  // Only allow safe folder names (alphanumeric, dots, slashes, hyphens, spaces)
  const folder = /^[a-zA-Z0-9./ \-_]+$/.test(rawFolder) ? rawFolder : 'INBOX'
  const accountId = searchParams.get('account_id')

  const creds = await getCredentials(accountId)
  if (!creds) {
    return NextResponse.json({ error: 'missing_credentials', emails: [] }, { status: 200 })
  }

  try {
    const emails = await fetchEmails(creds, folder)
    return NextResponse.json({ emails })
  } catch (err) {
    console.error('[email] GET error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, read, account_id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const creds = await getCredentials(account_id)
  if (!creds) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 401 })
  }

  const colonIdx = id.indexOf(':')
  if (colonIdx === -1) return NextResponse.json({ error: 'Invalid id format' }, { status: 400 })

  const folder = id.slice(0, colonIdx)
  const uid = parseInt(id.slice(colonIdx + 1), 10)

  const client = makeClient(creds)
  await client.connect()

  try {
    await client.mailboxOpen(folder)
    if (read) {
      await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true })
    } else {
      await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[email] PATCH error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 })
  } finally {
    await client.logout()
  }
}
