import { Button, Popover } from '@patternfly/react-core'
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons'

type FormLabelWithHelpProps = {
  label: string
  helpText?: string | React.ReactNode
}

export function FormLabelWithHelp({ label, helpText }: Readonly<FormLabelWithHelpProps>) {
  return (
    <>
      {label}
      {helpText && (
        <Popover bodyContent={helpText}>
          <Button
            variant="plain"
            aria-label={`${label} help`}
            style={{ padding: 0, marginLeft: 'var(--pf-t--global--spacer--xs)' }}
          >
            <OutlinedQuestionCircleIcon style={{ color: 'var(--pf-t--global--color--icon--default)' }} />
          </Button>
        </Popover>
      )}
    </>
  )
}
