import { useParams } from 'react-router-dom'
import { Sparkle } from '@phosphor-icons/react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSidebarConfig, subscribeSidebarConfig } from '@/lib/sidebar-config'
import { getWidget } from '@/lib/widget-registry'
import type { WidgetProps } from '@/lib/widget-registry'

type GeneratedPageComponent = React.ComponentType<WidgetProps>

export default function CustomPage() {
  const { id } = useParams<{ id: string }>()
  const config = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  const mod = config.customModules?.find(m => m.id === id)
  const name = mod?.name || 'Custom Page'
  const [GeneratedPage, setGeneratedPage] = useState<GeneratedPageComponent | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    setGeneratedPage(null)
    setLoadError('')

    if (!mod?.generatedModuleId) return
    const widget = getWidget(`generated-${mod.generatedModuleId}`)
    if (!widget) {
      setLoadError('Generated page module is not registered.')
      return
    }

    widget.component()
      .then(loaded => {
        if (!cancelled) setGeneratedPage(() => loaded.default)
      })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load generated page.')
      })

    return () => {
      cancelled = true
    }
  }, [mod?.generatedModuleId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Page header at top */}
      <div style={{ flexShrink: 0 }}>
        <PageHeader defaultTitle={name} defaultSubtitle={mod?.generatedModuleId ? 'generated page' : 'custom module'} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 12 }}>
        {GeneratedPage ? (
          <GeneratedPage
            widgetId={`custom-${id}`}
            config={{}}
            isEditMode={false}
            size={{ w: 6, h: 6 }}
          />
        ) : (
          <div style={{
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <EmptyState
              icon={Sparkle}
              title={loadError || 'This page is empty'}
              description={loadError ? 'Regenerate or reinstall this page from Chat.' : 'Talk to your agent to create it.'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
