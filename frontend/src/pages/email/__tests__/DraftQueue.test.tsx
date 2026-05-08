import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DraftQueue } from '../DraftQueue'

describe('DraftQueue', () => {
  it('shows account-aware draft review state', () => {
    render(
      <DraftQueue
        drafts={[{
          id: 'draft_1',
          account_label: 'Aparcedo',
          subject: 'Re: Quarterly update',
          body: 'Thanks - I will send the numbers tomorrow.',
          handoff_status: 'needs_human_send',
        }]}
      />,
    )

    expect(screen.getByText('Aparcedo')).toBeInTheDocument()
    expect(screen.getByText('needs human send')).toBeInTheDocument()
  })
})
