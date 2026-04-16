import type { SettingsAPI } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SettingsCategoryTab } from './SettingsCategoryTab'

type RuntimeSetting = SettingsAPI.components['schemas']['RuntimeSettingRead']

const makeSetting = (overrides: Partial<RuntimeSetting> = {}): RuntimeSetting => ({
  id: '1',
  key: 'context_manager.max_total_tokens',
  name: 'Max total tokens',
  description: 'Maximum total tokens',
  category: 'context_manager',
  group: 'Token limits',
  value: null,
  default_value: 4000,
  effective_value: 4000,
  value_type: 'integer',
  requires_restart: false,
  cache_ttl_seconds: null,
  validation_schema: null,
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const defaultProps = {
  edits: new Map<string, unknown>(),
  onChange: vi.fn(),
  onResetField: vi.fn(),
}

describe('SettingsCategoryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has no accessibility violations', async () => {
    const settings = [makeSetting()]
    const { container } = render(<SettingsCategoryTab settings={settings} {...defaultProps} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('reset to defaults button is disabled when all values are at defaults', () => {
    const settings = [
      makeSetting({ key: 'a', default_value: 100, effective_value: 100, value: null }),
      makeSetting({ key: 'b', default_value: 200, effective_value: 200, value: null }),
    ]
    render(<SettingsCategoryTab settings={settings} {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled()
  })

  it('reset to defaults button is enabled when a setting has a saved non-default value', () => {
    const settings = [
      makeSetting({ key: 'a', default_value: 100, effective_value: 500, value: 500 }),
      makeSetting({ key: 'b', default_value: 200, effective_value: 200, value: null }),
    ]
    render(<SettingsCategoryTab settings={settings} {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeEnabled()
  })

  it('reset to defaults button is enabled when there are local edits', () => {
    const settings = [makeSetting({ key: 'a', default_value: 100, effective_value: 100, value: null })]
    const edits = new Map<string, unknown>([['a', 999]])
    render(<SettingsCategoryTab settings={settings} {...defaultProps} edits={edits} />)

    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeEnabled()
  })

  it('reset all sets all values to defaults locally via onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const settings = [
      makeSetting({ key: 'a', default_value: 100, effective_value: 500, value: 500 }),
      makeSetting({ key: 'b', default_value: 200, effective_value: 300, value: 300 }),
    ]

    render(<SettingsCategoryTab settings={settings} {...defaultProps} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await user.click(screen.getByRole('button', { name: 'Reset all' }))

    expect(onChange).toHaveBeenCalledWith('a', 100)
    expect(onChange).toHaveBeenCalledWith('b', 200)
  })

  it('modal closes on cancel without resetting values', async () => {
    const user = userEvent.setup()
    const settings = [makeSetting({ key: 'a', default_value: 100, effective_value: 500, value: 500 })]
    render(<SettingsCategoryTab settings={settings} {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(screen.getByText(/will not take effect until you click Save/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/will not take effect until you click Save/)).not.toBeInTheDocument()
  })

  it('kebab reset calls onResetField', async () => {
    const user = userEvent.setup()
    const onResetField = vi.fn()
    const settings = [makeSetting({ key: 'a', default_value: 100, effective_value: 500, value: 500 })]
    render(<SettingsCategoryTab settings={settings} {...defaultProps} onResetField={onResetField} />)

    await user.click(screen.getByLabelText('Actions for Max total tokens'))
    await user.click(screen.getByRole('menuitem', { name: 'Reset to default' }))

    expect(onResetField).toHaveBeenCalledWith('a')
  })

  it('renders group sections', () => {
    const settings = [makeSetting({ key: 'a', group: 'Token limits' }), makeSetting({ key: 'b', group: 'Performance' })]
    render(<SettingsCategoryTab settings={settings} {...defaultProps} />)

    expect(screen.getByRole('group', { name: 'Token limits' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Performance' })).toBeInTheDocument()
  })

  it('calls onChange when a field value changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const settings = [makeSetting({ key: 'a', default_value: 100, effective_value: 100 })]
    render(<SettingsCategoryTab settings={settings} {...defaultProps} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /plus/i }))

    expect(onChange).toHaveBeenCalledWith('a', 101)
  })
})
