import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useSyncExternalStore } from 'react'
import { getSidebarConfig, subscribeSidebarConfig } from '@/lib/sidebar-config'

export default function CustomPage() {
  const { id } = useParams<{ id: string }>()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  const mod = config.customModules?.find(m => m.id === id)
  const name = mod?.name || 'Custom Page'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header at top */}
      <div style={{ flexShrink: 0 }}>
        <PageHeader defaultTitle={name} defaultSubtitle="custom module" />
      </div>

      {/* Centered empty state */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '400px' }}>
          <div
            role="img"
            aria-label="Mission Control"
            style={{
              width: '64px',
              height: '64px',
              marginBottom: '20px',
              WebkitMaskImage: 'url(/logo-128.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/logo-128.png)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
              background: 'var(--logo-color)',
              opacity: 0.7,
            } as React.CSSProperties}
          />
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}>
            This page is empty. Talk to your agent to create it.
          </p>
        </div>
      </div>
    </div>
  )
}
