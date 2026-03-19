import { Sun, Moon, Laptop } from '@phosphor-icons/react'
import { ACCENT_PRESETS } from '@/lib/themes'
import { row, sectionLabel } from './shared'

interface SettingsDisplayProps {
  theme: 'dark' | 'light' | 'system'
  setTheme: (t: 'dark' | 'light' | 'system') => void
  accentColor: string
  setAccent: (color: string) => void
  secondaryColor: string
  setSecondary: (color: string) => void
  glowColor: string
  setGlow: (color: string) => void
  logoColor: string
  setLogo: (color: string) => void
}

export default function SettingsDisplay({
  theme, setTheme, accentColor, setAccent,
  secondaryColor, setSecondary, glowColor, setGlow,
  logoColor, setLogo,
}: SettingsDisplayProps) {
  return (
    <div>
      <div style={sectionLabel}>Display</div>
      <div style={row}>
        <span>Theme</span>
        <div style={{ display: 'flex', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {([
            { value: 'dark' as const, icon: Moon, label: 'Dark' },
            { value: 'light' as const, icon: Sun, label: 'Light' },
            { value: 'system' as const, icon: Laptop, label: 'System' },
          ]).map(({ value, icon: Icon, label }) => {
            const active = theme === value
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                aria-label={label}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 14px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: active ? 600 : 400,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            )
          })}
        </div>
      </div>
      {[
        { label: 'Accent color', value: accentColor, onChange: setAccent },
        { label: 'Secondary color', value: secondaryColor, onChange: setSecondary },
        { label: 'Glow color', value: glowColor, onChange: setGlow },
        { label: 'Logo color', value: logoColor, onChange: setLogo },
      ].map(({ label, value, onChange }) => (
        <div key={label} style={row}>
          <span>{label}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {ACCENT_PRESETS.map(preset => {
              const active = value === preset.color
              return (
                <button
                  key={preset.id}
                  onClick={() => onChange(preset.color)}
                  aria-label={`${label} ${preset.label}`}
                  title={preset.label}
                  style={{
                    width: 24, height: 24,
                    borderRadius: '50%',
                    background: preset.color,
                    border: active ? '2px solid var(--text-primary)' : '2px solid transparent',
                    outline: active ? `2px solid ${preset.color}` : 'none',
                    outlineOffset: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    transform: active ? 'scale(1.15)' : 'scale(1)',
                    padding: 0,
                  }}
                />
              )
            })}
            <label
              title="Pick custom color"
              style={{
                width: 24, height: 24,
                borderRadius: '50%',
                background: `conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`,
                cursor: 'pointer',
                position: 'relative',
                border: ACCENT_PRESETS.every(p => p.color !== value) ? '2px solid var(--text-primary)' : '2px solid transparent',
                outline: ACCENT_PRESETS.every(p => p.color !== value) ? `2px solid ${value}` : 'none',
                outlineOffset: '2px',
                transition: 'all 0.15s ease',
                transform: ACCENT_PRESETS.every(p => p.color !== value) ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <input
                type="color"
                value={value}
                onChange={e => onChange(e.target.value)}
                aria-label={`${label} custom color picker`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  width: '100%',
                  height: '100%',
                  cursor: 'pointer',
                  border: 'none',
                  padding: 0,
                }}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}
