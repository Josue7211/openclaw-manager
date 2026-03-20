import React, { useState, useCallback } from 'react'
import { SpinnerGap, CheckCircle, XCircle } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { updateTestResult } from '@/lib/wizard-store'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'

interface WizardConnectionTestProps {
  service: string
  url: string
  credentials: Record<string, string>
  onSuccess?: (latencyMs: number) => void
  onError?: (error: string) => void
}

export const WizardConnectionTest = React.memo(function WizardConnectionTest({
  service,
  url,
  credentials,
  onSuccess,
  onError,
}: WizardConnectionTestProps) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [latencyMs, setLatencyMs] = useState<number | undefined>()
  const [errorMsg, setErrorMsg] = useState<string | undefined>()
  const toast = useToast()

  const runTest = useCallback(async () => {
    if (!url.trim()) return
    setStatus('testing')
    setErrorMsg(undefined)
    setLatencyMs(undefined)
    updateTestResult(service, { status: 'testing' })

    try {
      const result = await api.post<{ status: string; latency_ms?: number; error?: string }>(
        '/api/wizard/test-connection',
        { service, url, ...credentials },
      )
      if (result.status === 'ok') {
        const ms = result.latency_ms ?? 0
        setStatus('success')
        setLatencyMs(ms)
        updateTestResult(service, { status: 'success', latencyMs: ms })
        toast.show({ type: 'success', message: `Connected to ${service} (${ms}ms)` })
        onSuccess?.(ms)
      } else {
        const msg = result.error || 'Connection failed'
        setStatus('error')
        setErrorMsg(msg)
        updateTestResult(service, { status: 'error', error: msg })
        toast.show({ type: 'error', message: `${service}: ${msg}` })
        onError?.(msg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed'
      setStatus('error')
      setErrorMsg(msg)
      updateTestResult(service, { status: 'error', error: msg })
      toast.show({ type: 'error', message: `${service}: ${msg}` })
      onError?.(msg)
    }
  }, [service, url, credentials, onSuccess, onError, toast])

  // Button label and style based on state
  const buttonLabel = status === 'testing' ? 'Testing...' : status === 'success' ? 'Connected' : 'Test Connection'

  const successStyle: React.CSSProperties = status === 'success'
    ? {
        background: 'var(--green-a12)',
        borderColor: 'var(--green)',
        color: 'var(--green)',
      }
    : {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2, 8px)' }}>
      <Button
        variant="secondary"
        onClick={runTest}
        disabled={status === 'testing' || !url.trim()}
        aria-label={`Test connection to ${service}`}
        style={{
          alignSelf: 'flex-start',
          fontSize: '13px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ...successStyle,
        }}
      >
        {status === 'testing' && (
          <SpinnerGap
            size={14}
            style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
          />
        )}
        {buttonLabel}
      </Button>

      {/* Inline result text */}
      <div aria-live="polite" style={{ minHeight: 20 }}>
        {status === 'testing' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Checking connection...
          </span>
        )}
        {status === 'success' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--green)',
            }}
          >
            <CheckCircle size={14} weight="fill" />
            Connected{latencyMs != null ? ` (${latencyMs}ms)` : ''}
          </span>
        )}
        {status === 'error' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--red-500)',
            }}
          >
            <XCircle size={14} weight="fill" />
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  )
})
