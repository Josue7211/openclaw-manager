import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  applyLocalTextOperations,
  autoMergeLocalCollabOperation,
  applyLocalCrdtOperations,
  buildLocalCrdtDeleteOperations,
  buildLocalCrdtInsertOperations,
  buildLocalCrdtOperations,
  buildLocalRichTextOperations,
  buildLocalTextOperations,
  buildLocalCollabMessage,
  collaborationChecksum,
  createLayeredLocalCollabTransport,
  isLocalCollabMessage,
  localCollabChannelName,
  localCrdtDocumentFromText,
  localRichTextDocumentFromMarkdown,
  mergeLocalTextOperationDraft,
  mergeNonOverlappingLineChanges,
  mergeLocalCollabDraft,
  mergeLocalCrdtOperationDraft,
  mergeLocalCrdtOperationSets,
  mergeLocalRichTextOperationDraft,
  mergeLocalRichTextOperationSets,
  normalizeLocalCollabCursor,
  orderLocalCollabMessages,
  readLocalCrdtText,
  readLocalRichTextMarkdown,
  pruneStalePeers,
  rebaseLocalTextOperations,
  summarizeLocalCollabProviderStatuses,
  useLocalNoteCollaboration,
  type LocalCollabMessage,
  type LocalCollabPeer,
} from '../collaboration'

