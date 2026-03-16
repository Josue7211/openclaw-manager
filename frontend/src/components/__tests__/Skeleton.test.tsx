import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  PersonalSkeleton,
  DashboardSkeleton,
  MessagesSkeleton,
  SettingsSkeleton,
  GenericPageSkeleton,
  Skeleton,
  SkeletonRows,
  SkeletonCard,
  SkeletonList,
  MessagesConversationSkeleton,
  MessagesThreadSkeleton,
} from '../Skeleton'

describe('Skeleton primitives', () => {
  it('Skeleton renders a div with shimmer animation', () => {
    const { container } = render(<Skeleton width={100} height={20} />)
    const el = container.firstChild as HTMLElement
    expect(el).toBeTruthy()
    expect(el.tagName).toBe('DIV')
    expect(el.style.animation).toContain('shimmer')
  })

  it('SkeletonRows renders the specified number of rows', () => {
    const { container } = render(<SkeletonRows count={4} />)
    const rows = container.firstChild!.childNodes
    expect(rows.length).toBe(4)
  })

  it('SkeletonCard renders without crashing', () => {
    const { container } = render(<SkeletonCard lines={3} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('SkeletonList renders the specified number of cards', () => {
    const { container } = render(<SkeletonList count={5} lines={2} />)
    const cards = container.firstChild!.childNodes
    expect(cards.length).toBe(5)
  })

  it('MessagesConversationSkeleton renders 8 conversation items', () => {
    const { container } = render(<MessagesConversationSkeleton />)
    const items = container.firstChild!.childNodes
    expect(items.length).toBe(8)
  })

  it('MessagesThreadSkeleton renders 6 message bubbles', () => {
    const { container } = render(<MessagesThreadSkeleton />)
    const bubbles = container.firstChild!.childNodes
    expect(bubbles.length).toBe(6)
  })
})

describe('Page-specific skeletons', () => {
  it('PersonalSkeleton renders without crashing', () => {
    const { container } = render(<PersonalSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('DashboardSkeleton renders without crashing', () => {
    const { container } = render(<DashboardSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('MessagesSkeleton renders without crashing', () => {
    const { container } = render(<MessagesSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('SettingsSkeleton renders without crashing', () => {
    const { container } = render(<SettingsSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('GenericPageSkeleton renders without crashing', () => {
    const { container } = render(<GenericPageSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('PersonalSkeleton contains greeting card section with 3 summary columns', () => {
    const { container } = render(<PersonalSkeleton />)
    // The grid with 3 columns is a div with gridTemplateColumns 'repeat(3, 1fr)'
    const grids = container.querySelectorAll('div')
    const summaryGrid = Array.from(grids).find(
      (el) => el.style.gridTemplateColumns === 'repeat(3, 1fr)',
    )
    expect(summaryGrid).toBeTruthy()
    expect(summaryGrid!.childNodes.length).toBe(3)
  })

  it('DashboardSkeleton contains 6 skeleton cards in a grid', () => {
    const { container } = render(<DashboardSkeleton />)
    const grids = container.querySelectorAll('div')
    const cardGrid = Array.from(grids).find(
      (el) => el.style.gridTemplateColumns?.includes('minmax(340px'),
    )
    expect(cardGrid).toBeTruthy()
    expect(cardGrid!.childNodes.length).toBe(6)
  })

  it('MessagesSkeleton uses full-bleed layout with absolute positioning', () => {
    const { container } = render(<MessagesSkeleton />)
    const root = container.firstChild as HTMLElement
    expect(root.style.position).toBe('absolute')
    expect(root.style.inset).toBe('0px')
  })

  it('SettingsSkeleton uses full-bleed layout with absolute positioning', () => {
    const { container } = render(<SettingsSkeleton />)
    const root = container.firstChild as HTMLElement
    expect(root.style.position).toBe('absolute')
    expect(root.style.inset).toBe('0px')
  })
})
