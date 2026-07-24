import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FieldHelpPopover } from '../../../components/FieldHelpPopover'

import { resolveFormGroupLabelHelp } from './resolveFormGroupLabelHelp'

describe('resolveFormGroupLabelHelp', () => {
  it('returns the explicit labelHelp element when provided', () => {
    const labelHelp = <FieldHelpPopover headerContent="Credential" helpText="Explicit help" />
    const resolved = resolveFormGroupLabelHelp('Credential', labelHelp, 'Unused help text')

    render(<>{resolved}</>)
    expect(screen.getByRole('button', { name: 'More info for Credential' })).toBeInTheDocument()
  })

  it('builds a FieldHelpPopover from helpText when labelHelp is omitted', () => {
    const resolved = resolveFormGroupLabelHelp('Model', undefined, 'Help from text')

    render(<>{resolved}</>)
    expect(screen.getByRole('button', { name: 'More info for Model' })).toBeInTheDocument()
  })

  it('returns undefined when neither labelHelp nor helpText is provided', () => {
    expect(resolveFormGroupLabelHelp('Credential')).toBeUndefined()
  })
})
