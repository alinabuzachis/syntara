import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import type { ComponentProps, ReactNode } from 'react'
import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { workflowClient } from '../../client'
import { AlertProvider } from '../../components/alerts'

import { BuilderContent } from './BuilderContent'

type BuilderContentProps = ComponentProps<typeof BuilderContent>

vi.mock('./components/NodeEditorOverlay', () => ({
  NodeEditorOverlay: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="node-editor-overlay" /> : null),
}))

let shouldAutoSelectNode = false

vi.mock('./AddNodePanel', () => {
  return {
    AddNodePanel: ({ onSelectNode }: { onSelectNode: (nodeTypeId: string, nodeSubtypeId?: string | null) => void }) => {
      React.useEffect(() => {
        if (shouldAutoSelectNode) {
          onSelectNode('action', null)
        }
      }, [onSelectNode])
      return <div>Add node</div>
    },
  }
})

vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../app/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    registerSaveHandler: vi.fn(),
    unregisterSaveHandler: vi.fn(),
  }),
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </AlertProvider>
  </QueryClientProvider>
)

async function renderBuilder(props: BuilderContentProps) {
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(<BuilderContent {...props} />, { wrapper })
  })
  return result!
}

describe('BuilderContent overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    shouldAutoSelectNode = false

    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    vi.mocked(workflowClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      isIdle: true,
      error: null,
      data: undefined,
      variables: undefined,
      context: undefined,
      failureCount: 0,
      failureReason: null,
      status: 'idle' as const,
      submittedAt: 0,
    })
  })

  it('renders node editor overlay after selecting a node to add', async () => {
    shouldAutoSelectNode = true

    await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

    fireEvent.click(screen.getByRole('button', { name: /add node/i }))

    await waitFor(() => {
      expect(screen.getByTestId('node-editor-overlay')).toBeInTheDocument()
    })
  })
})
