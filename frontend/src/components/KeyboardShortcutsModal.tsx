


import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { getKeybindings, subscribeKeybindings, formatKey } from '@/lib/keybindings'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'

export default function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)

  useEffect(() => { setMounted(true) }, [])

  useEscapeKey(onClose, open)
  const trapRef = useFocusTrap(open)

  if (!open || !mounted) return null

  const general = bindings.filter(b => b.action)
  const navigation = bindings.filter(b => b.route)

  const groups = [
    { title: 'General', items: general },
    { title: 'Navigation', items: navigation },
  ]

  return createPortal(
    <>
      <style>{`
        @keyframes ks-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ks-scalein { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      `}</style>

      <div role="presentation" onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'var(--overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        zIndex: 'var(--z-modal-backdrop)' as React.CSSProperties['zIndex'], animation: 'ks-fadein 0.15s ease',
      }} />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ks-title"
        style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '480px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 120px)',
        background: 'var(--bg-modal)', backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid var(--hover-bg-bright)', borderRadius: '16px',
        boxShadow: '0 24px 80px var(--overlay-heavy), 0 0 0 1px var(--bg-white-04)',
        zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'], display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'ks-scalein 0.2s var(--ease-spring)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--active-bg)', flexShrink: 0,
        }}>
          <h2 id="ks-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Keyboard Shortcuts
          </h2>
          <button onClick={onClose} aria-label="Close" className="hover-bg-bright" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '8px', border: 'none',
            background: 'var(--active-bg)', color: 'var(--text-secondary)', cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 20px 20px', flex: 1 }}>
          {groups.map(group => (
            <div key={group.title} style={{ marginTop: '16px' }}>
              <div style={{
                fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px',
              }}>
                {group.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.items.map(b => (
                  <div key={b.id} className="hover-bg" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 12px', borderRadius: '8px',
                    transition: 'background 0.15s ease',
                  }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{b.label}</span>
                    <span style={{ display: 'flex', gap: '4px' }}>
                      {formatKey(b).map((k, i) => (
                        <kbd key={i} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: '24px', height: '24px', padding: '0 6px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace",
                          color: 'var(--text-primary)', background: 'var(--hover-bg-bright)',
                          border: '1px solid var(--border-hover)', boxShadow: '0 1px 2px var(--overlay-light)',
                          lineHeight: 1,
                        }}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Keybindings can be customized in Settings → Keybindings
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
