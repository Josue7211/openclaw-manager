import { memo } from 'react'

const Toggle = memo(function Toggle({ on, onToggle, label }: { on: boolean; onToggle: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent-solid)' : 'var(--bg-white-15)',
        position: 'relative', transition: 'background 0.25s var(--ease-spring)', padding: 0, flexShrink: 0,
        boxShadow: on ? '0 0 8px var(--accent-a15)' : 'none',
      }}
      onMouseDown={e => {
        const knob = e.currentTarget.querySelector('span') as HTMLElement
        if (knob) knob.style.transform = 'scale(0.9)'
      }}
      onMouseUp={e => {
        const knob = e.currentTarget.querySelector('span') as HTMLElement
        if (knob) knob.style.transform = 'scale(1)'
      }}
      onMouseLeave={e => {
        const knob = e.currentTarget.querySelector('span') as HTMLElement
        if (knob) knob.style.transform = 'scale(1)'
      }}
    >
      <span style={{
        position: 'absolute', top: '2px',
        left: on ? '22px' : '2px',
        width: '20px', height: '20px', borderRadius: '50%',
        background: 'var(--text-on-color)',
        boxShadow: '0 1px 3px var(--overlay-light)',
        transition: 'left 0.25s var(--ease-spring), transform 0.2s var(--ease-spring)',
      }} />
    </button>
  )
})

export default Toggle
