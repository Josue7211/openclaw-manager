import { lazy, Suspense, useRef, useEffect } from 'react'
import { Robot, User, Wrench, Info } from '@phosphor-icons/react'
import { useSessionHistory } from '@/hooks/sessions/useSessionHistory'
import type { SessionHistoryMessage } from './types'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

interface SessionHistoryPanelProps {
  sessionId: string | null
}

export function SessionHistoryPanel({ sessionId }: SessionHistoryPanelProps) {
  if (!sessionId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        Select a session to view history
      </div>
    )
  }

  return <SessionHistoryView sessionId={sessionId} />
}

function SessionHistoryView({ sessionId }: { sessionId: string }) {
  const { messages, isLoading, error } = useSessionHistory(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages load
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        Loading history...
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--red-500)',
          fontSize: '13px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        {error}
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        No history available
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  )
}

const ROLE_CONFIG: Record<SessionHistoryMessage['role'], {
  label: string
  align: 'flex-start' | 'flex-end'
  bg: string
  color: string
  icon: typeof Robot
}> = {
  user: {
    label: 'You',
    align: 'flex-end',
    bg: 'var(--accent)',
    color: 'var(--text-on-accent, #fff)',
    icon: User,
  },
  assistant: {
    label: 'Assistant',
    align: 'flex-start',
    bg: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    icon: Robot,
  },
  system: {
    label: 'System',
    align: 'flex-start',
    bg: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    icon: Info,
  },
  tool: {
    label: 'Tool',
    align: 'flex-start',
    bg: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    icon: Wrench,
  },
}

function MessageBubble({ message }: { message: SessionHistoryMessage }) {
  const config = ROLE_CONFIG[message.role]
  const Icon = config.icon
  const isUser = message.role === 'user'

  const timestamp = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: config.align,
      maxWidth: '85%',
      alignSelf: config.align,
    }}>
      {/* Role label + timestamp */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '4px',
        paddingLeft: isUser ? '0' : '4px',
        paddingRight: isUser ? '4px' : '0',
      }}>
        <Icon size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
        }}>
          {message.role === 'tool' && message.toolName
            ? `${config.label}: ${message.toolName}`
            : config.label}
        </span>
        {timestamp && (
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            opacity: 0.7,
          }}>
            {timestamp}
          </span>
        )}
      </div>

      {/* Message content */}
      <div style={{
        padding: '10px 14px',
        borderRadius: '12px',
        background: config.bg,
        color: config.color,
        border: isUser ? 'none' : '1px solid var(--border)',
        fontSize: '13px',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      }}>
        {message.role === 'assistant' ? (
          <Suspense fallback={<span>{message.content}</span>}>
            <MarkdownBubble>{message.content}</MarkdownBubble>
          </Suspense>
        ) : (
          message.content
        )}
      </div>
    </div>
  )
}
