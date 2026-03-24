import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PaperPlaneTilt, Pause, Play } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { SessionStatus } from './types'

interface SessionControlsProps {
  sessionId: string
  sessionStatus: SessionStatus
  available: boolean
}

export function SessionControls({ sessionId, sessionStatus, available }: SessionControlsProps) {
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()

  const invalidateSessions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.claudeSessions })
    queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
  }, [queryClient])

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<{ ok: boolean }>(`/api/gateway/sessions/${sessionId}/send`, { message: text }),
    onSuccess: () => setMessage(''),
  })

  const pauseMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>(`/api/gateway/sessions/${sessionId}/pause`),
    onSuccess: invalidateSessions,
  })

  const resumeMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>(`/api/gateway/sessions/${sessionId}/resume`),
    onSuccess: invalidateSessions,
  })

  const handleSend = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return
    sendMutation.mutate(trimmed)
  }, [message, sendMutation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const isPaused = sessionStatus === 'paused'
  const togglePending = pauseMutation.isPending || resumeMutation.isPending
  const sendDisabled = !message.trim() || sendMutation.isPending || !available

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-card)',
      flexShrink: 0,
    }}>
      {/* Pause/Resume toggle */}
      <button
        type="button"
        onClick={() => isPaused ? resumeMutation.mutate() : pauseMutation.mutate()}
        disabled={!available || togglePending}
        aria-label={isPaused ? 'Resume session' : 'Pause session'}
        title={isPaused ? 'Resume session' : 'Pause session'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'transparent',
          color: isPaused ? 'var(--green-400)' : 'var(--amber)',
          cursor: available && !togglePending ? 'pointer' : 'not-allowed',
          opacity: available && !togglePending ? 1 : 0.4,
          transition: 'background 0.15s, color 0.15s',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
        className={available && !togglePending ? 'hover-bg' : undefined}
      >
        {isPaused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
      </button>

      {/* Message input */}
      <input
        type="text"
        aria-label="Send message to session"
        placeholder="Send a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!available || sendMutation.isPending}
        style={{
          flex: 1,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />

      {/* Send button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={sendDisabled}
        aria-label="Send message"
        title="Send message"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          border: '1px solid var(--accent)',
          background: sendDisabled ? 'var(--hover-bg)' : 'var(--accent)',
          color: sendDisabled ? 'var(--text-muted)' : 'var(--text-on-accent)',
          cursor: sendDisabled ? 'not-allowed' : 'pointer',
          opacity: sendDisabled ? 0.6 : 1,
          transition: 'background 0.15s, opacity 0.15s',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        <PaperPlaneTilt size={16} weight={message.trim() ? 'fill' : 'regular'} />
      </button>
    </div>
  )
}
