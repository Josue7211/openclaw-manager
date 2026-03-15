import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import Toggle from './Toggle'
import { row, rowLast, sectionLabel } from './shared'

export default function SettingsPrivacy() {
  const [errorReporting, setErrorReporting] = useLocalStorageState('error-reporting', false)

  return (
    <div>
      <div style={sectionLabel}>Privacy</div>
      <div style={row}>
        <div>
          <span>Anonymous crash reports</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '340px', lineHeight: 1.5 }}>
            Send anonymized error reports to help improve Mission Control. No personal data, messages, or credentials are ever included.
          </div>
        </div>
        <Toggle on={errorReporting} onToggle={v => { setErrorReporting(v) }} label="Anonymous crash reports" />
      </div>
      <div style={rowLast}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, padding: '4px 0' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>What is collected:</strong> error message, stack trace (truncated), app version, platform, page route, timestamp.
          <br />
          <strong style={{ color: 'var(--text-secondary)' }}>Never collected:</strong> message content, contact names, API keys, URLs, or IP addresses.
        </div>
      </div>
    </div>
  )
}
