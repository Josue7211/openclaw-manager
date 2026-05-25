import { describe, expect, it } from 'vitest'
import type { VaultDataViewPreset } from '../dataMode'
import {
  parseVaultDataViewPresetDocument,
  serializeVaultDataViewPresetDocument,
  VAULT_DATA_VIEW_SYNC_NOTE_ID,
} from '../dataViewSync'

const preset: VaultDataViewPreset = {
  id: 'active-work',
  name: 'Active work',
  mode: 'metadata',
  query: 'tag:active',
  dataSortKey: 'property:status',
  taskSortKey: 'done',
  sortDirection: 'asc',
  groupKey: 'formula:tagCount',
  layout: 'cards',
  formulaKey: 'tagCount',
  customFormula: '',
  updatedAt: 20,
}

describe('data view synced vault document', () => {
  it('uses an internal vault note path for synced view definitions', () => {
    expect(VAULT_DATA_VIEW_SYNC_NOTE_ID).toBe('.clawctrl/data-views.md')
  })

  it('round-trips normalized presets through the sync document content', () => {
    const content = serializeVaultDataViewPresetDocument([preset])

    expect(content).toContain('clawctrl:data-views:v1')
    expect(parseVaultDataViewPresetDocument(content)).toEqual([preset])
  })

  it('ignores malformed synced preset content', () => {
    expect(parseVaultDataViewPresetDocument('')).toEqual([])
    expect(parseVaultDataViewPresetDocument('<!-- clawctrl:data-views:v1 -->\nnot json\n<!-- /clawctrl:data-views:v1 -->')).toEqual([])
  })
})
