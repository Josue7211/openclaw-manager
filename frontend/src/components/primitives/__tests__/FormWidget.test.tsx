import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FormWidget from '../FormWidget'

const baseProps = {
  widgetId: 'test-form',
  isEditMode: false,
  size: { w: 3, h: 4 },
}

describe('FormWidget', () => {
  it('renders text input for text field type', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          fields: [{ key: 'name', label: 'Name', type: 'text' }],
        }}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveAttribute('type', 'text')
  })

  it('renders number input for number field type', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          fields: [{ key: 'age', label: 'Age', type: 'number' }],
        }}
      />,
    )
    expect(screen.getByLabelText('Age')).toHaveAttribute('type', 'number')
  })

  it('renders select dropdown for select field type', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          fields: [
            {
              key: 'color',
              label: 'Color',
              type: 'select',
              options: [
                { label: 'Red', value: 'red' },
                { label: 'Blue', value: 'blue' },
              ],
            },
          ],
        }}
      />,
    )
    const select = screen.getByLabelText('Color')
    expect(select.tagName).toBe('SELECT')
    expect(screen.getByText('Red')).toBeTruthy()
    expect(screen.getByText('Blue')).toBeTruthy()
  })

  it('renders toggle switch for toggle field type', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          fields: [{ key: 'active', label: 'Active', type: 'toggle' }],
        }}
      />,
    )
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('shows EmptyState when fields is empty', () => {
    render(<FormWidget {...baseProps} config={{ fields: [] }} />)
    expect(screen.getByText('No fields')).toBeTruthy()
  })

  it('shows EmptyState when fields is missing', () => {
    render(<FormWidget {...baseProps} config={{}} />)
    expect(screen.getByText('No fields')).toBeTruthy()
  })

  it('submit button shows custom label from config', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          submitLabel: 'Save',
          fields: [{ key: 'x', label: 'X', type: 'text' }],
        }}
      />,
    )
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('required field shows validation error on submit when empty', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
        }}
      />,
    )
    const input = screen.getByLabelText('Name')
    fireEvent.click(screen.getByText('Submit'))
    // Required field with error should have red border
    expect(input.style.borderColor).toBe('var(--red)')
  })

  it('renders date input for date field type', () => {
    render(
      <FormWidget
        {...baseProps}
        config={{
          fields: [{ key: 'dob', label: 'Birthday', type: 'date' }],
        }}
      />,
    )
    expect(screen.getByLabelText('Birthday')).toHaveAttribute('type', 'date')
  })
})
