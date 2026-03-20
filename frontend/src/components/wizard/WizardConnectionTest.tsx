/**
 * WizardConnectionTest -- Reusable connection test button with inline result display.
 *
 * STUB: Created by plan 03-04 because sibling plan 03-03 may not have completed yet.
 * Plan 03-03 will deliver the final version of this component. If that plan has already
 * run and this file was overwritten, the final version takes precedence.
 */

import React, { useState, useCallback } from 'react'
import { SpinnerGap, CheckCircle, XCircle } from '@phosphor-icons/react'
import { api } from '@/lib/api'
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

  const runTest = useCallback(async () => {
    if (!url.trim()) return
    setStatus('testing')
    setErrorMsg(undefined)
    setLatencyMs(undefined)
    try {
      const result = await api.post<{ status: string; latency_ms?: number; error?: string }>(
        '/api/wizard/test-connection',
        { service, url, ...credentials },
      )
      if (result.status === 'ok') {
        setStatus('success')
        setLatencyMs(result.latency_ms)
        onSuccess?.(result.latency_ms ?? 0)
      } else {
        setStatus('error')
        setErrorMsg(result.error || 'Connection failed')
        onError?.(result.error || 'Connection failed')
      }
    } catch (e) {
      setStatus('error')
      const msg = e instanceof Error ? e.message : 'Connection failed'
      setErrorMsg(msg)
      onError?.(msg)
    }
  }, [service, url, credentials, onSuccess, onError])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <Button
        variant="secondary"
        onClick={runTest}
        disabled={status === 'testing' || !url.trim()}
        aria-label={`Test connection to ${service}`}
        style={{ alignSelf: 'flex-start', fontSize: '13px', padding: '8px 16px' }}
      >
        {status === 'testing' && (
          <SpinnerGap
            size={14}
            style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }}
          />
        )}
        {status === 'testing' ? 'Testing...' : status === 'success' ? 'Connected' : 'Test Connection'}
      </Button>
      <div aria-live="polite" style={{ minHeight: '20px' }}>
        {status === 'testing' && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Checking connection...</span>
        )}
        {status === 'success' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--green)' }}>
            <CheckCircle size={14} weight="fill" />
            Connected{latencyMs != null ? ` (${latencyMs}ms)` : ''}
          </span>
        )}
        {status === 'error' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--red-500)' }}>
            <XCircle size={14} weight="fill" />
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  )
})
