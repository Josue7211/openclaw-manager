import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { api } from '@/lib/api'

interface SessionControlsProps {
  sessionId: string
  available: boolean
}

export function SessionControls({ sessionId, available }: SessionControlsProps) {
  const [message, setMessage] = useState('')

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<{ ok: boolean }>(`/api/gateway/sessions/${sessionId}/send`, { message: text }),
    onSuccess: () => setMessage(''),
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
