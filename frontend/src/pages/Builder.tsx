import { PageHeader } from '@/components/PageHeader'
import ModuleBuilderTab from './chat/ModuleBuilderTab'

export default function BuilderPage() {
  return (
    <div
      data-testid="page-builder"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexShrink: 0,
          marginBottom: 8,
        }}
      >
        <PageHeader
          defaultTitle="Builder"
          defaultSubtitle="OpenUI generative widgets"
        />
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ModuleBuilderTab />
      </div>
    </div>
  )
}