describe('local note collaboration primitives', () => {
  it('creates safe per-document channel names', () => {
    expect(localCollabChannelName('Projects/Roadmap.md')).toBe('clawctrl-notes:Projects_Roadmap.md')
    expect(localCollabChannelName('../Bad/Name.md')).toBe('clawctrl-notes:.._Bad_Name.md')
  })

  it('builds and validates protocol messages for the active document', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 900 }
    const message = buildLocalCollabMessage('draft', 'Projects/Roadmap.md', peer, '# Draft', '# Base')

    expect(message).toEqual(
      expect.objectContaining({
        protocol: 'clawctrl-notes-local-collab',
        version: 1,
        eventId: expect.stringMatching(/^evt-/),
        clientId: 'peer-1',
        sequence: 1_000,
        type: 'draft',
        documentId: 'Projects/Roadmap.md',
        content: '# Draft',
        baseChecksum: collaborationChecksum('# Base'),
        contentChecksum: collaborationChecksum('# Draft'),
        updatedAt: 1_000,
      }),
    )
    expect(message.operations).toEqual([
      expect.objectContaining({
        baseChecksum: collaborationChecksum('# Base'),
        insert: 'Draft',
      }),
    ])
    expect(isLocalCollabMessage(message, 'Projects/Roadmap.md')).toBe(true)
    expect(isLocalCollabMessage(message, 'Other.md')).toBe(false)
    vi.restoreAllMocks()
  })

  it('builds and validates operation messages with text operations', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_100)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1_000 }
    const message = buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, '# Draft', '# Base')

    expect(message).toEqual(
      expect.objectContaining({
        eventId: expect.stringMatching(/^evt-/),
        clientId: 'peer-1',
        sequence: 1_100,
        type: 'operation',
        content: '# Draft',
        baseChecksum: collaborationChecksum('# Base'),
        contentChecksum: collaborationChecksum('# Draft'),
      }),
    )
    expect(message.operations?.length).toBe(1)
    expect(isLocalCollabMessage(message, 'Projects/Roadmap.md')).toBe(true)
    expect(isLocalCollabMessage({ ...message, operations: [] }, 'Projects/Roadmap.md')).toBe(false)
    vi.restoreAllMocks()
  })

  it('rejects malformed or remote-looking messages', () => {
    expect(isLocalCollabMessage({ protocol: 'other', documentId: 'Projects/Roadmap.md' }, 'Projects/Roadmap.md')).toBe(
      false,
    )
    expect(
      isLocalCollabMessage(
        {
          protocol: 'clawctrl-notes-local-collab',
          version: 1,
          type: 'presence',
          documentId: 'Projects/Roadmap.md',
          peer: { id: 'peer-1', name: 'Ada', seenAt: 'now' },
          content: '# Draft',
          baseChecksum: collaborationChecksum('# Base'),
          contentChecksum: collaborationChecksum('# Draft'),
          updatedAt: 1,
        },
        'Projects/Roadmap.md',
      ),
    ).toBe(false)
  })

  it('validates local cursor awareness messages', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1_900 }
    const cursor = normalizeLocalCollabCursor(42.9, -5)
    const message = buildLocalCollabMessage('cursor', 'Projects/Roadmap.md', peer, undefined, '', cursor)

    expect(cursor).toEqual({ anchor: 42, head: 0, updatedAt: 2_000 })
    expect(message.cursor).toEqual(cursor)
    expect(isLocalCollabMessage(message, 'Projects/Roadmap.md')).toBe(true)
    expect(
      isLocalCollabMessage({ ...message, cursor: { anchor: -1, head: 0, updatedAt: 2 } }, 'Projects/Roadmap.md'),
    ).toBe(false)
    vi.restoreAllMocks()
  })

  it('prunes stale peers while keeping active collaborators visible', () => {
    expect(
      pruneStalePeers(
        [
          { id: 'fresh', name: 'Fresh', seenAt: 20_000 },
          { id: 'stale', name: 'Stale', seenAt: 1_000 },
        ],
        21_000,
        5_000,
      ),
    ).toEqual([{ id: 'fresh', name: 'Fresh', seenAt: 20_000 }])
  })

  it('classifies remote draft merges without overwriting conflicting local edits', () => {
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: '# Remote',
      baseChecksum: collaborationChecksum('# Base'),
      contentChecksum: collaborationChecksum('# Remote'),
      updatedAt: 2,
    }

    expect(mergeLocalCollabDraft('# Base', '# Base', draft)).toEqual({ status: 'apply-remote', content: '# Remote' })
    expect(mergeLocalCollabDraft('# Local', '# Base', draft)).toEqual({
      status: 'conflict',
      content: '# Local',
      remoteContent: '# Remote',
    })
    expect(mergeLocalCollabDraft('# Remote', '# Base', draft)).toEqual({ status: 'same', content: '# Remote' })
  })

  it('merges non-overlapping local and remote line edits', () => {
    const base = ['# Plan', '', '- Alpha', '- Beta', '- Gamma'].join('\n')
    const local = ['# Plan', '', '- Alpha local', '- Beta', '- Gamma'].join('\n')
    const remote = ['# Plan', '', '- Alpha', '- Beta', '- Gamma remote'].join('\n')
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      updatedAt: 2,
    }

    expect(mergeNonOverlappingLineChanges(base, local, remote)).toBe(
      ['# Plan', '', '- Alpha local', '- Beta', '- Gamma remote'].join('\n'),
    )
    expect(mergeLocalCollabDraft(local, base, draft)).toEqual({
      status: 'merge-remote',
      content: ['# Plan', '', '- Alpha local', '- Beta', '- Gamma remote'].join('\n'),
    })
  })

  it('keeps overlapping collaboration edits in conflict review', () => {
    const base = ['# Plan', '', '- Alpha'].join('\n')
    const local = ['# Plan', '', '- Local alpha'].join('\n')
    const remote = ['# Plan', '', '- Remote alpha'].join('\n')

    expect(mergeNonOverlappingLineChanges(base, local, remote)).toBeNull()
  })

  it('merges non-overlapping same-line character edits', () => {
    const base = 'Plan status is draft today'
    const local = 'Roadmap status is draft today'
    const remote = 'Plan status is final today'
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      updatedAt: 2,
    }

    expect(mergeNonOverlappingLineChanges(base, local, remote)).toBe('Roadmap status is final today')
    expect(mergeLocalCollabDraft(local, base, draft)).toEqual({
      status: 'merge-remote',
      content: 'Roadmap status is final today',
    })
  })

  it('builds and applies auditable local text operations', () => {
    const base = 'Alpha Beta Gamma'
    const next = 'Alpha Better Gamma'
    const operations = buildLocalTextOperations(base, next)

    expect(operations).toEqual([
      expect.objectContaining({
        baseChecksum: collaborationChecksum(base),
        baseStart: 9,
        baseEnd: 10,
        insert: 'ter',
      }),
    ])
    expect(applyLocalTextOperations(base, operations)).toBe(next)
  })

  it('merges non-overlapping operation drafts before falling back to conflict review', () => {
    const base = 'Alpha Beta Gamma'
    const local = 'Alpha Better Gamma'
    const remote = 'Start Alpha Beta Gamma'
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      operations: buildLocalTextOperations(base, remote),
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(mergeLocalTextOperationDraft(base, local, draft)).toBe('Start Alpha Better Gamma')
    expect(autoMergeLocalCollabOperation(local, base, draft)).toEqual({
      status: 'merge-remote',
      content: 'Start Alpha Better Gamma',
    })
    expect(mergeLocalCollabDraft(local, base, draft)).toEqual({
      status: 'merge-remote',
      content: 'Start Alpha Better Gamma',
    })
  })

  it('rebases same-position inserts deterministically for both peers', () => {
    const base = 'Hello'
    const local = 'Hello A'
    const remote = 'Hello B'
    const localOperations = buildLocalTextOperations(base, local)
    const remoteOperations = buildLocalTextOperations(base, remote)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const remoteDraft = {
      id: 'evt-remote',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      operations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }
    const localDraft = {
      id: 'evt-local',
      peer,
      content: local,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(local),
      operations: localOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    const localFirst = mergeLocalTextOperationDraft(base, local, remoteDraft)
    const remoteFirst = mergeLocalTextOperationDraft(base, remote, localDraft)

    expect(localFirst).toBe(remoteFirst)
    expect(['Hello A B', 'Hello B A']).toContain(localFirst)
    expect(rebaseLocalTextOperations(local, remoteOperations, localOperations)?.[0].baseChecksum).toBe(
      collaborationChecksum(local),
    )
  })

  it('rebases remote inserts after local deletes', () => {
    const base = 'Alpha Beta Gamma'
    const local = 'Alpha Gamma'
    const remote = 'Alpha Beta Gamma!'
    const localOperations = buildLocalTextOperations(base, local)
    const remoteOperations = buildLocalTextOperations(base, remote)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      operations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(rebaseLocalTextOperations(local, remoteOperations, localOperations)).toEqual([
      expect.objectContaining({
        baseChecksum: collaborationChecksum(local),
        baseStart: local.length,
        baseEnd: local.length,
        insert: '!',
      }),
    ])
    expect(mergeLocalTextOperationDraft(base, local, draft)).toBe('Alpha Gamma!')
  })

  it('rebases remote replacements after local inserts', () => {
    const base = 'Alpha Beta Gamma'
    const local = 'Intro Alpha Beta Gamma'
    const remote = 'Alpha Final Gamma'
    const localOperations = buildLocalTextOperations(base, local)
    const remoteOperations = buildLocalTextOperations(base, remote)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      operations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(rebaseLocalTextOperations(local, remoteOperations, localOperations)).toEqual([
      expect.objectContaining({
        baseChecksum: collaborationChecksum(local),
        baseStart: 'Intro Alpha '.length,
        baseEnd: 'Intro Alpha Beta'.length,
        insert: 'Final',
      }),
    ])
    expect(mergeLocalTextOperationDraft(base, local, draft)).toBe('Intro Alpha Final Gamma')
  })

  it('keeps overlapping operation drafts in conflict review', () => {
    const base = 'Alpha Beta Gamma'
    const local = 'Alpha Local Gamma'
    const remote = 'Alpha Remote Gamma'
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-draft',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      operations: buildLocalTextOperations(base, remote),
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(autoMergeLocalCollabOperation(local, base, draft)).toBeNull()
    expect(mergeLocalTextOperationDraft(base, local, draft)).toBeNull()
    expect(mergeLocalCollabDraft(local, base, draft)).toEqual({
      status: 'conflict',
      content: local,
      remoteContent: remote,
    })
  })

  it('converges CRDT inserts in the same position regardless of arrival order', () => {
    const document = localCrdtDocumentFromText('Hello')
    const adaInsert = buildLocalCrdtInsertOperations(document, 5, ' Ada', 'ada', 1)
    const graceInsert = buildLocalCrdtInsertOperations(document, 5, ' Grace', 'grace', 1)

    const adaFirst = readLocalCrdtText(applyLocalCrdtOperations(applyLocalCrdtOperations(document, adaInsert), graceInsert))
    const graceFirst = readLocalCrdtText(applyLocalCrdtOperations(applyLocalCrdtOperations(document, graceInsert), adaInsert))
    const merged = readLocalCrdtText(mergeLocalCrdtOperationSets(document, [graceInsert, adaInsert]))

    expect(adaFirst).toBe(graceFirst)
    expect(merged).toBe(adaFirst)
    expect(adaFirst).toContain('Ada')
    expect(adaFirst).toContain('Grace')
  })

  it('keeps CRDT deletes as tombstones so later remote inserts still converge', () => {
    const document = localCrdtDocumentFromText('Alpha Beta Gamma')
    const deleteBeta = buildLocalCrdtDeleteOperations(document, 'Alpha '.length, 'Alpha Beta'.length)
    const insertInsideBeta = buildLocalCrdtInsertOperations(document, 'Alpha Be'.length, 'tter', 'remote', 2)

    const deleteFirst = readLocalCrdtText(
      applyLocalCrdtOperations(applyLocalCrdtOperations(document, deleteBeta), insertInsideBeta),
    )
    const insertFirst = readLocalCrdtText(
      applyLocalCrdtOperations(applyLocalCrdtOperations(document, insertInsideBeta), deleteBeta),
    )

    expect(deleteFirst).toBe(insertFirst)
    expect(deleteFirst).toBe('Alpha tter Gamma')
  })

  it('validates operation messages that carry CRDT operations instead of range patches', () => {
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const document = localCrdtDocumentFromText('Alpha')
    const crdtOperations = buildLocalCrdtInsertOperations(document, 5, ' beta', 'peer-1', 7)
    const message = {
      ...buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, 'Alpha beta', 'Alpha'),
      operations: undefined,
      crdtOperations,
    } satisfies LocalCollabMessage

    expect(isLocalCollabMessage(message, 'Projects/Roadmap.md')).toBe(true)
    expect(isLocalCollabMessage({ ...message, crdtOperations: [] }, 'Projects/Roadmap.md')).toBe(false)
  })

  it('builds CRDT operations from editor text changes and uses them for draft merge', () => {
    const base = 'Alpha Beta Gamma'
    const local = 'Alpha Local Gamma'
    const remote = 'Alpha Remote Gamma'
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-crdt',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      crdtOperations: buildLocalCrdtOperations(base, remote, 'remote', 2),
      source: 'operation' as const,
      updatedAt: 2,
    }

    const merged = mergeLocalCrdtOperationDraft(base, local, draft)

    expect(merged).not.toBeNull()
    expect(merged).toContain('Local')
    expect(merged).toContain('Remote')
    expect(mergeLocalCollabDraft(local, base, draft)).toEqual({ status: 'merge-remote', content: merged })
  })

  it('merges independent rich document block operations before plain text conflict review', () => {
    const base = ['# Plan', 'Alpha paragraph', '| A | B |\n| --- | --- |\n| 1 | 2 |'].join('\n\n')
    const local = ['# Plan', 'Alpha paragraph with local detail', '| A | B |\n| --- | --- |\n| 1 | 2 |'].join('\n\n')
    const remote = ['# Plan updated', 'Alpha paragraph', '| A | B |\n| --- | --- |\n| 1 | 2 |'].join('\n\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }
    const richOnlyMessage = {
      ...buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, remote, base),
      operations: undefined,
      crdtOperations: undefined,
      richOperations: remoteOperations,
    } satisfies LocalCollabMessage

    expect(baseDocument.map(block => block.type)).toEqual(['heading', 'paragraph', 'table'])
    expect(localOperations).toEqual([expect.objectContaining({ type: 'update', blockType: 'paragraph' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'update', blockType: 'heading' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(
      ['# Plan updated', 'Alpha paragraph with local detail', '| A | B |\n| --- | --- |\n| 1 | 2 |'].join('\n\n'),
    )
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(
      ['# Plan updated', 'Alpha paragraph with local detail', '| A | B |\n| --- | --- |\n| 1 | 2 |'].join('\n\n'),
    )
    expect(isLocalCollabMessage(richOnlyMessage, 'Projects/Roadmap.md')).toBe(true)
    expect(isLocalCollabMessage({ ...richOnlyMessage, richOperations: [] }, 'Projects/Roadmap.md')).toBe(false)
  })

  it('keeps conflicting rich document block edits in review', () => {
    const base = ['# Plan', 'Alpha paragraph'].join('\n\n')
    const local = ['# Plan local', 'Alpha paragraph'].join('\n\n')
    const remote = ['# Plan remote', 'Alpha paragraph'].join('\n\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-conflict',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBeNull()
  })

  it('merges independent rich table cell edits inside one table block', () => {
    const base = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Backups | Lin | 5 |'].join('\n')
    const local = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 12 |', '| Backups | Lin | 5 |'].join('\n')
    const remote = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Backups | Sam | 5 |'].join('\n')
    const expected = [
      '| Item | Owner | Cost |',
      '| --- | --- | --- |',
      '| Hosting | Ada | 12 |',
      '| Backups | Sam | 5 |',
    ].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-cells',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 2 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 2, column: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps conflicting rich table cell edits in review', () => {
    const base = ['| Item | Cost |', '| --- | --- |', '| Hosting | 10 |'].join('\n')
    const local = ['| Item | Cost |', '| --- | --- |', '| Hosting | 12 |'].join('\n')
    const remote = ['| Item | Cost |', '| --- | --- |', '| Hosting | 15 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('merges independent rich table row inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Backups | Lin |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| DNS | Sam |', '| Hosting | Ada |'].join('\n')
    const expected = [
      '| Item | Owner |',
      '| --- | --- |',
      '| DNS | Sam |',
      '| Hosting | Ada |',
      '| Backups | Lin |',
    ].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-rows',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 2, cells: ['Backups', 'Lin'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 1, cells: ['DNS', 'Sam'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges same-slot rich table row inserts deterministically', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Backups | Lin |', '| Hosting | Ada |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| DNS | Sam |', '| Hosting | Ada |'].join('\n')
    const expected = [
      '| Item | Owner |',
      '| --- | --- |',
      '| Backups | Lin |',
      '| DNS | Sam |',
      '| Hosting | Ada |',
    ].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-row-same-slot',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 1, cells: ['Backups', 'Lin'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 1, cells: ['DNS', 'Sam'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich table row deletes with independent row inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Docs | Ray |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |', '| Backups | Lin |'].join('\n')
    const expected = ['| Item | Owner |', '| --- | --- |', '| Docs | Ray |', '| Backups | Lin |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-row-delete-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRowDelete', index: 1, cells: ['Hosting', 'Ada'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 3, cells: ['Backups', 'Lin'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich table cell edits with independent row inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Lin |', '| Docs | Ray |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |', '| Backups | Sam |'].join('\n')
    const expected = ['| Item | Owner |', '| --- | --- |', '| Hosting | Lin |', '| Docs | Ray |', '| Backups | Sam |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-cell-row-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1, markdown: 'Lin' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 3, cells: ['Backups', 'Sam'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich table cell edits anchored when a row is inserted before them', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Lin |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| Backups | Sam |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const expected = ['| Item | Owner |', '| --- | --- |', '| Backups | Sam |', '| Hosting | Ada |', '| Docs | Lin |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 2, column: 1, markdown: 'Lin' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 1, cells: ['Backups', 'Sam'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges rich table row inserts with independent column inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |', '| Backups | Sam |'].join('\n')
    const remote = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const expected = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |', '| Backups | Sam |  |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-row-column-inserts',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 3, cells: ['Backups', 'Sam'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumn', index: 2, cells: ['Cost', '---', '10', '5'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich table cell edits anchored when a column is inserted before them', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Lin |'].join('\n')
    const remote = ['| Item | Status | Owner |', '| --- | --- | --- |', '| Hosting | Active | Ada |', '| Docs | Draft | Ray |'].join('\n')
    const expected = ['| Item | Status | Owner |', '| --- | --- | --- |', '| Hosting | Active | Ada |', '| Docs | Draft | Lin |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 2, column: 1, markdown: 'Lin' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumn', index: 1, cells: ['Status', '---', 'Active', 'Draft'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges rich table cell edits with independent row and column inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Lin |', '| Docs | Ray |'].join('\n')
    const remoteRow = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |', '| Backups | Sam |'].join('\n')
    const remoteColumn = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const expected = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Lin | 10 |', '| Docs | Ray | 5 |', '| Backups | Sam |  |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const rowOperations = buildLocalRichTextOperations(base, remoteRow, 'remote-row', 2)
    const columnOperations = buildLocalRichTextOperations(base, remoteColumn, 'remote-column', 3)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, rowOperations, columnOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1, markdown: 'Lin' })])
    expect(rowOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 3, cells: ['Backups', 'Sam'] })])
    expect(columnOperations).toEqual([expect.objectContaining({ type: 'tableColumn', index: 2, cells: ['Cost', '---', '10', '5'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('keeps rich table row deletes that collide with cell edits in review', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Docs | Ray |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| Hosting | Lin |', '| Docs | Ray |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRowDelete', index: 1, cells: ['Hosting', 'Ada'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('merges rich table row deletes with cell edits outside the deleted row', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Docs | Ray |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Lin |'].join('\n')
    const expected = ['| Item | Owner |', '| --- | --- |', '| Docs | Lin |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRowDelete', index: 1, cells: ['Hosting', 'Ada'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 2, column: 1, markdown: 'Lin' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges rich table column deletes with independent column inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item |', '| --- |', '| Hosting |', '| Docs |'].join('\n')
    const remote = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const expected = ['| Item | Cost |', '| --- | --- |', '| Hosting | 10 |', '| Docs | 5 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-column-delete-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableColumnDelete', index: 1, cells: ['Owner', '---', 'Ada', 'Ray'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumn', index: 2, cells: ['Cost', '---', '10', '5'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich table row deletes with independent column deletes inside one table block', () => {
    const base = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const local = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Docs | Ray | 5 |'].join('\n')
    const remote = ['| Item | Cost |', '| --- | --- |', '| Hosting | 10 |', '| Docs | 5 |'].join('\n')
    const expected = ['| Item | Cost |', '| --- | --- |', '| Docs | 5 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-row-column-deletes',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRowDelete', index: 1, cells: ['Hosting', 'Ada', '10'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumnDelete', index: 1, cells: ['Owner', '---', 'Ada', 'Ray'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich table row inserts with independent column deletes inside one table block', () => {
    const base = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const local = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |', '| Backups | Sam | 2 |'].join('\n')
    const remote = ['| Item | Cost |', '| --- | --- |', '| Hosting | 10 |', '| Docs | 5 |'].join('\n')
    const expected = ['| Item | Cost |', '| --- | --- |', '| Hosting | 10 |', '| Docs | 5 |', '| Backups | 2 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-row-insert-column-delete',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRow', index: 3, cells: ['Backups', 'Sam', '2'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumnDelete', index: 1, cells: ['Owner', '---', 'Ada', 'Ray'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich table row deletes with independent column inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Docs | Ray |'].join('\n')
    const remote = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const expected = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Docs | Ray | 5 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-row-delete-column-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableRowDelete', index: 1, cells: ['Hosting', 'Ada'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumn', index: 2, cells: ['Cost', '---', '10', '5'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich table cell edits with independent column inserts inside one table block', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item | Owner |', '| --- | --- |', '| Hosting | Lin |', '| Docs | Ray |'].join('\n')
    const remote = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const expected = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Lin | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-table-cell-column-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1, markdown: 'Lin' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableColumn', index: 2, cells: ['Cost', '---', '10', '5'] })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich table column deletes that collide with cell edits in review', () => {
    const base = ['| Item | Owner |', '| --- | --- |', '| Hosting | Ada |', '| Docs | Ray |'].join('\n')
    const local = ['| Item |', '| --- |', '| Hosting |', '| Docs |'].join('\n')
    const remote = ['| Item | Owner |', '| --- | --- |', '| Hosting | Lin |', '| Docs | Ray |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableColumnDelete', index: 1, cells: ['Owner', '---', 'Ada', 'Ray'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('merges rich table column deletes with cell edits outside the deleted column', () => {
    const base = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 10 |', '| Docs | Ray | 5 |'].join('\n')
    const local = ['| Item | Cost |', '| --- | --- |', '| Hosting | 10 |', '| Docs | 5 |'].join('\n')
    const remote = ['| Item | Owner | Cost |', '| --- | --- | --- |', '| Hosting | Ada | 12 |', '| Docs | Ray | 5 |'].join('\n')
    const expected = ['| Item | Cost |', '| --- | --- |', '| Hosting | 12 |', '| Docs | 5 |'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'tableColumnDelete', index: 1, cells: ['Owner', '---', 'Ada', 'Ray'] })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'tableCell', row: 1, column: 2, markdown: '12' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges independent rich task-list item edits inside one checklist block', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const local = ['- [x] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [x] Review citations', '- [ ] Submit'].join('\n')
    const expected = ['- [x] Draft outline', '- [x] Review citations', '- [ ] Submit'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-task-list',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 0 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps conflicting rich task-list item edits in review', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations'].join('\n')
    const local = ['- [x] Draft outline', '- [ ] Review citations'].join('\n')
    const remote = ['- [ ] Draft outline again', '- [ ] Review citations'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 0 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 0 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('merges rich task-list item edits with independent inserts inside one checklist block', () => {
    const base = ['- [ ] Draft outline', '- [ ] Submit'].join('\n')
    const local = ['- [x] Draft outline', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const expected = ['- [x] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-task-list-edit-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 0 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich task-list item edits anchored when an item is inserted before them', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const local = ['- [ ] Draft outline', '- [ ] Review citations', '- [x] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [ ] Gather sources', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const expected = [
      '- [ ] Draft outline',
      '- [ ] Gather sources',
      '- [ ] Review citations',
      '- [x] Submit',
    ].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 2 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges rich task-list item edits with independent deletes inside one checklist block', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const local = ['- [x] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [ ] Submit'].join('\n')
    const expected = ['- [x] Draft outline', '- [ ] Submit'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-task-list-edit-delete',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 0 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemDelete', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich task-list item edits anchored when an item before them is deleted', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const local = ['- [ ] Draft outline', '- [ ] Review citations', '- [x] Submit'].join('\n')
    const remote = ['- [ ] Review citations', '- [ ] Submit'].join('\n')
    const expected = ['- [ ] Review citations', '- [x] Submit'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 2 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemDelete', index: 0 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges independent rich task-list item inserts inside one checklist block', () => {
    const base = ['- [ ] Draft outline', '- [ ] Submit'].join('\n')
    const local = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [ ] Submit', '- [ ] Send confirmation'].join('\n')
    const expected = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit', '- [ ] Send confirmation'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-task-list-inserts',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 2 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges same-slot rich task-list item inserts deterministically', () => {
    const base = ['- [ ] Draft outline', '- [ ] Submit'].join('\n')
    const local = ['- [ ] Draft outline', '- [ ] Add rubric', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [ ] Gather sources', '- [ ] Submit'].join('\n')
    const expected = ['- [ ] Draft outline', '- [ ] Add rubric', '- [ ] Gather sources', '- [ ] Submit'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-task-list-same-slot-inserts',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich task-list item deletes with independent inserts inside one checklist block', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const local = ['- [ ] Draft outline', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit', '- [ ] Send confirmation'].join('\n')
    const expected = ['- [ ] Draft outline', '- [ ] Submit', '- [ ] Send confirmation'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-task-list-delete-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItemDelete', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItemInsert', index: 3 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich task-list deletes that collide with item edits in review', () => {
    const base = ['- [ ] Draft outline', '- [ ] Review citations', '- [ ] Submit'].join('\n')
    const local = ['- [ ] Draft outline', '- [ ] Submit'].join('\n')
    const remote = ['- [ ] Draft outline', '- [x] Review citations', '- [ ] Submit'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'listItemDelete', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'listItem', index: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('merges independent rich callout line edits inside one quote block', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Draft checklist today', '> Confirm launch owner'].join('\n')
    const remote = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner with Ada'].join('\n')
    const expected = ['> [!note] Launch plan', '> Draft checklist today', '> Confirm launch owner with Ada'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-callout-lines',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'line', index: 2 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich callout line edits with independent line inserts', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Draft checklist today', '> Confirm launch owner'].join('\n')
    const remote = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner', '> Publish update'].join('\n')
    const expected = ['> [!note] Launch plan', '> Draft checklist today', '> Confirm launch owner', '> Publish update'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-callout-line-edit-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'lineInsert', index: 3 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges same-slot rich callout line inserts deterministically', () => {
    const base = ['> [!note] Launch plan', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Add scope', '> Confirm launch owner'].join('\n')
    const remote = ['> [!note] Launch plan', '> Gather owner', '> Confirm launch owner'].join('\n')
    const expected = ['> [!note] Launch plan', '> Add scope', '> Gather owner', '> Confirm launch owner'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-callout-same-slot-lines',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'lineInsert', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'lineInsert', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich callout line edits anchored when a line is inserted before them', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner with Ada'].join('\n')
    const remote = ['> [!note] Launch plan', '> Scope kickoff', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const expected = [
      '> [!note] Launch plan',
      '> Scope kickoff',
      '> Draft checklist',
      '> Confirm launch owner with Ada',
    ].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'line', index: 2 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'lineInsert', index: 1 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
  })

  it('merges rich callout line edits with independent line deletes', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Draft checklist today', '> Confirm launch owner'].join('\n')
    const remote = ['> Draft checklist', '> Confirm launch owner'].join('\n')
    const expected = ['> Draft checklist today', '> Confirm launch owner'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-callout-line-edit-delete',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'lineDelete', index: 0 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich callout line deletes with independent line inserts', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Confirm launch owner'].join('\n')
    const remote = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner', '> Publish update'].join('\n')
    const expected = ['> [!note] Launch plan', '> Confirm launch owner', '> Publish update'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-callout-line-delete-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'lineDelete', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'lineInsert', index: 3 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('merges rich code-block line edits with independent line inserts', () => {
    const base = ['```ts', 'const owner = "Ada"', 'return owner', '```'].join('\n')
    const local = ['```ts', 'const owner = "Lin"', 'return owner', '```'].join('\n')
    const remote = ['```ts', 'const owner = "Ada"', 'const ready = true', 'return owner', '```'].join('\n')
    const expected = ['```ts', 'const owner = "Lin"', 'const ready = true', 'return owner', '```'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-code-line-edit-insert',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'lineInsert', index: 2 })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(expected)
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe(expected)
  })

  it('keeps rich code-block line deletes that collide with line edits in review', () => {
    const base = ['```ts', 'const owner = "Ada"', 'return owner', '```'].join('\n')
    const local = ['```ts', 'return owner', '```'].join('\n')
    const remote = ['```ts', 'const owner = "Lin"', 'return owner', '```'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'lineDelete', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('keeps rich callout line deletes that collide with line edits in review', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist', '> Confirm launch owner'].join('\n')
    const local = ['> [!note] Launch plan', '> Confirm launch owner'].join('\n')
    const remote = ['> [!note] Launch plan', '> Draft checklist today', '> Confirm launch owner'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'lineDelete', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('keeps conflicting rich callout line edits in review', () => {
    const base = ['> [!note] Launch plan', '> Draft checklist'].join('\n')
    const local = ['> [!note] Launch plan', '> Draft checklist today'].join('\n')
    const remote = ['> [!note] Launch plan', '> Draft checklist tomorrow'].join('\n')
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'line', index: 1 })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('merges independent inline rich formatting marks inside one block', () => {
    const base = 'Alpha Beta Gamma'
    const local = '**Alpha** Beta Gamma'
    const remote = 'Alpha Beta *Gamma*'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])
    const peer: LocalCollabPeer = { id: 'peer-1', name: 'Ada', seenAt: 1 }
    const draft = {
      id: 'evt-rich-marks',
      peer,
      content: remote,
      baseChecksum: collaborationChecksum(base),
      contentChecksum: collaborationChecksum(remote),
      richOperations: remoteOperations,
      source: 'operation' as const,
      updatedAt: 2,
    }

    expect(localOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'bold' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'italic' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe('**Alpha** Beta *Gamma*')
    expect(mergeLocalRichTextOperationDraft(base, local, draft)).toBe('**Alpha** Beta *Gamma*')
  })

  it('merges same-range nested inline rich formatting marks', () => {
    const base = 'Alpha Beta Gamma'
    const local = '**Alpha** Beta Gamma'
    const remote = '*Alpha* Beta Gamma'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'bold' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'italic' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe('***Alpha*** Beta Gamma')
  })

  it('merges independent inline style marks for Docs formatting', () => {
    const base = 'Alpha Beta Gamma'
    const local = '<u>Alpha</u> Beta Gamma'
    const remote = 'Alpha Beta <mark data-color="#ffee58" style="background-color: #ffee58">Gamma</mark>'
    const color = 'Alpha <span style="color: #7c3aed">Beta</span> Gamma'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const colorOperations = buildLocalRichTextOperations(base, color, 'color', 3)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'underline' })])
    expect(remoteOperations).toEqual([
      expect.objectContaining({ type: 'mark', mark: 'highlight', color: '#ffee58' }),
    ])
    expect(colorOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'color', color: '#7c3aed' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(
      '<u>Alpha</u> Beta <mark data-color="#ffee58" style="background-color: #ffee58">Gamma</mark>',
    )
  })

  it('merges partially overlapping compatible inline rich formatting marks', () => {
    const base = 'Alpha Beta Gamma'
    const local = '**Alpha Beta** Gamma'
    const remote = 'Alpha *Beta Gamma*'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(merged && readLocalRichTextMarkdown(merged)).toBe(
      '<strong>Alpha </strong><em><strong>Beta</strong></em><em> Gamma</em>',
    )
  })

  it('continues rich mark merges after segmented HTML output is the new base', () => {
    const base = '<strong>Alpha </strong><em><strong>Beta</strong></em><em> Gamma</em>'
    const local = '<strong>Alpha </strong><em><strong><u>Beta</u></strong></em><em> Gamma</em>'
    const remote =
      '<strong>Alpha </strong><em><strong>Beta</strong></em><em><span style="color: #7c3aed"> Gamma</span></em>'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)
    const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])

    expect(localOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'underline' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'color', color: '#7c3aed' })])
    expect(merged && readLocalRichTextMarkdown(merged)).toBe(
      '**Alpha **<u>***Beta***</u><span style="color: #7c3aed">* Gamma*</span>',
    )
  })

  it('keeps same-range link target disagreements in review', () => {
    const base = 'Alpha Beta Gamma'
    const local = '[Alpha](https://local.example) Beta Gamma'
    const remote = '[Alpha](https://remote.example) Beta Gamma'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'link' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'link' })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('keeps same-range color disagreements in review', () => {
    const base = 'Alpha Beta Gamma'
    const local = '<span style="color: #7c3aed">Alpha</span> Beta Gamma'
    const remote = '<span style="color: #dc2626">Alpha</span> Beta Gamma'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'color', color: '#7c3aed' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'color', color: '#dc2626' })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('keeps risky overlapping inline code formatting in review', () => {
    const base = 'Alpha Beta Gamma'
    const local = '`Alpha Beta` Gamma'
    const remote = 'Alpha *Beta Gamma*'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('keeps inline mark removal plus independent mark addition in review', () => {
    const base = '**Alpha** Beta Gamma'
    const local = 'Alpha Beta Gamma'
    const remote = '**Alpha** *Beta* Gamma'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'update', blockType: 'paragraph' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'italic' })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('keeps text edits plus independent inline mark additions in review', () => {
    const base = 'Alpha Beta Gamma'
    const local = 'Alpha Beta Gamma updated'
    const remote = '**Alpha** Beta Gamma'
    const baseDocument = localRichTextDocumentFromMarkdown(base)
    const localOperations = buildLocalRichTextOperations(base, local, 'local', 1)
    const remoteOperations = buildLocalRichTextOperations(base, remote, 'remote', 2)

    expect(localOperations).toEqual([expect.objectContaining({ type: 'update', blockType: 'paragraph' })])
    expect(remoteOperations).toEqual([expect.objectContaining({ type: 'mark', mark: 'bold' })])
    expect(mergeLocalRichTextOperationSets(baseDocument, [localOperations, remoteOperations])).toBeNull()
  })

  it('queues same-peer operation events by event id and dedupes repeats', async () => {
    const peer: LocalCollabPeer = { id: 'peer-remote', name: 'Ada', seenAt: Date.now() }
    const first = {
      ...buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, 'Alpha one', 'Alpha'),
      eventId: 'evt-first',
      clientId: 'peer-remote',
      sequence: 1,
      updatedAt: Date.now() + 1,
    } satisfies LocalCollabMessage
    const second = {
      ...buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, 'Alpha two', 'Alpha'),
      eventId: 'evt-second',
      clientId: 'peer-remote',
      sequence: 2,
      updatedAt: Date.now() + 2,
    } satisfies LocalCollabMessage
    const transport = {
      publish: vi.fn(async () => {}),
      list: vi.fn(async () => [second, first, first]),
    }

    const { result } = renderHook(() => useLocalNoteCollaboration('Projects/Roadmap.md', 'Local', transport))

    await waitFor(() => expect(result.current.drafts.map(draft => draft.id)).toEqual(['evt-first', 'evt-second']))

    act(() => result.current.dismissDraft('evt-first'))

    expect(result.current.drafts.map(draft => draft.id)).toEqual(['evt-second'])
  })

  it('orders local collaboration messages by sequence, client, timestamp, and event id', () => {
    const peer: LocalCollabPeer = { id: 'peer-remote', name: 'Ada', seenAt: 1 }
    const messages = [
      { ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer), eventId: 'evt-c', clientId: 'b', sequence: 2, updatedAt: 3 },
      { ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer), eventId: 'evt-b', clientId: 'a', sequence: 2, updatedAt: 2 },
      { ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer), eventId: 'evt-a', clientId: 'b', sequence: 1, updatedAt: 4 },
    ] satisfies LocalCollabMessage[]

    expect(orderLocalCollabMessages(messages).map(message => message.eventId)).toEqual(['evt-a', 'evt-b', 'evt-c'])
  })

  it('layers collaboration transports with provider cursors and event dedupe', async () => {
    const peer: LocalCollabPeer = { id: 'peer-remote', name: 'Ada', seenAt: 1 }
    const first = {
      ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer),
      eventId: 'evt-first',
      sequence: 1,
      updatedAt: 10,
    } satisfies LocalCollabMessage
    const second = {
      ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer),
      eventId: 'evt-second',
      sequence: 2,
      updatedAt: 20,
    } satisfies LocalCollabMessage
    const localList = vi.fn(async (_documentId: string, since: number) => (since < 10 ? [first, second] : [second]))
    const remoteList = vi.fn(async () => [second, first])
    const transport = createLayeredLocalCollabTransport([
      { id: 'local-sqlite', transport: { publish: vi.fn(async () => {}), list: localList } },
      { id: 'remote-peer', transport: { publish: vi.fn(async () => {}), list: remoteList } },
    ])

    const events = await transport.list('Projects/Roadmap.md', 0)
    const nextEvents = await transport.list('Projects/Roadmap.md', 0)

    expect(events.map(event => event.eventId)).toEqual(['evt-first', 'evt-second'])
    expect(nextEvents).toEqual([])
    expect(localList).toHaveBeenLastCalledWith('Projects/Roadmap.md', 20)
    expect(transport.status()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'local-sqlite', ok: true, lastListedAt: expect.any(Number) }),
        expect.objectContaining({ id: 'remote-peer', ok: true, lastListedAt: expect.any(Number) }),
      ]),
    )
  })

  it('mirrors newly listed collaboration events to providers that missed them', async () => {
    const peer: LocalCollabPeer = { id: 'peer-local', name: 'Local', seenAt: 1 }
    const message = {
      ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer),
      eventId: 'evt-local-only',
      sequence: 1,
      updatedAt: 10,
    } satisfies LocalCollabMessage
    const remotePublish = vi.fn(async () => {})
    const transport = createLayeredLocalCollabTransport([
      { id: 'local-sqlite', transport: { publish: vi.fn(async () => {}), list: vi.fn(async () => [message]) } },
      { id: 'remote-peer', transport: { publish: remotePublish, list: vi.fn(async () => []) } },
    ])

    await expect(transport.list('Projects/Roadmap.md', 0)).resolves.toEqual([message])

    expect(remotePublish).toHaveBeenCalledWith(message)
    expect(transport.status()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'remote-peer', ok: true, lastPublishedAt: expect.any(Number) }),
      ]),
    )
  })

  it('advances provider cursors after publish to avoid echoing local events as fresh remote work', async () => {
    const peer: LocalCollabPeer = { id: 'peer-local', name: 'Local', seenAt: 1 }
    const message = {
      ...buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, 'Draft', ''),
      eventId: 'evt-local-publish',
      sequence: 1,
      updatedAt: 20,
    } satisfies LocalCollabMessage
    const localList = vi.fn(async () => [message])
    const remoteList = vi.fn(async () => [message])
    const transport = createLayeredLocalCollabTransport([
      { id: 'local-sqlite', transport: { publish: vi.fn(async () => {}), list: localList } },
      { id: 'remote-peer', transport: { publish: vi.fn(async () => {}), list: remoteList } },
    ])

    await transport.publish(message)
    await expect(transport.list('Projects/Roadmap.md', 0)).resolves.toEqual([])

    expect(localList).toHaveBeenCalledWith('Projects/Roadmap.md', 20)
    expect(remoteList).toHaveBeenCalledWith('Projects/Roadmap.md', 20)
  })

  it('keeps layered collaboration alive when one provider fails', async () => {
    const peer: LocalCollabPeer = { id: 'peer-remote', name: 'Ada', seenAt: 1 }
    const message = {
      ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', peer),
      eventId: 'evt-remote',
      updatedAt: 10,
    } satisfies LocalCollabMessage
    const failingPublish = vi.fn(async () => {
      throw new Error('remote offline')
    })
    const workingPublish = vi.fn(async () => {})
    const transport = createLayeredLocalCollabTransport([
      { id: 'local-sqlite', transport: { publish: workingPublish, list: vi.fn(async () => [message]) } },
      { id: 'remote-peer', transport: { publish: failingPublish, list: vi.fn(async () => { throw new Error('remote offline') }) } },
    ])

    await expect(transport.publish(message)).resolves.toBeUndefined()
    await expect(transport.list('Projects/Roadmap.md', 0)).resolves.toEqual([message])

    expect(workingPublish).toHaveBeenCalledWith(message)
    expect(failingPublish).toHaveBeenCalledWith(message)
    expect(transport.status()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'local-sqlite', ok: true }),
        expect.objectContaining({ id: 'remote-peer', ok: false, lastError: 'remote offline' }),
      ]),
    )
  })

  it('replays partially published collaboration events to recovered providers', async () => {
    const peer: LocalCollabPeer = { id: 'peer-local', name: 'Local', seenAt: 1 }
    const message = {
      ...buildLocalCollabMessage('operation', 'Projects/Roadmap.md', peer, 'Draft', ''),
      eventId: 'evt-partial-publish',
      sequence: 1,
      updatedAt: 20,
    } satisfies LocalCollabMessage
    const localList = vi.fn(async (_documentId: string, since: number) => (since < 20 ? [message] : []))
    const remoteList = vi
      .fn()
      .mockRejectedValueOnce(new Error('remote offline'))
      .mockResolvedValue([])
    const remotePublish = vi
      .fn()
      .mockRejectedValueOnce(new Error('remote offline'))
      .mockResolvedValue(undefined)
    const transport = createLayeredLocalCollabTransport([
      { id: 'local-sqlite', transport: { publish: vi.fn(async () => {}), list: localList } },
      { id: 'remote-peer', transport: { publish: remotePublish, list: remoteList } },
    ])

    await expect(transport.publish(message)).resolves.toBeUndefined()
    expect(transport.status()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'remote-peer', pendingMirrorCount: 1 })]),
    )
    await expect(transport.list('Projects/Roadmap.md', 0)).resolves.toEqual([message])
    expect(transport.status()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'remote-peer', pendingMirrorCount: 1 })]),
    )
    await expect(transport.list('Projects/Roadmap.md', 0)).resolves.toEqual([])
    expect(transport.status()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'remote-peer', pendingMirrorCount: 0 })]),
    )
    await expect(transport.list('Projects/Roadmap.md', 0)).resolves.toEqual([])

    expect(remotePublish).toHaveBeenCalledTimes(2)
    expect(remotePublish).toHaveBeenLastCalledWith(message)
  })

  it('summarizes collaboration provider readiness without treating local saves as failed', () => {
    expect(summarizeLocalCollabProviderStatuses([])).toEqual(
      expect.objectContaining({
        state: 'waiting',
        label: 'Collab waiting',
        activeProviders: 0,
        failingProviders: 0,
      }),
    )
    expect(
      summarizeLocalCollabProviderStatuses([
        { id: 'local-sqlite', ok: true, lastListedAt: 10 },
        { id: 'remote-http', ok: false, lastError: 'remote offline' },
      ]),
    ).toEqual(
      expect.objectContaining({
        state: 'degraded',
        label: 'Collab degraded',
        detail: expect.stringContaining('Local saves still stay protected'),
        activeProviders: 1,
        failingProviders: 1,
      }),
    )
    expect(
      summarizeLocalCollabProviderStatuses([
        { id: 'local-sqlite', ok: false, lastError: 'local route down' },
        { id: 'remote-http', ok: false, lastError: 'remote offline' },
      ]),
    ).toEqual(expect.objectContaining({ state: 'offline', label: 'Collab offline', failingProviders: 2 }))
    expect(summarizeLocalCollabProviderStatuses([{ id: 'local-sqlite', ok: true }])).toEqual(
      expect.objectContaining({ state: 'waiting', label: 'Collab idle' }),
    )
    expect(summarizeLocalCollabProviderStatuses([{ id: 'local-sqlite', ok: true, lastPublishedAt: 20 }])).toEqual(
      expect.objectContaining({ state: 'ready', label: 'Local saved', activeProviders: 1 }),
    )
    expect(
      summarizeLocalCollabProviderStatuses([
        { id: 'local-sqlite', ok: true, lastPublishedAt: 20 },
        { id: 'remote-http', ok: true, lastListedAt: 20, pendingMirrorCount: 2 },
      ]),
    ).toEqual(
      expect.objectContaining({
        state: 'waiting',
        label: 'Collab catching up',
        detail: expect.stringContaining('2 events still mirroring'),
        activeProviders: 2,
      }),
    )
    expect(
      summarizeLocalCollabProviderStatuses([
        { id: 'local-sqlite', ok: true, lastPublishedAt: 20 },
        { id: 'remote-http', ok: true },
      ]),
    ).toEqual(
      expect.objectContaining({
        state: 'waiting',
        label: 'Collab pending',
        detail: expect.stringContaining('waiting on remote-http'),
        activeProviders: 1,
      }),
    )
  })

  it('loads the newest CRDT state from layered providers and saves to every capable provider', async () => {
    const oldState = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('Old'),
      checksum: collaborationChecksum('Old'),
      sequence: 1,
      updatedAt: 10,
    }
    const newState = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('New'),
      checksum: collaborationChecksum('New'),
      sequence: 2,
      updatedAt: 20,
    }
    const localSave = vi.fn(async () => {})
    const remoteSave = vi.fn(async () => {})
    const transport = createLayeredLocalCollabTransport([
      {
        id: 'local-sqlite',
        transport: {
          publish: vi.fn(async () => {}),
          list: vi.fn(async () => []),
          getCrdtState: vi.fn(async () => oldState),
          saveCrdtState: localSave,
        },
      },
      {
        id: 'remote-peer',
        transport: {
          publish: vi.fn(async () => {}),
          list: vi.fn(async () => []),
          getCrdtState: vi.fn(async () => newState),
          saveCrdtState: remoteSave,
        },
      },
    ])

    expect(transport.getCrdtState).toBeDefined()
    expect(transport.saveCrdtState).toBeDefined()
    await expect(transport.getCrdtState?.('Projects/Roadmap.md')).resolves.toEqual(newState)
    await transport.saveCrdtState?.(newState)

    expect(localSave).toHaveBeenCalledWith(newState)
    expect(remoteSave).toHaveBeenCalledWith(newState)
  })

  it('backfills stale CRDT snapshots to providers during state load', async () => {
    const oldState = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('Old'),
      checksum: collaborationChecksum('Old'),
      sequence: 1,
      updatedAt: 10,
    }
    const newState = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('New'),
      checksum: collaborationChecksum('New'),
      sequence: 4,
      updatedAt: 40,
    }
    const localSave = vi.fn(async () => {})
    const remoteSave = vi.fn(async () => {})
    const transport = createLayeredLocalCollabTransport([
      {
        id: 'local-sqlite',
        transport: {
          publish: vi.fn(async () => {}),
          list: vi.fn(async () => []),
          getCrdtState: vi.fn(async () => oldState),
          saveCrdtState: localSave,
        },
      },
      {
        id: 'remote-peer',
        transport: {
          publish: vi.fn(async () => {}),
          list: vi.fn(async () => []),
          getCrdtState: vi.fn(async () => newState),
          saveCrdtState: remoteSave,
        },
      },
    ])

    await expect(transport.getCrdtState?.('Projects/Roadmap.md')).resolves.toEqual(newState)

    expect(localSave).toHaveBeenCalledWith(newState)
    expect(remoteSave).not.toHaveBeenCalled()
  })

  it('prefers higher CRDT sequence over newer provider wall-clock timestamps', async () => {
    const lowSequenceFreshClock = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('Low'),
      checksum: collaborationChecksum('Low'),
      sequence: 2,
      updatedAt: 100,
    }
    const highSequenceOlderClock = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('High'),
      checksum: collaborationChecksum('High'),
      sequence: 5,
      updatedAt: 20,
    }
    const localSave = vi.fn(async () => {})
    const remoteSave = vi.fn(async () => {})
    const transport = createLayeredLocalCollabTransport([
      {
        id: 'local-sqlite',
        transport: {
          publish: vi.fn(async () => {}),
          list: vi.fn(async () => []),
          getCrdtState: vi.fn(async () => lowSequenceFreshClock),
          saveCrdtState: localSave,
        },
      },
      {
        id: 'remote-peer',
        transport: {
          publish: vi.fn(async () => {}),
          list: vi.fn(async () => []),
          getCrdtState: vi.fn(async () => highSequenceOlderClock),
          saveCrdtState: remoteSave,
        },
      },
    ])

    await expect(transport.getCrdtState?.('Projects/Roadmap.md')).resolves.toEqual(highSequenceOlderClock)

    expect(localSave).toHaveBeenCalledWith(highSequenceOlderClock)
    expect(remoteSave).not.toHaveBeenCalled()
  })

  it('publishes monotonic client sequences and learns remote sequence clocks', async () => {
    const remotePeer: LocalCollabPeer = { id: 'peer-remote', name: 'Ada', seenAt: Date.now() }
    const remote = {
      ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', remotePeer),
      eventId: 'evt-remote-clock',
      clientId: 'peer-remote',
      sequence: 41,
    } satisfies LocalCollabMessage
    const published: LocalCollabMessage[] = []
    const savedStates: Array<{ documentId: string; checksum: string; sequence: number }> = []
    const transport = {
      publish: vi.fn(async (message: LocalCollabMessage) => {
        published.push(message)
      }),
      list: vi.fn(async () => [remote]),
      saveCrdtState: vi.fn(async (state: { documentId: string; checksum: string; sequence: number }) => {
        savedStates.push(state)
      }),
    }

    const { result } = renderHook(() => useLocalNoteCollaboration('Projects/Roadmap.md', 'Local', transport))

    await waitFor(() => expect(result.current.peers.some(peer => peer.id === 'peer-remote')).toBe(true))

    act(() => result.current.broadcastOperation('Alpha beta', 'Alpha'))

    await waitFor(() => expect(published.some(message => message.type === 'operation')).toBe(true))
    const operation = published.find(message => message.type === 'operation')

    expect(operation).toEqual(
      expect.objectContaining({
        clientId: expect.any(String),
        sequence: 42,
        type: 'operation',
      }),
    )
    expect(operation?.crdtOperations?.length).toBeGreaterThan(0)
    expect(operation?.richOperations?.length).toBeGreaterThan(0)
    expect(operation?.clientId).not.toHaveLength(0)
    expect(savedStates).toEqual([
      expect.objectContaining({
        documentId: 'Projects/Roadmap.md',
        checksum: collaborationChecksum('Alpha beta'),
        sequence: 42,
      }),
    ])
  })

  it('manually syncs collaboration transport for the active document', async () => {
    const remotePeer: LocalCollabPeer = { id: 'peer-remote', name: 'Ada', seenAt: Date.now() }
    const snapshot = {
      documentId: 'Projects/Roadmap.md',
      characters: localCrdtDocumentFromText('Synced'),
      checksum: collaborationChecksum('Synced'),
      sequence: 19,
      updatedAt: Date.now(),
    }
    const remote = {
      ...buildLocalCollabMessage('presence', 'Projects/Roadmap.md', remotePeer),
      eventId: 'evt-manual-sync',
      clientId: 'peer-remote',
      sequence: 7,
      updatedAt: Date.now(),
    } satisfies LocalCollabMessage
    let listCount = 0
    const published: LocalCollabMessage[] = []
    const transport = {
      publish: vi.fn(async (message: LocalCollabMessage) => {
        published.push(message)
      }),
      list: vi.fn(async () => {
        listCount += 1
        return listCount === 1 ? [] : [remote]
      }),
      getCrdtState: vi.fn(async () => snapshot),
    }

    const { result } = renderHook(() => useLocalNoteCollaboration('Projects/Roadmap.md', 'Local', transport))

    await waitFor(() => expect(transport.list).toHaveBeenCalledTimes(1))
    await act(async () => {
      await result.current.syncNow()
    })

    await waitFor(() => expect(result.current.peers.some(peer => peer.id === 'peer-remote')).toBe(true))
    expect(result.current.lastSyncError).toBe(null)
    expect(result.current.lastSyncedAt).toEqual(expect.any(Number))
    expect(result.current.syncing).toBe(false)
    expect(transport.getCrdtState.mock.calls.length).toBeGreaterThanOrEqual(2)

    act(() => result.current.broadcastOperation('Synced plus', 'Synced'))

    await waitFor(() => expect(published.some(message => message.type === 'operation')).toBe(true))
    expect(published.find(message => message.type === 'operation')).toEqual(
      expect.objectContaining({ sequence: 20, content: 'Synced plus' }),
    )
  })

  it('surfaces automatic collaboration transport success and failure state', async () => {
    const successTransport = {
      publish: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
    }

    const { result, unmount } = renderHook(() =>
      useLocalNoteCollaboration('Projects/Roadmap.md', 'Local', successTransport),
    )

    await waitFor(() => expect(result.current.lastSyncedAt).toEqual(expect.any(Number)))
    expect(result.current.lastSyncError).toBe(null)
    unmount()

    const failingTransport = {
      publish: vi.fn(async () => undefined),
      list: vi.fn(async () => {
        throw new Error('remote offline')
      }),
    }
    const failure = renderHook(() => useLocalNoteCollaboration('Projects/Roadmap.md', 'Local', failingTransport))

    await waitFor(() => expect(failure.result.current.lastSyncError).toBe('remote offline'))
    expect(failure.result.current.syncing).toBe(false)
    failure.unmount()
  })

  it('publishes cursor awareness messages for editor selections', async () => {
    const published: LocalCollabMessage[] = []
    const transport = {
      publish: vi.fn(async (message: LocalCollabMessage) => {
        published.push(message)
      }),
      list: vi.fn(async () => []),
    }

    const { result } = renderHook(() => useLocalNoteCollaboration('Projects/Roadmap.md', 'Local', transport))

    act(() => result.current.broadcastCursor(7, 11))

    await waitFor(() => expect(published.some(message => message.type === 'cursor')).toBe(true))
    expect(published.find(message => message.type === 'cursor')).toEqual(
      expect.objectContaining({
        clientId: expect.any(String),
        sequence: expect.any(Number),
        cursor: expect.objectContaining({ anchor: 7, head: 11 }),
      }),
    )
  })
})
