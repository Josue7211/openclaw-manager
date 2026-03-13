import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: '16px', padding: '24px', textAlign: 'center',
    }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Page not found</h2>
      <p style={{ color: 'var(--text-secondary, #888)' }}>
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        to="/"
        style={{
          padding: '8px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)', textDecoration: 'none', color: 'inherit',
        }}
      >
        Back to dashboard
      </Link>
    </div>
  )
}
