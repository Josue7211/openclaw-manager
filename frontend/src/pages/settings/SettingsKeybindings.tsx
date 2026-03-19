import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  getKeybindings, subscribeKeybindings, updateKeybinding, resetKeybindings,
  getModifierKey, getModifierList, addModifier, removeModifier, reorderModifiers,
  getBindingMod, keyToModifier, modLabel,
} from '@/lib/keybindings'
import { row, btnSecondary, sectionLabel } from './shared'

export default function SettingsKeybindings() {
  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const [editingBindingId, setEditingBindingId] = useState<string | null>(null)
  const keybindHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const [detectingMod, setDetectingMod] = useState(false)
  const modKey = useSyncExternalStore(subscribeKeybindings, getModifierKey)
  const modList = useSyncExternalStore(subscribeKeybindings, getModifierList)

  useEffect(() => {
    if (!detectingMod) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const mod = keyToModifier(e.key)
      if (mod) {
        addModifier(mod)
        setDetectingMod(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detectingMod])

  // Clean up stale keydown listener when editingBindingId is cleared (e.g. Cancel click)
  useEffect(() => {
    if (editingBindingId === null && keybindHandlerRef.current) {
      window.removeEventListener('keydown', keybindHandlerRef.current)
      keybindHandlerRef.current = null
    }
  }, [editingBindingId])

  return (
    <div>
      <div style={sectionLabel}>Keybinds</div>
      <div style={row}>
        <span>Modifier keys</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {modList.map((m, i) => (
            <div
              key={m}
              onMouseDown={e => {
                if ((e.target as HTMLElement).tagName === 'BUTTON') return
                e.preventDefault()
                const el = e.currentTarget as HTMLElement
                const startX = e.clientX
                const container = el.parentElement!
                const siblings = Array.from(container.querySelectorAll<HTMLElement>('[data-mod-drag]'))
                const centers = siblings.map(s => {
                  const r = s.getBoundingClientRect()
                  return r.left + r.width / 2
                })

                el.style.zIndex = '10'
                el.style.transition = 'none'
                document.body.style.cursor = 'grabbing'

                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX
                  el.style.transform = `translateX(${dx}px) scale(1.05)`
                  el.style.opacity = '0.9'
                }
                const onUp = (ev: MouseEvent) => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                  document.body.style.cursor = ''
                  el.style.transform = ''
                  el.style.opacity = ''
                  el.style.zIndex = ''
                  el.style.transition = ''

                  // Find drop target based on final mouse position
                  const finalX = ev.clientX
                  let target = i
                  for (let j = 0; j < centers.length; j++) {
                    if (j < i && finalX < centers[j]) { target = j; break }
                    if (j > i && finalX > centers[j]) { target = j }
                  }
                  if (target !== i) {
                    const next = [...modList]
                    const [moved] = next.splice(i, 1)
                    next.splice(target, 0, moved)
                    reorderModifiers(next)
                  }
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
              data-mod-drag
              style={{
                display: 'flex', alignItems: 'center', gap: '2px', cursor: 'grab',
                position: 'relative', transition: 'transform 0.15s ease',
              }}
            >
              <kbd style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
                color: i === 0 ? 'var(--text-on-color)' : 'var(--text-primary)',
                background: i === 0 ? 'var(--purple-a15)' : 'var(--hover-bg-bright)',
                border: `1px solid ${i === 0 ? 'var(--border-accent)' : 'var(--border-hover)'}`,
                pointerEvents: 'none',
              }}>{modLabel(m)}</kbd>
              {modList.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); removeModifier(m) }}
                  aria-label={`Remove ${modLabel(m)}`}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '10px', padding: '2px',
                    lineHeight: 1, display: 'flex',
                  }}
                >&#10005;</button>
              )}
            </div>
          ))}
          {detectingMod ? (
            <input
              autoFocus
              readOnly
              aria-label="Press a modifier key"
              onKeyDown={e => {
                e.preventDefault()
                if (e.key === 'Escape') { setDetectingMod(false); return }
                const mod = keyToModifier(e.key)
                if (!modList.includes(mod)) {
                  addModifier(mod)
                }
                setDetectingMod(false)
              }}
              onBlur={() => setDetectingMod(false)}
              placeholder="Press key..."
              style={{
                width: '90px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                background: 'var(--accent-a10)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                textAlign: 'center',
                caretColor: 'transparent',
                animation: 'pulse-dot 1.5s infinite',
              }}
            />
          ) : (
            modList.length < 4 && (
              <button
                onClick={() => setDetectingMod(true)}
                style={{
                  width: '26px', height: '26px', borderRadius: '6px', fontSize: '14px',
                  background: 'var(--bg-white-04)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >+</button>
            )
          )}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Click a keybinding to change it.
      </div>
      {bindings.map(b => {
        const kbdStyle: React.CSSProperties = {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: '24px', height: '26px', padding: '0 8px', borderRadius: '6px',
          fontSize: '12px', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text-primary)', background: 'var(--hover-bg-bright)',
          border: '1px solid var(--border-hover)', boxShadow: '0 1px 2px var(--overlay-light)',
        }
        const isEditing = editingBindingId === b.id
        return (
          <div key={b.id} style={row}>
            <span>{b.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* Modifier selector — cycle through options on click */}
              {b.mod && (
                <button
                  onClick={() => {
                    const mods = getModifierList()
                    const current = getBindingMod(b)
                    const idx = mods.indexOf(current)
                    const next = mods[(idx + 1) % mods.length]
                    updateKeybinding(b.id, { modifier: next })
                  }}
                  title="Click to change modifier"
                  style={{ ...kbdStyle, cursor: 'pointer', background: 'var(--accent-a10)' }}
                >
                  {modLabel(getBindingMod(b))}
                </button>
              )}
              {/* Key — click to detect */}
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <kbd style={{
                    ...kbdStyle,
                    background: 'var(--purple-a15)', border: '1px solid var(--accent)',
                    color: 'var(--accent)', animation: 'pulse-dot 1.5s infinite',
                    padding: '0 12px',
                  }}>
                    Press key...
                  </kbd>
                  <button style={{ ...kbdStyle, cursor: 'pointer', fontSize: '10px', padding: '0 6px' }}
                    onClick={() => setEditingBindingId(null)}>&#10005;</button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingBindingId(b.id)
                    if (keybindHandlerRef.current) {
                      window.removeEventListener('keydown', keybindHandlerRef.current)
                    }
                    const handler = (e: KeyboardEvent) => {
                      e.preventDefault()
                      window.removeEventListener('keydown', handler)
                      keybindHandlerRef.current = null
                      if (e.key === 'Escape') { setEditingBindingId(null); return }
                      if (keyToModifier(e.key)) return // ignore modifier-only presses
                      const key = e.key.toLowerCase()
                      if (key.length === 1 || key === '/') {
                        updateKeybinding(b.id, { key })
                        setEditingBindingId(null)
                      }
                    }
                    keybindHandlerRef.current = handler
                    setTimeout(() => window.addEventListener('keydown', handler, { once: true }), 50)
                  }}
                  style={{ ...kbdStyle, cursor: 'pointer' }}
                >
                  {b.key.toUpperCase()}
                </button>
              )}
            </div>
          </div>
        )
      })}
      <div style={{ marginTop: '16px' }}>
        <button style={{ ...btnSecondary, color: 'var(--text-muted)' }} onClick={() => { resetKeybindings(); setEditingBindingId(null) }}>
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
