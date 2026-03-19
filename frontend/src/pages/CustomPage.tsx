import { useParams } from 'react-router-dom'
import { Sparkle } from '@phosphor-icons/react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
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
        <EmptyState icon={Sparkle} title="This page is empty" description="Talk to your agent to create it." />
      </div>
    </div>
  )
}
