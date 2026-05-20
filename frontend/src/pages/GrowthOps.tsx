import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import type { GrowthOpsState } from './growth-ops-types'
import {
  clearPendingGrowthOpsUpload,
  defaultGrowthOpsState,
  hasPendingGrowthOpsUpload,
  hasStoredGrowthOpsState,
  loadGrowthOpsState,
  markGrowthOpsPendingUpload,
  saveGrowthOpsState,
} from '@/features/growth-ops/domain'
import { growthOpsApi, growthStateHasRecords } from './growth-ops-api'
import { GrowthOpsWorkspace } from './growth-ops/GrowthOpsWorkspace'

type SyncMode = 'loading' | 'synced' | 'migrated' | 'offline'

export default function GrowthOpsPage() {
  const [state, setState] = useState<GrowthOpsState>(() => loadGrowthOpsState())
  const [syncMode, setSyncMode] = useState<SyncMode>('loading')
  const hydrated = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || hydrated.current) return
    hydrated.current = true
    let cancelled = false
    const localState = loadGrowthOpsState()

    growthOpsApi
      .getState()
      .then(async remote => {
        if (cancelled || !remote) return
        if (remote.hasRecords) {
          saveGrowthOpsState(remote.state)
          clearPendingGrowthOpsUpload()
          setState(remote.state)
          setSyncMode('synced')
          return
        }
        if ((hasPendingGrowthOpsUpload() || hasStoredGrowthOpsState()) && growthStateHasRecords(localState)) {
          const uploaded = await growthOpsApi.putState(localState)
          if (cancelled) return
          const next = uploaded ?? localState
          saveGrowthOpsState(next)
          clearPendingGrowthOpsUpload()
          setState(next)
          setSyncMode('migrated')
          return
        }
        const next = remote.state ?? defaultGrowthOpsState()
        saveGrowthOpsState(next)
        setState(next)
        setSyncMode('synced')
      })
      .catch(() => {
        if (cancelled) return
        markGrowthOpsPendingUpload(localState)
        setState(localState)
        setSyncMode('offline')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const commit = async (next: GrowthOpsState) => {
    setState(next)
    try {
      const uploaded = await growthOpsApi.putState(next)
      const normalized = uploaded ?? next
      saveGrowthOpsState(normalized)
      clearPendingGrowthOpsUpload()
      setState(normalized)
      setSyncMode('synced')
    } catch {
      markGrowthOpsPendingUpload(next)
      setSyncMode('offline')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '18px' }}>
      <PageHeader
        defaultTitle="Growth Ops"
        defaultSubtitle="Approval-gated social content queue for TikTok, Reels, and Shorts"
      />
      <GrowthOpsWorkspace state={state} onCommit={commit} syncMode={syncMode} />
    </div>
  )
}
