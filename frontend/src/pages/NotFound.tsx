import { Link, useLocation } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

const quickLinks = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/todos', label: 'Todos' },
  { to: '/messages', label: 'Messages' },
  { to: '/settings', label: 'Settings' },
]

export default function NotFound() {
  const { pathname } = useLocation()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: '20px', padding: '40px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: '48px', fontWeight: 800, color: 'var(--accent)',
        fontFamily: "'JetBrains Mono', monospace", opacity: 0.6,
      }}>
        404
      </div>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
        Page not found
      </h2>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.6 }}>
        <code style={{
          background: 'var(--active-bg)', padding: '2px 6px', borderRadius: '4px',
          fontSize: '12px',
        }}>
          {pathname}
        </code>
        {' '}doesn&apos;t exist. Try one of these:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {quickLinks.map(l => (
          <Link
            key={l.to}
            to={l.to}
            style={{
              padding: '6px 14px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg-white-03)',
              textDecoration: 'none', color: 'var(--text-secondary)',
              fontSize: '12px', fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button
          onClick={() => window.history.back()}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={12} /> Go back
        </button>
        <Link
          to="/"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '10px',
            border: 'none', background: 'var(--accent)',
            color: 'var(--text-on-color)', fontSize: '12px', fontWeight: 600,
            textDecoration: 'none', cursor: 'pointer',
          }}
        >
          <Home size={12} /> Home
        </Link>
      </div>
    </div>
  )
}
