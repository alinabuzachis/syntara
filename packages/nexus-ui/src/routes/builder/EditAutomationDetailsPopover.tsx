/**
 * Popover for editing automation name, description, and tags.
 * Updates apply to builder state on Close. On Save, tags are persisted as workflow.labels
 * (key = tag name, value = '') so they appear in the list API and Tags column.
 *
 * Form layout matches other builder forms: Stack hasGutter > StackItem > FormGroup per field.
 */

import {
  Button,
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

import { TagInput } from '../../components/forms/TagInput'

export interface EditAutomationDetailsPopoverProps {
  /** Current name (from builder state) */
  name: string
  /** Current description (from builder state) */
  description: string
  /** Current tags (from builder state) */
  tags: string[]
  /** Called when user clicks Close; apply these values to builder state */
  onApply: (name: string, description: string, tags: string[]) => void
}

export function EditAutomationDetailsPopover({ name, description, tags, onApply }: EditAutomationDetailsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localName, setLocalName] = useState(name)
  const [localDescription, setLocalDescription] = useState(description)
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const [nameError, setNameError] = useState<string | null>(null)

  // Sync from props when popover opens (defer to avoid synchronous setState in effect)
  useEffect(() => {
    if (!isOpen) return
    const id = window.setTimeout(() => {
      setLocalName(name)
      setLocalDescription(description)
      setLocalTags([...tags])
      setNameError(null)
    }, 0)
    return () => clearTimeout(id)
  }, [isOpen, name, description, tags])

  const tryApplyAndClose = (hide?: () => void) => {
    const trimmedName = localName.trim()
    if (!trimmedName) {
      setNameError('Name is required')
      return
    }
    setNameError(null)
    onApply(trimmedName, localDescription.trim(), localTags)
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
        <FormGroup label="Name" isRequired fieldId="edit-automation-name">
          <TextInput
            id="edit-automation-name"
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
        <FormGroup label="Description" fieldId="edit-automation-description">
          <TextArea
            id="edit-automation-description"
            value={localDescription}
            onChange={(_event, value) => setLocalDescription(value)}
            placeholder="Enter description"
            rows={3}
            aria-label="Description"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tags" fieldId="edit-automation-tags">
          <TagInput
            id="edit-automation-tags-inline-input"
            value={localTags}
            onChange={setLocalTags}
            ariaLabel="Add tag"
            placeholder="Enter a tag"
            helperText="Type a tag and press Enter or comma to add"
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
          <span>Edit automation details</span>
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
        aria-label="Edit automation details"
        onClick={() => setIsOpen(true)}
      />
    </Popover>
  )
}
