import { useState, useRef, useEffect, useCallback } from 'react'
import { Mail, ChevronDown, Star } from 'lucide-react'
import type { EmailAccount } from './types'

interface AccountSwitcherProps {
  accounts: EmailAccount[]
  selectedAccountId: string | null
  onSelectAccount: (id: string) => void
}

export function AccountSwitcher({ accounts, selectedAccountId, onSelectAccount }: AccountSwitcherProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = useCallback((id: string) => {
    onSelectAccount(id)
    setOpen(false)
  }, [onSelectAccount])

  if (accounts.length === 0) return null

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
          color: 'var(--text-primary)', padding: '6px 12px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500,
        }}
      >
        <Mail size={12} style={{ color: 'var(--accent)' }} />
        {selectedAccount?.label ?? 'Select account'}
        <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
          minWidth: '180px', zIndex: 50, boxShadow: '0 4px 16px var(--overlay-light)',
          overflow: 'hidden',
        }}>
          {accounts.map(acc => (
            <button
              key={acc.id}
              onClick={() => handleSelect(acc.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '9px 12px', border: 'none',
                cursor: 'pointer', textAlign: 'left',
                background: acc.id === selectedAccountId ? 'var(--purple-a10)' : 'none',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{acc.label}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{acc.username}</div>
              </div>
              {acc.is_default && <Star size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
