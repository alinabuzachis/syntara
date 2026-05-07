import {
  Alert,
  Button,
  Content,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { useState, useCallback, useRef, useEffect } from 'react'

import { workflowFetchClient } from '../../../client'
import { ExpandableCodeEditor } from '../../../components/ExpandableCodeEditor'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

/**
 * Local type definitions for test execution endpoint.
 * These will be replaced with auto-generated contract types once the backend
 * OpenAPI spec is updated and `npm run gen` is executed.
 */
type TestExecutionRequest = {
  target_node_id: string
  pre_resolved_nodes: Record<string, { output: Record<string, unknown> }>
  trigger_inputs: Record<string, unknown>
}

type TestExecutionResponse = {
  id: string
}

type PredecessorNode = Readonly<{ id: string; name: string }>

export type TestStepDialogData = {
  nodeId: string
  nodeName: string
  predecessors: PredecessorNode[]
}

type TestStepDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onExecutionCreated?: (executionId: string) => void
  nodeId: string | null
  nodeName: string
  workflowId: string
  predecessors?: PredecessorNode[]
}>

const SUCCESS_AUTO_CLOSE_DELAY_MS = 800

type DialogView = 'choice' | 'mock-editor'
type RunState = 'idle' | 'running' | 'success' | 'error'

function getMockEditorDescription(predecessors: readonly PredecessorNode[], nodeName: string): string {
  if (predecessors.length === 1) {
    return `Provide mock output data for the previous step (${predecessors[0].name}). This data will be used as input for ${nodeName}, and only ${nodeName} will execute.`
  }
  return `Provide mock output data for the previous steps. This data will be applied to all ${predecessors.length} predecessor nodes, and only ${nodeName} will execute.`
}

export function TestStepDialog({
  isOpen,
  onClose,
  onExecutionCreated,
  nodeId,
  nodeName,
  workflowId,
  predecessors = [],
}: TestStepDialogProps) {
  const [dialogView, setDialogView] = useState<DialogView>('choice')
  const [mockJson, setMockJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [runState, setRunState] = useState<RunState>('idle')
  const [runError, setRunError] = useState<string | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isRunningRef = useRef(false)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const handleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setDialogView('choice')
    setMockJson('')
    setJsonError(null)
    setRunState('idle')
    setRunError(null)
    isRunningRef.current = false
    onClose()
  }, [onClose])

  const handleSetMockData = useCallback(() => {
    setDialogView('mock-editor')
  }, [])

  const executeTestRun = useCallback(
    async (preResolvedNodes: TestExecutionRequest['pre_resolved_nodes']) => {
      if (!nodeId || !workflowId) return
      if (isRunningRef.current) return

      isRunningRef.current = true
      setRunState('running')
      setRunError(null)

      try {
        const { data, error } = await workflowFetchClient.POST(
          '/workflows/{workflow_id}/test' as never,
          {
            params: { path: { workflow_id: workflowId } },
            body: {
              target_node_id: nodeId,
              pre_resolved_nodes: preResolvedNodes,
              trigger_inputs: {},
            } satisfies TestExecutionRequest,
          } as never
        )

        if (error) {
          setRunState('error')
          setRunError(getErrorMessage(error))
          isRunningRef.current = false
          return
        }

        setRunState('success')

        const responseData = data as TestExecutionResponse | undefined
        if (responseData?.id && onExecutionCreated) {
          onExecutionCreated(responseData.id)
        }

        closeTimerRef.current = setTimeout(handleClose, SUCCESS_AUTO_CLOSE_DELAY_MS)
      } catch (err) {
        setRunState('error')
        setRunError(getErrorMessage(err))
        isRunningRef.current = false
      }
    },
    [nodeId, workflowId, handleClose, onExecutionCreated]
  )

  const handleRunAllPrevious = useCallback(() => {
    detachPromise(executeTestRun({}))
  }, [executeTestRun])

  const handleRunWithMockData = useCallback(async () => {
    let parsedMock: Record<string, unknown> = {}
    if (mockJson.trim()) {
      try {
        parsedMock = JSON.parse(mockJson) as Record<string, unknown>
        setJsonError(null)
      } catch (error) {
        setJsonError(error instanceof Error ? error.message : 'Invalid JSON')
        return
      }
    }

    const preResolvedNodes: Record<string, { output: Record<string, unknown> }> = {}
    for (const pred of predecessors) {
      preResolvedNodes[pred.id] = { output: parsedMock }
    }

    await executeTestRun(preResolvedNodes)
  }, [mockJson, predecessors, executeTestRun])

  if (dialogView === 'choice') {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} variant="medium" aria-labelledby="test-step-choice-title">
        <ModalHeader title={`Run ${nodeName}?`} labelId="test-step-choice-title" />
        <ModalBody>
          <Stack hasGutter>
            <StackItem>
              <Content component="p">
                You are about to manually run this node. Do you want to run all the previous nodes up until this node or
                set mock output data for the previous nodes output, so it is used for the input for this node and only
                this node runs?
              </Content>
            </StackItem>
            {runState === 'error' && runError && (
              <StackItem>
                <Alert variant="danger" isInline title="Failed to start test execution">
                  <Content component="p">{runError}</Content>
                </Alert>
              </StackItem>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={handleRunAllPrevious}
            isDisabled={runState !== 'idle'}
            isLoading={runState === 'running'}
          >
            {runState === 'running' ? 'Running...' : 'Run all previous nodes'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleSetMockData}
            isDisabled={runState !== 'idle' || predecessors.length === 0}
          >
            Set mock data
          </Button>
          <Button variant="link" onClick={handleClose} isDisabled={runState !== 'idle'}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="large" aria-labelledby="test-step-mock-title">
      <ModalHeader title={`Set mock data for ${nodeName}`} labelId="test-step-mock-title" />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <Content component="p">{getMockEditorDescription(predecessors, nodeName)}</Content>
          </StackItem>
          <StackItem>
            <ExpandableCodeEditor
              code={mockJson}
              onCodeChange={(value) => {
                setMockJson(value)
                setJsonError(null)
              }}
              language="json"
              height="250px"
              modalTitle={`Mock output data for ${nodeName}`}
              ariaLabel="Mock JSON output data"
              isReadOnly={runState !== 'idle'}
            />
            {jsonError && <Alert variant="danger" isInline isPlain title={jsonError} />}
          </StackItem>
          {runState === 'success' && (
            <StackItem>
              <Alert variant="success" isInline title="Test execution started successfully" />
            </StackItem>
          )}
          {runState === 'error' && runError && (
            <StackItem>
              <Alert variant="danger" isInline title="Failed to start test execution">
                <Content component="p">{runError}</Content>
              </Alert>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => detachPromise(handleRunWithMockData())}
          isDisabled={runState !== 'idle'}
          isLoading={runState === 'running'}
        >
          {runState === 'running' ? 'Running...' : 'Run'}
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={runState !== 'idle'}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
