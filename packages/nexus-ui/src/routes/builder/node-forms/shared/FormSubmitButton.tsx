import { Button, StackItem } from '@patternfly/react-core'

interface FormSubmitButtonProps {
  submitButtonText?: string
  isDisabled?: boolean
}

/**
 * Standardized submit button for node forms.
 * Always full width and uses consistent styling.
 */
export function FormSubmitButton({ submitButtonText, isDisabled }: FormSubmitButtonProps) {
  return (
    <StackItem
      style={{
        paddingLeft: 'var(--pf-t--global--spacer--sm)',
        paddingRight: 'var(--pf-t--global--spacer--sm)',
      }}
    >
      <Button type="submit" variant="secondary" style={{ width: '100%' }} isDisabled={isDisabled}>
        {submitButtonText ?? 'Add node'}
      </Button>
    </StackItem>
  )
}
