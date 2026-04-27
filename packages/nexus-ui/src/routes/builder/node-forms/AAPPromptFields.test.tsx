import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import type { AAPFormData } from './aapFormSchema'
import { DiffModeField, NumberInputField, RunTypeField, TextInputField, VerbosityField } from './AAPPromptFields'

function TestWrapper({ children, defaultValues }: { children: React.ReactNode; defaultValues?: Partial<AAPFormData> }) {
  const methods = useForm<AAPFormData>({
    defaultValues,
  })
  return <FormProvider {...methods}>{children}</FormProvider>
}

describe('AAPPromptFields', () => {
  describe('RunTypeField', () => {
    it('renders run type select', () => {
      render(
        <TestWrapper>
          <RunTypeField />
        </TestWrapper>
      )

      expect(screen.getByLabelText('Run type')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Run' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Check (Dry Run)' })).toBeInTheDocument()
    })

    it('selects run option', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <RunTypeField />
        </TestWrapper>
      )

      const select = screen.getByLabelText('Run type')
      await user.selectOptions(select, 'run')

      expect(select).toHaveValue('run')
    })

    it('selects check option', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <RunTypeField />
        </TestWrapper>
      )

      const select = screen.getByLabelText('Run type')
      await user.selectOptions(select, 'check')

      expect(select).toHaveValue('check')
    })

    it('displays placeholder option', () => {
      render(
        <TestWrapper>
          <RunTypeField />
        </TestWrapper>
      )

      expect(screen.getByRole('option', { name: '[ run type ]' })).toBeInTheDocument()
    })
  })

  describe('VerbosityField', () => {
    it('renders verbosity select with all options', () => {
      render(
        <TestWrapper>
          <VerbosityField />
        </TestWrapper>
      )

      expect(screen.getByLabelText('Verbosity')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '0 - Normal' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '1 - Verbose' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '2 - More Verbose' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '3 - Debug' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '4 - Connection Debug' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '5 - WinRM Debug' })).toBeInTheDocument()
    })

    it('selects verbosity level', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <VerbosityField />
        </TestWrapper>
      )

      const select = screen.getByLabelText('Verbosity')
      await user.selectOptions(select, '3')

      expect(select).toHaveValue('3')
    })

    it('displays placeholder option', () => {
      render(
        <TestWrapper>
          <VerbosityField />
        </TestWrapper>
      )

      expect(screen.getByRole('option', { name: '[ verbosity ]' })).toBeInTheDocument()
    })
  })

  describe('DiffModeField', () => {
    it('renders diff mode switch', () => {
      render(
        <TestWrapper>
          <DiffModeField />
        </TestWrapper>
      )

      expect(screen.getByRole('switch', { name: 'Show changes' })).toBeInTheDocument()
    })

    it('toggles diff mode', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper defaultValues={{ diff_mode: false }}>
          <DiffModeField />
        </TestWrapper>
      )

      const switchControl = screen.getByRole('switch', { name: 'Show changes' })
      expect(switchControl).not.toBeChecked()

      await user.click(switchControl)

      expect(switchControl).toBeChecked()
    })

    it('renders with checked state when diff_mode is true', () => {
      render(
        <TestWrapper defaultValues={{ diff_mode: true }}>
          <DiffModeField />
        </TestWrapper>
      )

      const switchControl = screen.getByRole('switch', { name: 'Show changes' })
      expect(switchControl).toBeChecked()
    })

    it('defaults to unchecked when diff_mode is undefined', () => {
      render(
        <TestWrapper>
          <DiffModeField />
        </TestWrapper>
      )

      const switchControl = screen.getByRole('switch', { name: 'Show changes' })
      expect(switchControl).not.toBeChecked()
    })
  })

  describe('TextInputField', () => {
    it('renders text input', () => {
      render(
        <TestWrapper>
          <TextInputField label="Limit" fieldId="test-limit" name="limit" />
        </TestWrapper>
      )

      expect(screen.getByLabelText('Limit')).toBeInTheDocument()
    })

    it('accepts text input', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <TextInputField label="Limit" fieldId="test-limit" name="limit" />
        </TestWrapper>
      )

      const input = screen.getByLabelText('Limit')
      await user.type(input, 'test-value')

      expect(input).toHaveValue('test-value')
    })

    it('renders with initial value', () => {
      render(
        <TestWrapper defaultValues={{ limit: 'initial-limit' }}>
          <TextInputField label="Limit" fieldId="test-limit" name="limit" />
        </TestWrapper>
      )

      expect(screen.getByLabelText('Limit')).toHaveValue('initial-limit')
    })

    it('renders with empty value', () => {
      render(
        <TestWrapper>
          <TextInputField label="Limit" fieldId="test-limit" name="limit" />
        </TestWrapper>
      )

      expect(screen.getByLabelText('Limit')).toHaveValue('')
    })
  })

  describe('NumberInputField', () => {
    it('renders number input', () => {
      render(
        <TestWrapper>
          <NumberInputField label="Forks" fieldId="test-forks" name="forks" placeholder="0" min={0} />
        </TestWrapper>
      )

      expect(screen.getByLabelText('Forks')).toBeInTheDocument()
    })

    it('accepts number input', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <NumberInputField label="Forks" fieldId="test-forks" name="forks" placeholder="0" min={0} />
        </TestWrapper>
      )

      const input = screen.getByLabelText('Forks')
      await user.clear(input)
      await user.type(input, '5')

      expect(input).toHaveValue(5)
    })

    it('renders with min attribute', () => {
      render(
        <TestWrapper>
          <NumberInputField label="Forks" fieldId="test-forks" name="forks" placeholder="0" min={0} />
        </TestWrapper>
      )

      const input = screen.getByLabelText('Forks')
      expect(input).toHaveAttribute('min', '0')
    })

    it('renders with placeholder', () => {
      render(
        <TestWrapper>
          <NumberInputField label="Forks" fieldId="test-forks" name="forks" placeholder="Enter forks" min={0} />
        </TestWrapper>
      )

      expect(screen.getByPlaceholderText('Enter forks')).toBeInTheDocument()
    })

    it('handles undefined value', () => {
      render(
        <TestWrapper>
          <NumberInputField label="Timeout" fieldId="test-timeout" name="timeout" placeholder="0" min={0} />
        </TestWrapper>
      )

      const input = screen.getByLabelText('Timeout')
      expect(input).toHaveValue(null)
    })
  })
})
