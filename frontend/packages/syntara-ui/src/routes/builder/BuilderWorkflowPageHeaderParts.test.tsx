import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderVersionViewTitleRowAddons } from './BuilderWorkflowPageHeaderParts'
import { builderVersionViewHasTitleRowExtras } from './builderWorkflowPageHeaderTitle'

describe('builderVersionViewHasTitleRowExtras', () => {
  it('returns true when viewedVersionDate is set', () => {
    expect(builderVersionViewHasTitleRowExtras('2026-05-19T14:30:00.000Z', null)).toBe(true)
  })

  it('returns true when viewedVersionStatus is a valid status', () => {
    expect(builderVersionViewHasTitleRowExtras(null, 'published')).toBe(true)
  })

  it('returns false when both are null', () => {
    expect(builderVersionViewHasTitleRowExtras(null, null)).toBe(false)
  })

  it('returns false when viewedVersionStatus is invalid', () => {
    expect(builderVersionViewHasTitleRowExtras(null, 'invalid')).toBe(false)
  })
})

describe('BuilderVersionViewTitleRowAddons', () => {
  it('renders no addon labels when date and status are missing', () => {
    render(<BuilderVersionViewTitleRowAddons viewedVersionDate={null} viewedVersionStatus={null} />)
    expect(screen.queryByText(/Viewing/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
  })

  it('renders Viewing date label when viewedVersionDate is provided', () => {
    render(<BuilderVersionViewTitleRowAddons viewedVersionDate="2026-05-19T14:30:00.000Z" viewedVersionStatus={null} />)
    expect(screen.getByText(/Viewing/)).toBeInTheDocument()
    expect(screen.getByText(/May 19, 2026/)).toBeInTheDocument()
  })

  it('renders version status badge when viewedVersionStatus is valid', () => {
    render(<BuilderVersionViewTitleRowAddons viewedVersionDate={null} viewedVersionStatus="published" />)
    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <BuilderVersionViewTitleRowAddons viewedVersionDate="2026-05-19T14:30:00.000Z" viewedVersionStatus="published" />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
