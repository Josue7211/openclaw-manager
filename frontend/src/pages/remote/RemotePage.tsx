import { VncViewer } from './VncViewer'

export default function RemotePage() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      margin: '-20px -28px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-base)',
    }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <VncViewer />
      </div>
    </div>
  )
}
