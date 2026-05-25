import { describe, expect, it } from 'vitest'
import {
  NOTES_WORKSPACE_SYNC_NOTE_ID,
  mergeNotesWorkspaceSnapshots,
  normalizeNotesWorkspaceSnapshots,
  parseNotesWorkspaceDocument,
  serializeNotesWorkspaceDocument,
  type SyncedNotesWorkspaceSnapshot,
} from '../workspaceSync'

const snapshot: SyncedNotesWorkspaceSnapshot = {
  id: 'editor:active',
  name: 'Editing active note',
  viewMode: 'editor',
  focusMode: false,
  infoPanelOpen: true,
  treeWidth: 260,
  sidePaneWidth: 420,
  searchQuery: 'tag:strategy folder:Projects',
  expandedFolders: ['Projects', 'Archive'],
  referencesOpen: true,
  graphContext: {
    graphSearch: 'project',
    focusMatches: true,
    hideOrphans: true,
    localGraph: true,
    groupMode: 'folder',
  },
  dataContext: {
    mode: 'metadata',
    query: 'status:active',
    dataSortKey: 'title',
    taskSortKey: 'line',
    sortDirection: 'asc',
    groupKey: 'folder',
    layout: 'cards',
    formulaKey: 'taskPercent',
    customFormula: '',
  },
  selectedId: 'Projects/roadmap.md',
  sidePaneId: 'Projects/context.md',
  tabIds: ['Projects/roadmap.md', 'Projects/context.md'],
  savedAt: 20,
}

describe('workspace synced vault document', () => {
  it('uses an internal vault note path for synced workspace presets', () => {
    expect(NOTES_WORKSPACE_SYNC_NOTE_ID).toBe('.clawcontrol/workspaces.md')
  })

  it('round-trips normalized workspace presets through the sync document content', () => {
    const content = serializeNotesWorkspaceDocument([snapshot])

    expect(content).toContain('clawcontrol:workspaces:v1')
    expect(parseNotesWorkspaceDocument(content)).toEqual([snapshot])
  })

  it('normalizes view mode, widths, duplicated tabs, and malformed entries', () => {
    expect(normalizeNotesWorkspaceSnapshots([
      {
        ...snapshot,
        treeWidth: 999,
        sidePaneWidth: 9999,
        tabIds: ['Projects/roadmap.md', 'Projects/roadmap.md', '', 'Projects/context.md'],
      },
      { ...snapshot, id: 'bad-view', viewMode: 'board' },
      null,
    ])).toEqual([
      {
        ...snapshot,
        treeWidth: 360,
        sidePaneWidth: 720,
        tabIds: ['Projects/roadmap.md', 'Projects/context.md'],
      },
    ])
  })

  it('merges local and synced presets with newest matching id winning', () => {
    const older = { ...snapshot, name: 'Old name', savedAt: 10 }
    const newer = { ...snapshot, name: 'New name', savedAt: 30 }
    const other = { ...snapshot, id: 'graph:all', viewMode: 'graph' as const, selectedId: null, savedAt: 25 }

    expect(mergeNotesWorkspaceSnapshots([older, other], [newer])).toEqual([newer, other])
  })

  it('ignores malformed synced workspace content', () => {
    expect(parseNotesWorkspaceDocument('')).toEqual([])
    expect(parseNotesWorkspaceDocument('<!-- clawcontrol:workspaces:v1 -->\nnot json\n<!-- /clawcontrol:workspaces:v1 -->')).toEqual([])
  })
})
