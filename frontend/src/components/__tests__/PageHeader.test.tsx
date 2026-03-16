import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/test-page' }),
}))

// Mock sidebar-config
const mockConfig = {
  categories: [],
  customNames: {} as Record<string, string>,
  customModules: [],
}

vi.mock('@/lib/sidebar-config', () => ({
  getSidebarConfig: () => mockConfig,
  setSidebarConfig: vi.fn((config) => {
    Object.assign(mockConfig, config)
  }),
  subscribeSidebarConfig: vi.fn(() => () => {}),
  renameItem: vi.fn(),
}))

import { PageHeader } from '../PageHeader'

describe('PageHeader', () => {
  beforeEach(() => {
    mockConfig.customNames = {}
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the default title as an h1', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Dashboard',
      )
    })

    it('renders the default subtitle', () => {
      render(
        <PageHeader defaultTitle="Dashboard" defaultSubtitle="Overview" />,
      )
      expect(screen.getByText('Overview')).toBeInTheDocument()
    })

    it('renders non-breaking space when no subtitle is given', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      // The subtitle paragraph exists with \u00A0 content
      const paragraphs = screen.getAllByTitle('Double-click to edit')
      expect(paragraphs.length).toBe(1)
    })

    it('uses custom name from sidebar config when available', () => {
      mockConfig.customNames['/test-page'] = 'My Custom Title'
      render(<PageHeader defaultTitle="Dashboard" />)
      expect(
        screen.getByRole('heading', { level: 1 }),
      ).toHaveTextContent('My Custom Title')
    })

    it('title has a "Double-click to rename" tooltip', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      expect(screen.getByTitle('Double-click to rename')).toBeInTheDocument()
    })
  })

  describe('title editing', () => {
    it('shows an input when title is double-clicked', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      fireEvent.doubleClick(screen.getByTitle('Double-click to rename'))
      expect(screen.getByLabelText('Edit page title')).toBeInTheDocument()
    })

    it('input has the current title as default value', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      fireEvent.doubleClick(screen.getByTitle('Double-click to rename'))
      const input = screen.getByLabelText('Edit page title') as HTMLInputElement
      expect(input.defaultValue).toBe('Dashboard')
    })

    it('exits edit mode on blur', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      fireEvent.doubleClick(screen.getByTitle('Double-click to rename'))
      const input = screen.getByLabelText('Edit page title')
      fireEvent.blur(input)
      expect(screen.queryByLabelText('Edit page title')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    it('exits edit mode on Escape', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      fireEvent.doubleClick(screen.getByTitle('Double-click to rename'))
      const input = screen.getByLabelText('Edit page title')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByLabelText('Edit page title')).not.toBeInTheDocument()
    })

    it('exits edit mode on Enter', () => {
      render(<PageHeader defaultTitle="Dashboard" />)
      fireEvent.doubleClick(screen.getByTitle('Double-click to rename'))
      const input = screen.getByLabelText('Edit page title')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(screen.queryByLabelText('Edit page title')).not.toBeInTheDocument()
    })
  })

  describe('subtitle editing', () => {
    it('shows an input when subtitle is double-clicked', () => {
      render(
        <PageHeader defaultTitle="Dashboard" defaultSubtitle="Overview" />,
      )
      fireEvent.doubleClick(screen.getByTitle('Double-click to edit'))
      expect(screen.getByLabelText('Edit page subtitle')).toBeInTheDocument()
    })

    it('subtitle input has the current subtitle as default value', () => {
      render(
        <PageHeader defaultTitle="Dashboard" defaultSubtitle="Overview" />,
      )
      fireEvent.doubleClick(screen.getByTitle('Double-click to edit'))
      const input = screen.getByLabelText(
        'Edit page subtitle',
      ) as HTMLInputElement
      expect(input.defaultValue).toBe('Overview')
    })

    it('exits subtitle edit mode on Escape', () => {
      render(
        <PageHeader defaultTitle="Dashboard" defaultSubtitle="Overview" />,
      )
      fireEvent.doubleClick(screen.getByTitle('Double-click to edit'))
      const input = screen.getByLabelText('Edit page subtitle')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(
        screen.queryByLabelText('Edit page subtitle'),
      ).not.toBeInTheDocument()
    })
  })
})
