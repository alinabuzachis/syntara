import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxPageTitle } from '../../../components/NxPageTitle'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { NxLoadingState } from '../../../components/states/NxLoadingState'
import { detachPromise } from '../../../utils/detachPromise'

type ExecutionDetailErrorStatesProps = Readonly<{
  executionId: string | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => Promise<unknown>
}>

/**
 * Renders error and loading states for ExecutionDetail page.
 * Returns null if execution data is available (no error, not loading).
 */
export function ExecutionDetailErrorStates({
  executionId,
  isLoading,
  error,
  onRetry,
}: ExecutionDetailErrorStatesProps) {
  if (!executionId) {
    return (
      <NxPage>
        <NxPageTitle segments={['Workflow Runs']} />
        <NxPageHeader title="Error" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxErrorState title="Invalid execution" message="No execution ID provided" />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (error) {
    return (
      <NxPage>
        <NxPageTitle segments={['Workflow Runs']} />
        <NxPageHeader title="Error loading execution" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxErrorState title="Error loading execution" message={error} onRetry={() => detachPromise(onRetry())} />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (isLoading) {
    return (
      <NxPage>
        <NxPageTitle segments={['Workflow Runs']} />
        <NxPageHeader title="Loading execution" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxLoadingState />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  return null
}
