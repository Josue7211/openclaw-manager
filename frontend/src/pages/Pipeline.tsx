import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PipelineIdeas } from './pipeline/PipelineIdeas'
import { PipelineNotes } from './pipeline/PipelineNotes'
import { PipelineRetros } from './pipeline/PipelineRetros'
import { PipelineStatus } from './pipeline/PipelineStatus'
import { PipelineShipLog } from './pipeline/PipelineShipLog'
import { PipelineStale } from './pipeline/PipelineStale'

type TabKey = 'ideas' | 'notes' | 'retros' | 'status' | 'shiplog' | 'stale'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'ideas', label: 'Ideas' },
  { key: 'notes', label: 'Workflow Notes' },
  { key: 'retros', label: 'Retrospectives' },
  { key: 'status', label: 'Pipeline Status' },
  { key: 'shiplog', label: 'Ship Log' },
  { key: 'stale', label: 'Stale Items' },
]

export default function PipelinePage() {
  const [tab, setTab] = useState<TabKey>('ideas')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px' }}>
        <PageHeader defaultTitle="Pipeline" defaultSubtitle="Ideas, lessons, retrospectives & scheduled runs" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: 'var(--bg-white-03)', borderRadius: '10px', padding: '3px' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 14px',
              background: tab === t.key ? 'var(--purple-a15)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: tab === t.key ? 'var(--accent-bright)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: tab === t.key ? 600 : 450,
              transition: 'all 0.15s var(--ease-spring)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ideas' && <PipelineIdeas />}
      {tab === 'notes' && <PipelineNotes />}
      {tab === 'retros' && <PipelineRetros />}
      {tab === 'status' && <PipelineStatus />}
      {tab === 'shiplog' && <PipelineShipLog />}
      {tab === 'stale' && <PipelineStale />}
    </div>
  )
}
