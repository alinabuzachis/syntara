import { Button, Spinner } from '@patternfly/react-core'

interface TestStepButtonProps {
  onTestStep: () => void
  isPending?: boolean
  isDisabled?: boolean
}

export function TestStepButton({ onTestStep, isPending, isDisabled }: Readonly<TestStepButtonProps>) {
  return (
    <Button
      variant="primary"
      type="button"
      isDisabled={isPending || isDisabled}
      onClick={onTestStep}
      icon={isPending ? <Spinner size="sm" aria-label="Running" /> : undefined}
    >
      {isPending ? 'Running...' : 'Test step'}
    </Button>
  )
}
