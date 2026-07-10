import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { EnableModelsWrapper } from './EnableModelsStep'

type DiscoverResult = IntegrationsAPI.components['schemas']['DiscoverResult']
type InitialModelSelection = IntegrationsAPI.components['schemas']['InitialModelSelection']

const mockModels = [
  { id: 'model-1', name: 'GPT-4o', description: 'Large language model' },
  { id: 'model-2', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' },
  { id: 'model-3', name: 'Claude Sonnet', description: 'Balanced model' },
]

function buildSuccessResult(models = mockModels): DiscoverResult {
  return { success: true, discovered_models: models } as DiscoverResult
}

function buildFailureResult(error = 'Connection refused'): DiscoverResult {
  return { success: false, error } as DiscoverResult
}

function buildSelectedModels(models: typeof mockModels, defaultId?: string): Map<string, InitialModelSelection> {
  const map = new Map<string, InitialModelSelection>()
  for (const m of models) {
    map.set(m.id, {
      model_id: m.id,
      name: m.name,
      description: m.description,
      enabled: true,
      is_default: m.id === defaultId,
    })
  }
  return map
}

type RenderOptions = {
  testResult?: DiscoverResult | null
  selectedModels?: Map<string, InitialModelSelection>
  isTestDisabled?: boolean
}

function renderStep(options: RenderOptions = {}) {
  const { testResult = null, selectedModels = new Map(), isTestDisabled = false } = options
  const onSelectionChange = vi.fn()
  const onTestConnection = vi.fn()
  const view = render(
    <EnableModelsWrapper
      testResult={testResult}
      selectedModels={selectedModels}
      onSelectionChange={onSelectionChange}
      onTestConnection={onTestConnection}
      isTestDisabled={isTestDisabled}
    />
  )
  return { ...view, onSelectionChange, onTestConnection }
}

describe('EnableModelsStep', () => {
  describe('empty state (no test result)', () => {
    it('renders empty state with test connection prompt when no test result', () => {
      renderStep()

      expect(screen.getByText('No models discovered yet')).toBeInTheDocument()
      expect(
        screen.getByText('Test the connection in the previous step to discover available models, or test it from here.')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    })

    it('test connection button calls onTestConnection', async () => {
      const user = userEvent.setup()
      const { onTestConnection } = renderStep()

      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      expect(onTestConnection).toHaveBeenCalled()
    })

    it('test connection button is disabled when isTestDisabled is true', () => {
      renderStep({ isTestDisabled: true })

      expect(screen.getByRole('button', { name: 'Test connection' })).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('error state (test failed)', () => {
    it('renders error message when test result has success: false', () => {
      renderStep({ testResult: buildFailureResult() })

      expect(screen.getByText('Connection test failed')).toBeInTheDocument()
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    })

    it('renders default error message when no error text provided', () => {
      renderStep({ testResult: { success: false } as DiscoverResult })

      expect(screen.getByText('Unable to connect to the integration.')).toBeInTheDocument()
    })

    it('renders retry button on failure', async () => {
      const user = userEvent.setup()
      const { onTestConnection } = renderStep({ testResult: buildFailureResult() })

      await user.click(screen.getByRole('button', { name: 'Retry connection' }))

      expect(onTestConnection).toHaveBeenCalled()
    })
  })

  describe('zero models discovered', () => {
    it('shows no models found message when success with empty models array', () => {
      renderStep({ testResult: buildSuccessResult([]) })

      expect(screen.getByText('No models found')).toBeInTheDocument()
      expect(
        screen.getByText('The connection was successful, but no models were found on this provider.')
      ).toBeInTheDocument()
    })
  })

  describe('model table rendering', () => {
    it('renders model table with discovered models', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      expect(screen.getByText('GPT-4o')).toBeInTheDocument()
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument()
    })

    it('renders model descriptions', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      expect(screen.getByText('Large language model')).toBeInTheDocument()
      expect(screen.getByText('Fast and efficient')).toBeInTheDocument()
    })

    it('shows Default badge on the default model', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels, 'model-1'),
      })

      expect(screen.getByText('Default')).toBeInTheDocument()
    })

    it('does not show Default badge on non-default models', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      expect(screen.queryByText('Default')).not.toBeInTheDocument()
    })

    it('renders wrapper title and description when models exist', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      expect(screen.getByRole('heading', { name: 'Enable models' })).toBeInTheDocument()
      expect(screen.getByText(/Select which models to enable/)).toBeInTheDocument()
    })

    it('does not render description text when no models', () => {
      renderStep({ testResult: buildSuccessResult([]) })

      expect(screen.queryByText(/Select which models to enable/)).not.toBeInTheDocument()
    })
  })

  function getModelCheckbox(modelName: string) {
    const rows = screen.getAllByRole('row')
    const row = rows.find((r) => r.textContent?.includes(modelName))
    if (!row) throw new Error(`No row found for model "${modelName}"`)
    return within(row).getByRole('checkbox')
  }

  describe('selection / enable-disable', () => {
    it('clicking a model checkbox toggles selection', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      await user.click(getModelCheckbox('Claude Sonnet'))

      expect(onSelectionChange).toHaveBeenCalled()
      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.has('model-3')).toBe(false)
    })

    it('clicking an unselected model adds it to selection', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: new Map(),
      })

      await user.click(getModelCheckbox('Claude Sonnet'))

      expect(onSelectionChange).toHaveBeenCalled()
      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.has('model-3')).toBe(true)
    })

    it('select-all checkbox enables all filtered models', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: new Map(),
      })

      const headerCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(headerCheckbox)

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.size).toBe(3)
    })

    it('deselect-all checkbox disables all filtered models', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      const headerCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(headerCheckbox)

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.size).toBe(0)
    })
  })

  describe('search filter', () => {
    it('filters models by name', async () => {
      const user = userEvent.setup()
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      const searchInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(searchInput, 'GPT{Enter}')

      expect(screen.getByText('GPT-4o')).toBeInTheDocument()
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.queryByText('Claude Sonnet')).not.toBeInTheDocument()
    })

    it('select-all only affects filtered models', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: new Map(),
      })

      const searchInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(searchInput, 'GPT{Enter}')

      const headerCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(headerCheckbox)

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.size).toBe(2)
      expect(newMap.has('model-1')).toBe(true)
      expect(newMap.has('model-2')).toBe(true)
      expect(newMap.has('model-3')).toBe(false)
    })
  })

  describe('default model via kebab', () => {
    it('kebab menu shows Set as default for enabled non-default models', async () => {
      const user = userEvent.setup()
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      const kebabButtons = screen.getAllByRole('button', { name: /Actions for/ })
      await user.click(kebabButtons[0])

      expect(screen.getByRole('menuitem', { name: /Set as default model/ })).toBeInTheDocument()
    })

    it('kebab menu shows Remove default for the current default model', async () => {
      const user = userEvent.setup()
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels, 'model-1'),
      })

      const kebabButtons = screen.getAllByRole('button', { name: /Actions for GPT-4o/ })
      await user.click(kebabButtons[0])

      expect(screen.getByRole('menuitem', { name: 'Remove default model' })).toBeInTheDocument()
    })

    it('clicking Set as default marks model as default and clears previous', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels, 'model-1'),
      })

      const kebabButtons = screen.getAllByRole('button', { name: /Actions for GPT-3.5 Turbo/ })
      await user.click(kebabButtons[0])
      await user.click(screen.getByRole('menuitem', { name: /Set as default model/ }))

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.get('model-2')?.is_default).toBe(true)
      expect(newMap.get('model-1')?.is_default).toBe(false)
    })

    it('clicking Remove default clears the default', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels, 'model-1'),
      })

      const kebabButtons = screen.getAllByRole('button', { name: /Actions for GPT-4o/ })
      await user.click(kebabButtons[0])
      await user.click(screen.getByRole('menuitem', { name: 'Remove default model' }))

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.get('model-1')?.is_default).toBe(false)
    })

    it('no kebab actions for disabled (unchecked) models', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: new Map(),
      })

      expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
    })

    it('disabling the default model auto-clears the default', async () => {
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels, 'model-1'),
      })

      await user.click(getModelCheckbox('GPT-4o'))

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.has('model-1')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('single model can be set as default and deselected', async () => {
      const singleModel = [mockModels[0]]
      const user = userEvent.setup()
      const { onSelectionChange } = renderStep({
        testResult: buildSuccessResult(singleModel),
        selectedModels: buildSelectedModels(singleModel, 'model-1'),
      })

      await user.click(getModelCheckbox('GPT-4o'))

      const newMap = onSelectionChange.mock.calls[0][0] as Map<string, InitialModelSelection>
      expect(newMap.size).toBe(0)
    })

    it('does not render description when description is missing', () => {
      const noDescModels = [{ id: 'model-x', name: 'Test Model', description: undefined as unknown as string }]
      renderStep({
        testResult: buildSuccessResult(noDescModels),
        selectedModels: buildSelectedModels(noDescModels),
      })

      expect(screen.getByText('Test Model')).toBeInTheDocument()
      expect(screen.queryByText('model-x')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations with models rendered', async () => {
      const { container } = renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      const { container } = renderStep()

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('has no accessibility violations in error state', async () => {
      const { container } = renderStep({ testResult: buildFailureResult() })

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('kebab menus have aria-labels per row', () => {
      renderStep({
        testResult: buildSuccessResult(),
        selectedModels: buildSelectedModels(mockModels),
      })

      expect(screen.getByRole('button', { name: 'Actions for GPT-4o' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Actions for GPT-3.5 Turbo' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Actions for Claude Sonnet' })).toBeInTheDocument()
    })
  })
})
