/**
 * Popover for editing workflow name and description.
 *
 * Form layout matches other builder forms: Stack hasGutter > StackItem > FormGroup per field.
 */

import {
  Button,
  Content,
  ContentVariants,
  Flex,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Icon,
  Popover,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { RhUiEditIcon, RhUiErrorIcon } from '@patternfly/react-icons'
import { useEffect, useState } from 'react'

export type EditWorkflowDetailsPopoverProps = {
  /** Current name (from builder state) */
  name: string
  /** Current description (from builder state) */
  description: string
  /** Called when user clicks Close; apply these values to builder state */
  onApply: (name: string, description: string) => void
}

export function EditWorkflowDetailsPopover({ name, description, onApply }: Readonly<EditWorkflowDetailsPopoverProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [localName, setLocalName] = useState(name)
  const [localDescription, setLocalDescription] = useState(description)
  const [nameError, setNameError] = useState<string | null>(null)

  // Sync from props when popover opens (defer to avoid synchronous setState in effect)
  useEffect(() => {
    if (!isOpen) return
    const id = window.setTimeout(() => {
      setLocalName(name)
      setLocalDescription(description)
      setNameError(null)
    }, 0)
    return () => clearTimeout(id)
  }, [isOpen, name, description])

  const tryApplyAndClose = (hide?: () => void) => {
    const trimmedName = localName.trim()
    if (!trimmedName) {
      setNameError('Name is required')
      return
    }
    setNameError(null)
    onApply(trimmedName, localDescription.trim())
    setIsOpen(false)
    hide?.()
  }

  const handleClose = () => tryApplyAndClose()

  // When isVisible is controlled, PatternFly only calls shouldClose(event, hide) and does not call hide.
  // We must invoke the hide callback so the [x] button and Escape actually close the popover.
  const handleShouldClose = (_event: MouseEvent | KeyboardEvent, hide?: () => void) => {
    tryApplyAndClose(hide)
  }

  const bodyContent = (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Name" isRequired fieldId="edit-workflow-name">
          <TextInput
            id="edit-workflow-name"
            type="text"
            value={localName}
            validated={nameError ? 'error' : 'default'}
            onChange={(_event, value) => {
              setLocalName(value)
              if (nameError) setNameError(null)
            }}
            placeholder="Workflow name"
            aria-label="Name"
          />
          {nameError && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {nameError}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Description" fieldId="edit-workflow-description">
          <TextArea
            id="edit-workflow-description"
            value={localDescription}
            onChange={(_event, value) => setLocalDescription(value)}
            placeholder="Enter description"
            rows={3}
            aria-label="Description"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <Button variant="primary" onClick={handleClose}>
          Close
        </Button>
      </StackItem>
    </Stack>
  )

  return (
    <Popover
      isVisible={isOpen}
      onHide={() => setIsOpen(false)}
      shouldClose={handleShouldClose}
      headerContent={
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
          <Icon isInline>
            <RhUiEditIcon />
          </Icon>
          <Content component={ContentVariants.p} style={{ margin: 0 }}>
            Edit workflow details
          </Content>
        </Flex>
      }
      bodyContent={bodyContent}
      triggerAction="click"
      showClose
    >
      <Button
        variant="plain"
        icon={
          <Icon isInline>
            <RhUiEditIcon />
          </Icon>
        }
        aria-label="Edit workflow details"
        onClick={() => setIsOpen(true)}
      />
    </Popover>
  )
}
