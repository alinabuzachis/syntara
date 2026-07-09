import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { VersionSidePanelState } from '../hooks/useBuilderVersionPanel'

import { VersionHistorySidePanel } from './VersionHistorySidePanel'

vi.mock('../VersionHistoryPanel', () => ({
  VersionHistoryPanel: () => <div data-testid="version-history-panel" />,
}))

vi.mock('../PublishWorkflowDialog', () => ({
  PublishWorkflowDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="publish-dialog">Publish Dialog</div> : null,
}))

vi.mock('../SaveBeforeViewDialog', () => ({
  SaveBeforeViewDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="save-before-view-dialog">Save Before View</div> : null,
}))

function createSidePanelState(overrides: Partial<VersionSidePanelState> = {}): VersionSidePanelState {
  return {
    show: true,
    filteredVersions: [],
    selectedVersion: null,
    statusFilter: [],
    onStatusFilterChange: vi.fn(),
    onClose: vi.fn(),
    onSelectVersion: vi.fn(),
    onRestoreVersion: vi.fn(),
    onExportVersion: vi.fn(),
    onOpenInNewWindow: vi.fn(),
    onPublishVersion: vi.fn(),
    onViewRunHistory: vi.fn(),
    executedVersionNumbers: new Map(),
    onEditVersion: vi.fn(),
    onDuplicateVersion: vi.fn(),
    publishDialog: { isOpen: false, onClose: vi.fn(), onPublish: vi.fn() },
    saveBeforeViewDialog: {
      isOpen: false,
      onSave: vi.fn().mockResolvedValue(true),
      onViewWithoutSaving: vi.fn(),
      onCancel: vi.fn(),
    },
    restoreDialog: {
      isOpen: false,
      title: '',
      isLoading: false,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
    },
    editDialog: {
      isOpen: false,
      isSaving: false,
      onClose: vi.fn(),
      onSave: vi.fn(),
      initialPublishName: null,
      initialDescription: null,
    },
    ...overrides,
  }
}

describe('VersionHistorySidePanel', () => {
  it('renders VersionHistoryPanel when show is true and node editor is closed', () => {
    render(<VersionHistorySidePanel sidePanel={createSidePanelState()} isNodeEditorOpen={false} />)

    expect(screen.getByTestId('version-history-panel')).toBeInTheDocument()
  })

  it('does not render VersionHistoryPanel when show is false', () => {
    render(<VersionHistorySidePanel sidePanel={createSidePanelState({ show: false })} isNodeEditorOpen={false} />)

    expect(screen.queryByTestId('version-history-panel')).not.toBeInTheDocument()
  })

  it('does not render VersionHistoryPanel when node editor is open', () => {
    render(<VersionHistorySidePanel sidePanel={createSidePanelState()} isNodeEditorOpen={true} />)

    expect(screen.queryByTestId('version-history-panel')).not.toBeInTheDocument()
  })

  it('renders PublishWorkflowDialog when publishDialog is open', () => {
    const sidePanel = createSidePanelState({
      publishDialog: { isOpen: true, onClose: vi.fn(), onPublish: vi.fn() },
    })
    render(<VersionHistorySidePanel sidePanel={sidePanel} isNodeEditorOpen={false} />)

    expect(screen.getByTestId('publish-dialog')).toBeInTheDocument()
  })

  it('renders SaveBeforeViewDialog when saveBeforeViewDialog is open', () => {
    const sidePanel = createSidePanelState({
      saveBeforeViewDialog: {
        isOpen: true,
        onSave: vi.fn().mockResolvedValue(true),
        onViewWithoutSaving: vi.fn(),
        onCancel: vi.fn(),
      },
    })
    render(<VersionHistorySidePanel sidePanel={sidePanel} isNodeEditorOpen={false} />)

    expect(screen.getByTestId('save-before-view-dialog')).toBeInTheDocument()
  })

  it('renders restore confirmation dialog when restoreDialog is open', () => {
    const sidePanel = createSidePanelState({
      restoreDialog: {
        isOpen: true,
        title: 'Restore version from May 19, 2026?',
        isLoading: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
      },
    })
    render(<VersionHistorySidePanel sidePanel={sidePanel} isNodeEditorOpen={false} />)

    expect(screen.getByText('Restore version from May 19, 2026?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('calls onConfirm when Restore button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const sidePanel = createSidePanelState({
      restoreDialog: {
        isOpen: true,
        title: 'Restore version?',
        isLoading: false,
        onClose: vi.fn(),
        onConfirm,
      },
    })
    render(<VersionHistorySidePanel sidePanel={sidePanel} isNodeEditorOpen={false} />)

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders EditVersionDialog when editDialog is open', () => {
    const sidePanel = createSidePanelState({
      editDialog: {
        isOpen: true,
        isSaving: false,
        onClose: vi.fn(),
        onSave: vi.fn(),
        initialPublishName: 'Release 1.0',
        initialDescription: 'First release',
      },
    })
    render(<VersionHistorySidePanel sidePanel={sidePanel} isNodeEditorOpen={false} />)

    expect(screen.getByText('Edit version name and description')).toBeInTheDocument()
  })

  it('does not render EditVersionDialog when editDialog is closed', () => {
    render(<VersionHistorySidePanel sidePanel={createSidePanelState()} isNodeEditorOpen={false} />)

    expect(screen.queryByText('Edit version name and description')).not.toBeInTheDocument()
  })

  describe('accessibility', () => {
    it('has no violations with restore dialog open', async () => {
      const sidePanel = createSidePanelState({
        restoreDialog: {
          isOpen: true,
          title: 'Restore version?',
          isLoading: false,
          onClose: vi.fn(),
          onConfirm: vi.fn(),
        },
      })
      const { container } = render(<VersionHistorySidePanel sidePanel={sidePanel} isNodeEditorOpen={false} />)
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
