import { FormGroup, FormHelperText, HelperText, HelperTextItem, StackItem } from '@patternfly/react-core'
import { type ReactElement, useEffect, useRef } from 'react'
import { Controller, useFormContext } from 'react-hook-form'

import { ExpandableCodeEditor, type ExpandableCodeEditorHandle } from '../components/ExpandableCodeEditor'
import { JsonEditorControls } from '../components/JsonEditorToolbar'

import type { TriggerFormData } from './triggerFormSchema'

type JsonSchemaFieldProps = {
  /** Plain string label for the field. */
  label: string
  /** Optional PatternFly labelHelp popover. */
  labelHelp?: ReactElement
  /** Placeholder code shown when the field value is empty. */
  defaultCode: string
  /** Example code injected by the "Load example" toolbar action. */
  exampleCode: string
  /** Title of the full-screen modal editor. */
  modalTitle: string
  /** Accessible label for the code editor. */
  ariaLabel: string
  /** Filename used when downloading the schema. */
  downloadFilename: string
  /** Helper text shown below the editor when there is no error. */
  helperText: string
  /** Validation error message (if any). */
  error?: string
  /** DOM id for the FormGroup (defaults to "json-schema"). */
  fieldId?: string
}

/**
 * Reusable JSON schema / input-schema editor field used by manual, webhook,
 * and EDA trigger forms. Encapsulates the `Controller` + `ExpandableCodeEditor`
 * + `JsonEditorControls` pattern along with focus-on-error behaviour.
 */
export function JsonSchemaField({
  label,
  labelHelp,
  defaultCode,
  exampleCode,
  modalTitle,
  ariaLabel,
  downloadFilename,
  helperText,
  error,
  fieldId = 'json-schema',
}: Readonly<JsonSchemaFieldProps>) {
  const { control } = useFormContext<TriggerFormData>()
  const editorRef = useRef<ExpandableCodeEditorHandle | null>(null)

  useEffect(() => {
    if (error && editorRef.current) editorRef.current.focus()
  }, [error])

  return (
    <StackItem>
      <FormGroup label={label} labelHelp={labelHelp} fieldId={fieldId}>
        <Controller
          control={control}
          name="inputSchema"
          render={({ field }) => (
            <ExpandableCodeEditor
              ref={editorRef}
              code={field.value || defaultCode}
              onCodeChange={field.onChange}
              onBlur={field.onBlur}
              language="json"
              height="150px"
              modalTitle={modalTitle}
              ariaLabel={ariaLabel}
              additionalControls={
                <JsonEditorControls
                  code={field.value || defaultCode}
                  onCodeChange={field.onChange}
                  defaultCode={defaultCode}
                  downloadFilename={downloadFilename}
                  exampleCode={exampleCode}
                />
              }
            />
          )}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={error ? 'error' : 'default'}>{error ?? helperText}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </StackItem>
  )
}
