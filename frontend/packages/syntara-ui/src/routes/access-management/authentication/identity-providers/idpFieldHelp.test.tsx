import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { idpHelp } from './idpFieldHelp'
import {
  EMAIL_CLAIM_HELP,
  GROUP_EXTRACTION_EXPRESSION_HELP,
  GROUP_HELP,
  IDP_GROUP_VALUE_HELP,
  PROVIDER_TEMPLATE_HELP,
  SUBJECT_CLAIM_HELP,
} from './idpFieldHelpText'

describe('idpHelp', () => {
  it('exposes prebuilt help elements for each identity provider form field', async () => {
    const user = userEvent.setup()
    render(
      <>
        {idpHelp.providerTemplate}
        {idpHelp.subjectClaim}
        {idpHelp.emailClaim}
        {idpHelp.groupExtractionExpression}
        {idpHelp.idpGroupValue}
        {idpHelp.group}
      </>
    )

    await user.click(screen.getByRole('button', { name: 'More info for Provider template' }))
    expect(screen.getByText(PROVIDER_TEMPLATE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Subject claim' }))
    expect(screen.getByText(SUBJECT_CLAIM_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Email claim' }))
    expect(screen.getByText(EMAIL_CLAIM_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Group extraction expression' }))
    expect(screen.getByText(GROUP_EXTRACTION_EXPRESSION_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for IdP group value' }))
    expect(screen.getByText(IDP_GROUP_VALUE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Group' }))
    expect(screen.getByText(GROUP_HELP)).toBeInTheDocument()
  })
})
