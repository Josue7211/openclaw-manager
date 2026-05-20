import { describe, expect, it } from 'vitest'
import type { GrowthOpsState, PostPackage } from '@/pages/growth-ops-types'
import {
  approvePostPackage,
  buildTodaysShootList,
  commitAnalyticsImport,
  createPostPackageFromIdea,
  defaultGrowthOpsState,
  generateDailyContentIdeas,
  normalizeGrowthConnector,
  previewAnalyticsImport,
  updateCalendarSlots,
  updateRecipeLearning,
} from '@/pages/growth-ops-domain'

function seededState(): GrowthOpsState {
  const base = defaultGrowthOpsState()
  const ideas = generateDailyContentIdeas(base, new Date('2026-05-16T12:00:00.000Z'))
  const postPackage = createPostPackageFromIdea(ideas[0], '2026-05-16T12:00:00.000Z')
  return {
    ...base,
    contentIdeas: ideas,
    postPackages: [{ ...postPackage, videoFile: '/tmp/lift.mp4' }],
  }
}

describe('growth ops domain v5', () => {
  it('previews and commits attributed analytics imports', () => {
    const state = seededState()
    const postPackage = state.postPackages[0]
    const preview = previewAnalyticsImport(
      state,
      `platform,package,horizon,views,likes,comments,shares,saves,confidence
tiktok,${postPackage.id},24h,12000,1800,90,350,700,high`,
    )

    expect(preview).toHaveLength(1)
    expect(preview[0].attributed).toBe(true)
    expect(preview[0].postPackageId).toBe(postPackage.id)

    const committed = commitAnalyticsImport(state, preview)
    expect(committed.metricSnapshots).toHaveLength(1)
    expect(committed.metricSnapshots[0].recipeId).toBe(state.contentIdeas[0].recipeId)
    expect(committed.contentRecipes.some(recipe => recipe.recommendationEvidence.length > 0)).toBe(true)
  })

  it('quarantines unattributed analytics rows instead of creating snapshots', () => {
    const state = seededState()
    const preview = previewAnalyticsImport(state, [{ platform: 'youtube', horizon: '24h', views: '100' }])
    const committed = commitAnalyticsImport(state, preview)

    expect(preview[0].attributed).toBe(false)
    expect(committed.metricSnapshots).toHaveLength(0)
    expect(committed.quarantinedAnalyticsRows).toHaveLength(1)
    expect(committed.quarantinedAnalyticsRows[0].quarantineReason).toMatch(/missing/i)
  })

  it('persists editable calendar slots and derives needs-video shoot work', () => {
    const state = seededState()
    const idea = state.contentIdeas[1]
    const next = updateCalendarSlots(state, [
      {
        id: 'slot-edit',
        date: '2026-05-16',
        platform: 'instagram',
        state: 'needs-video',
        ideaId: idea.id,
        postPackageId: state.postPackages[0].id,
        title: idea.title,
        batchRecording: true,
        order: 2,
      },
    ])

    expect(next.contentIdeas.find(item => item.id === idea.id)?.plannedSlots[0].batchRecording).toBe(true)
    expect(next.postPackages[0].platformVariants.instagram.scheduledAt).toContain('2026-05-16')
    expect(buildTodaysShootList(next, new Date('2026-05-16T10:00:00.000Z')).some(slot => slot.state === 'needs-video')).toBe(true)
  })

  it('keeps approval internal with an audit trail and no publish affordance field', () => {
    const postPackage: PostPackage = {
      ...seededState().postPackages[0],
      videoFile: '/tmp/lift.mp4',
    }
    const approved = approvePostPackage(postPackage)

    expect(approved.approvalState).toBe('queued')
    expect(approved.approvalAudit.map(event => event.event)).toEqual(['approved', 'queued'])
    expect(Object.keys(approved).some(key => key.toLowerCase().includes('publish'))).toBe(false)
  })

  it('backs recommendations with evidence rows and detects weak repeated topics', () => {
    const state = seededState()
    const recipeId = state.contentIdeas[0].recipeId
    const learned = updateRecipeLearning({
      ...state,
      contentIdeas: state.contentIdeas.map(idea => ({ ...idea, title: `${state.contentRecipes[0].topics[0]} repeat` })),
      metricSnapshots: [
        {
          id: 'metric-proof',
          postPackageId: state.postPackages[0].id,
          ideaId: state.contentIdeas[0].id,
          recipeId,
          platform: 'tiktok',
          measuredAt: '2026-05-16T12:00:00.000Z',
          horizon: '24h',
          metrics: { views: 9000, likes: 1300, comments: 90, shares: 400, saves: 600, watchRetention: 80, followerDelta: 40, leadSignal: 2 },
          source: 'owned-analytics',
          confidence: 'high',
          evidenceSummary: 'High-confidence TikTok import beat the recipe baseline.',
        },
      ],
    })
    const recipe = learned.contentRecipes.find(item => item.id === recipeId)

    expect(recipe?.recommendation).toBe('double-down')
    expect(recipe?.recommendationEvidence[0].summary).toMatch(/TikTok|import/i)
  })

  it('normalizes connector diagnostics without token leakage', () => {
    const connector = normalizeGrowthConnector({
      id: 'u:tiktok',
      platform: 'tiktok',
      status: 'not_configured',
      service: 'social.tiktok',
      permissions: [],
      requiredScopes: ['video.list'],
      diagnostics: { readinessOnly: true, tokenStored: false, access_token: 'should-not-leak' },
    })

    expect(connector?.service).toBe('social.tiktok')
    expect(connector?.diagnostics.tokenStored).toBe(false)
    expect(JSON.stringify(connector)).not.toContain('should-not-leak')
  })
})
