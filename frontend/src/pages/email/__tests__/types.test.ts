import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatDate, FOLDERS, EMPTY_FORM } from '../types'
import type { Email, EmailAccount, AccountForm, Folder } from '../types'

/* ─── Type structural validation ─────────────────────────────────────── */

describe('type exports', () => {
  it('Email type is structurally valid', () => {
    const email: Email = {
      id: 'em-1',
      from: 'alice@example.com',
      subject: 'Hello',
      date: '2026-03-15T09:00:00Z',
      preview: 'Hey, just checking in...',
      read: false,
      folder: 'INBOX',
    }
    expect(email.id).toBeTruthy()
    expect(email.read).toBe(false)
  })

  it('EmailAccount type is structurally valid', () => {
    const account: EmailAccount = {
      id: 'acc-1',
      label: 'Work',
      host: 'imap.example.com',
      port: 993,
      username: 'user@example.com',
      tls: true,
      is_default: true,
      created_at: '2026-03-15T12:00:00Z',
    }
    expect(account.port).toBe(993)
    expect(account.tls).toBe(true)
  })

  it('AccountForm type is structurally valid', () => {
    const form: AccountForm = {
      label: 'Personal',
      host: 'imap.gmail.com',
      port: '993',
      username: 'user@gmail.com',
      password: 'secret',
      tls: true,
      is_default: false,
    }
    // port is a string in the form (input field value)
    expect(typeof form.port).toBe('string')
    expect(form.is_default).toBe(false)
  })

  it('Folder type covers both values', () => {
    const folders: Folder[] = ['INBOX', 'Sent']
    expect(folders).toHaveLength(2)
  })
})

/* ─── FOLDERS ────────────────────────────────────────────────────────── */

describe('FOLDERS', () => {
  it('has exactly 2 entries', () => {
    expect(FOLDERS).toHaveLength(2)
  })

  it('contains INBOX and Sent', () => {
    const ids = FOLDERS.map(f => f.id)
    expect(ids).toContain('INBOX')
    expect(ids).toContain('Sent')
  })

  it('each entry has id and label', () => {
    for (const folder of FOLDERS) {
      expect(typeof folder.id).toBe('string')
      expect(typeof folder.label).toBe('string')
    }
  })

  it('INBOX has label "Inbox"', () => {
    const inbox = FOLDERS.find(f => f.id === 'INBOX')
    expect(inbox?.label).toBe('Inbox')
  })

  it('Sent has label "Sent"', () => {
    const sent = FOLDERS.find(f => f.id === 'Sent')
    expect(sent?.label).toBe('Sent')
  })
})

/* ─── EMPTY_FORM ─────────────────────────────────────────────────────── */

describe('EMPTY_FORM', () => {
  it('has empty label', () => {
    expect(EMPTY_FORM.label).toBe('')
  })

  it('has empty host', () => {
    expect(EMPTY_FORM.host).toBe('')
  })

  it('defaults port to 993', () => {
    expect(EMPTY_FORM.port).toBe('993')
  })

  it('has empty username and password', () => {
    expect(EMPTY_FORM.username).toBe('')
    expect(EMPTY_FORM.password).toBe('')
  })

  it('defaults tls to true', () => {
    expect(EMPTY_FORM.tls).toBe(true)
  })

  it('defaults is_default to false', () => {
    expect(EMPTY_FORM.is_default).toBe(false)
  })
})

/* ─── formatDate ─────────────────────────────────────────────────────── */

describe('formatDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('')
    expect(formatDate('')).toBe('')
  })

  it('returns a time string for today', () => {
    const now = new Date()
    // Set to 1 hour ago to ensure same day
    const earlier = new Date(now.getTime() - 3600000)
    const result = formatDate(earlier.toISOString())
    // Should be a time like "02:30 PM", not "Yesterday" or a weekday
    expect(result).not.toBe('')
    expect(result).not.toBe('Yesterday')
  })

  it('returns "Yesterday" for yesterday', () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-15T12:00:00')
    vi.setSystemTime(now)
    // Yesterday at noon
    const yesterday = new Date('2026-03-14T12:00:00')
    expect(formatDate(yesterday.toISOString())).toBe('Yesterday')
  })

  it('returns weekday abbreviation for 2-6 days ago', () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-15T12:00:00')
    vi.setSystemTime(now)
    // 3 days ago
    const threeDaysAgo = new Date('2026-03-12T12:00:00')
    const result = formatDate(threeDaysAgo.toISOString())
    expect(result).not.toBe('Yesterday')
    expect(result).not.toBe('')
    // Should be a short weekday like "Thu"
    expect(result.length).toBeLessThanOrEqual(4)
  })

  it('returns month and day for 7+ days ago', () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-15T12:00:00')
    vi.setSystemTime(now)
    // 10 days ago
    const tenDaysAgo = new Date('2026-03-05T12:00:00')
    const result = formatDate(tenDaysAgo.toISOString())
    expect(result).not.toBe('')
    // Should contain month abbreviation and day number like "Mar 5"
    expect(result).toContain('Mar')
    expect(result).toContain('5')
  })
})
