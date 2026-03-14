import { Component, type ReactNode } from 'react'
import { reportError } from '@/lib/error-reporter'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PageError]', error, info.componentStack)
    reportError(error, 'PageErrorBoundary')

    // Best effort — verify server is reachable, don't crash if logging fails
    fetch('/api/health').catch(() => {})
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          padding: '40px 24px',
          textAlign: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '40px 36px',
            maxWidth: '460px',
            width: '100%',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '22px',
            }}>
              !
            </div>

            <h2 style={{
              margin: '0 0 8px',
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              This page crashed
            </h2>

            <p style={{
              margin: '0 0 24px',
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}>
              {this.state.error.message}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => this.setState({ error: null })}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <button
                onClick={() => { this.setState({ error: null }); window.location.reload() }}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
