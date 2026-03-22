import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import type { EmailMessage } from '@/lib/types'

const INBOX_KEY = ['emails', 'inbox'] as const

const DEMO_EMAILS: EmailMessage[] = [
  { id: 'demo-e1', from: 'GitHub Notifications', subject: 'PR #42 merged: Add widget system', date: new Date(Date.now() - 1_800_000).toISOString(), read: false },
  { id: 'demo-e2', from: 'Vercel', subject: 'Deployment successful — mission-control', date: new Date(Date.now() - 7_200_000).toISOString(), read: false },
  { id: 'demo-e3', from: 'Cloudflare', subject: 'Weekly security summary', date: new Date(Date.now() - 86_400_000).toISOString(), read: false },
]

export function useInboxWidget() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ emails?: EmailMessage[] }>({
    queryKey: INBOX_KEY,
    queryFn: () => api.get<{ emails?: EmailMessage[] }>('/api/email?folder=INBOX'),
    refetchInterval: 60_000,
    enabled: !_demo,
  })

  const allEmails = _demo ? DEMO_EMAILS : (data?.emails ?? [])

  const unreadCount = useMemo(
    () => allEmails.filter(e => !e.read).length,
    [allEmails],
  )

  const recentUnread = useMemo(() => {
    return allEmails
      .filter(e => !e.read)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
  }, [allEmails])

  return { emails: allEmails, unreadCount, recentUnread, mounted: _demo || isSuccess }
}
