import { describe, expect, it } from 'vitest'
import {
  NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID,
  mergeNotesGraphSettings,
  normalizeNotesGraphSettings,
  parseNotesGraphSettingsDocument,
  serializeNotesGraphSettingsDocument,
  type NotesGraphSettings,
} from '../graphSettingsSync'

const settings: NotesGraphSettings = {
  graphSearch: 'tag:project',
  focusMatches: true,
  hideOrphans: true,
  localGraph: true,
  groupMode: 'folder',
  updatedAt: 20,
}

describe('graph settings synced vault document', () => {
  it('uses an internal vault note path for synced graph settings', () => {
    expect(NOTES_GRAPH_SETTINGS_SYNC_NOTE_ID).toBe('.clawcontrol/graph-settings.md')
  })

  it('round-trips normalized graph settings through the sync document content', () => {
    const content = serializeNotesGraphSettingsDocument(settings)

    expect(content).toContain('clawcontrol:graph-settings:v1')
    expect(parseNotesGraphSettingsDocument(content)).toEqual(settings)
  })

  it('normalizes invalid group modes and long search strings', () => {
    const normalized = normalizeNotesGraphSettings({
      ...settings,
      graphSearch: 'x'.repeat(400),
      groupMode: 'bad',
    })

    expect(normalized.graphSearch).toHaveLength(240)
    expect(normalized.groupMode).toBe('tag')
  })

  it('merges by newest settings timestamp', () => {
    expect(mergeNotesGraphSettings(
      { ...settings, graphSearch: 'old', updatedAt: 10 },
      { ...settings, graphSearch: 'new', updatedAt: 30 },
    )).toEqual({ ...settings, graphSearch: 'new', updatedAt: 30 })
  })

  it('ignores malformed synced graph settings content', () => {
    expect(parseNotesGraphSettingsDocument('')).toEqual(expect.objectContaining({ graphSearch: '', groupMode: 'tag' }))
    expect(parseNotesGraphSettingsDocument('<!-- clawcontrol:graph-settings:v1 -->\nnot json\n<!-- /clawcontrol:graph-settings:v1 -->')).toEqual(
      expect.objectContaining({ graphSearch: '', groupMode: 'tag' }),
    )
  })
})
