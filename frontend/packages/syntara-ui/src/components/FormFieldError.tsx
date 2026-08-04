import { FormHelperText, HelperText, HelperTextItem } from '@patternfly/react-core'

export function FormFieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) return null
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant="error">{message}</HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}
