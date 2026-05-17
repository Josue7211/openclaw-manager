import { describe, expect, it, vi } from 'vitest'
import { buildLiveAppContext } from '../live-app-context'

describe('buildLiveAppContext', () => {
  it('summarizes live module data and current route before chat send', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T12:00:00Z'))

    const get = vi.fn(async (path: string) => {
      if (path === '/api/calendar') {
        return {
          source: 'local-macos-calendar',
          events: [
            {
              title: 'Dentist',
              start: '2026-05-17T14:00:00Z',
              end: '2026-05-17T15:00:00Z',
              calendar: 'Personal',
            },
          ],
        }
      }
      if (path === '/api/todos') return { todos: [{ text: 'Ship chat grounding', done: false }] }
      if (path === '/api/reminders') return { reminders: [] }
      if (path === '/api/missions') return { missions: [] }
      if (path.startsWith('/api/email')) return { emails: [] }
      if (path.startsWith('/api/messages')) return { conversations: [] }
      return {}
    })
    const post = vi.fn(async () => ({ ok: true }))

    const context = await buildLiveAppContext(get, {
      requestText: 'What is my next appointment?',
      route: '/calendar',
      pageTitle: 'Calendar',
      context: {
        project: 'clawcontrol',
        workingDir: '/Volumes/T7/projects/clawcontrol',
        branch: 'main',
        runtime: 'Work locally',
      },
      timeoutMs: 100,
      apiPost: post,
    })

    expect(context).toContain('captured_at: 2026-05-17T12:00:00.000Z')
    expect(context).toContain('route: /calendar')
    expect(context).toContain('calendar: loaded; source=local-macos-calendar')
    expect(context).toContain('Dentist | 2026-05-17T14:00:00.000Z')
    expect(context).toContain('todos: loaded; open=1')
    expect(context).toContain('Ship chat grounding')
    expect(get).toHaveBeenCalledWith('/api/calendar')
    expect(post).toHaveBeenCalledWith('/api/memd/live-state', {
      records: expect.arrayContaining([
        expect.objectContaining({
          sourceApp: 'clawcontrol',
          module: 'calendar',
          privacy: 'approved',
          approved: true,
          summary: expect.stringContaining('Dentist'),
        }),
        expect.objectContaining({
          module: 'messages',
          privacy: 'metadata',
          approved: false,
          payload: { summary: 'messages: loaded; conversations=0' },
        }),
      ]),
    })

    vi.useRealTimers()
  })
})
