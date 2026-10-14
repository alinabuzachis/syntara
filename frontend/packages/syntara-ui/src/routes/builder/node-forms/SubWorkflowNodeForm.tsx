import { zodResolver } from '@hookform/resolvers/zod'
import { FormGroup, Stack, StackItem, TextInput } from '@patternfly/react-core'
import { use } from 'react'
import { Controller, FormProvider, useForm } from 'react-hook-form'
import { z } from 'zod'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { NodeEditorAutoSubmitContext, useRegisterAutoSubmit } from '../hooks/useNodeEditorAutoSubmit'
import type { BaseNodeFormProps } from '../registry/NodeRegistry'
import { useIsVersionView } from '../VersionViewContext'

import { ChildWorkflowSelector } from './ChildWorkflowSelector'
import { InputMappingFields, type InputMappingEntry } from './InputMappingFields'
import { NodeFormContainer } from './shared/NodeFormContainer'

/**
 * Form data for Sub-workflow step configuration
 */
export type SubWorkflowFormData = {
  name: string
  workflow_id: string | null
  input_mapping: InputMappingEntry[]
}

const subWorkflowFormSchema = z.object({
  name: z.string().trim().min(1, 'Step name is required'),
  workflow_id: z.string().nullable(),
  input_mapping: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
    })
  ),
})

/**
 * Sub-workflow step configuration form
 *
 * Allows user to:
 * - Name the step
 * - Select a child workflow
 * - Configure input mappings
 */
export function SubWorkflowNodeForm({ onSubmit, initialData }: BaseNodeFormProps<SubWorkflowFormData>) {
  const isVersionView = useIsVersionView()
  const projectId = useWorkflowStore((state) => state.projectId)

  const methods = useForm<SubWorkflowFormData>({
    resolver: zodResolver(subWorkflowFormSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      workflow_id: initialData?.workflow_id ?? null,
      input_mapping: initialData?.input_mapping ?? [],
    },
  })

  const workflowId = methods.watch('workflow_id')

  const autoSubmitRef = use(NodeEditorAutoSubmitContext)
  useRegisterAutoSubmit(autoSubmitRef, methods, onSubmit)

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="sub-workflow-node-form" onSubmit={methods.handleSubmit(onSubmit)}>
        <Stack hasGutter style={{ paddingInline: 'var(--pf-t--global--spacer--xs)' }}>
          <StackItem>
            <FormGroup label="Step name" isRequired>
              <TextInput
                id="sub-workflow-name"
                {...methods.register('name')}
                placeholder="Enter step name"
                type="text"
                aria-label="Step name"
                isDisabled={isVersionView}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <Controller
              name="workflow_id"
              control={methods.control}
              render={({ field }) => (
                <ChildWorkflowSelector
                  projectId={projectId}
                  selectedWorkflowId={field.value}
                  onChange={field.onChange}
                  isRequired
                  isDisabled={isVersionView}
                />
              )}
            />
          </StackItem>

          <StackItem>
            <Controller
              name="input_mapping"
              control={methods.control}
              render={({ field }) => (
                <InputMappingFields
                  entries={field.value}
                  onChange={field.onChange}
                  isDisabled={isVersionView || !workflowId}
                />
              )}
            />
          </StackItem>
        </Stack>
      </NodeFormContainer>
    </FormProvider>
  )
}
