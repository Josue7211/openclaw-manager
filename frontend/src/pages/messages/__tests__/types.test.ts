import { describe, it, expect } from 'vitest'
import type {
  Participant,
  Conversation,
  Reaction,
  Attachment,
  Message,
  ServiceFilter,
  ConvContextMenu,
} from '../types'

describe('types.ts exports', () => {
  it('Conversation type is structurally valid', () => {
    const conv: Conversation = {
      guid: 'imessage;-;+1234',
      chatId: '+1234',
      displayName: null,
      participants: [{ address: '+1234', service: 'iMessage' }],
      service: 'iMessage',
      lastMessage: 'hi',
      lastDate: Date.now(),
      lastFromMe: 0,
    }
    expect(conv.guid).toBeTruthy()
    expect(conv.participants.length).toBe(1)
  })

  it('Message type is structurally valid', () => {
    const msg: Message = {
      guid: 'msg-1',
      text: 'hello',
      dateCreated: Date.now(),
      isFromMe: false,
    }
    expect(msg.guid).toBeTruthy()
    expect(msg.isFromMe).toBe(false)
  })

  it('Reaction type is structurally valid', () => {
    const reaction: Reaction = { type: 2000, fromMe: true }
    expect(reaction.type).toBe(2000)
  })

  it('Attachment type is structurally valid', () => {
    const att: Attachment = {
      guid: 'att-1',
      mimeType: 'image/png',
      transferName: 'photo.png',
    }
    expect(att.mimeType).toBe('image/png')
  })

  it('ServiceFilter accepts valid values', () => {
    const filters: ServiceFilter[] = ['all', 'iMessage', 'SMS']
    expect(filters).toHaveLength(3)
  })

  it('ConvContextMenu type is structurally valid', () => {
    const menu: ConvContextMenu = {
      x: 100,
      y: 200,
      convGuid: 'abc',
      isUnread: true,
      isMuted: false,
      isPinned: false,
    }
    expect(menu.x).toBe(100)
  })

  it('Participant type is structurally valid', () => {
    const p: Participant = { address: '+1234', service: 'iMessage' }
    expect(p.address).toBe('+1234')
  })

  it('Message optional fields default to undefined', () => {
    const msg: Message = {
      guid: 'msg-2',
      text: '',
      dateCreated: 0,
      isFromMe: true,
    }
    expect(msg.attachments).toBeUndefined()
    expect(msg.reactions).toBeUndefined()
    expect(msg.handle).toBeUndefined()
    expect(msg._failed).toBeUndefined()
  })
})
