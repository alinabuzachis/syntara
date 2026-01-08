import type { ComponentType } from 'react'

import type { NodeCategory } from '../categories'
import type { BaseNodeFormProps, NodeTypeDefinition } from '../NodeRegistry'

/**
 * Configuration for creating a node type
 */
interface NodeConfig<TFormData = unknown> {
  /** Unique identifier for this node type */
  id: string
  /** Display label in UI */
  label: string
  /** Icon component to display */
  icon: ComponentType
  /** Category for grouping */
  category?: NodeCategory
  /** Description shown in UI */
  description: string
  /** Keywords for search */
  keywords: string[]
  /** Order for display (lower = earlier) */
  order?: number
  /** Form component to render when selected */
  formComponent: ComponentType<BaseNodeFormProps<TFormData>>
  /** Whether this node type is enabled (default: true) */
  enabled?: boolean
}

/**
 * Creates a basic node that just calls onSuccess when submitted.
 * Useful for placeholder nodes where the actual logic will be implemented later.
 *
 * @param config - Node configuration
 * @param errorMessage - Custom error message (defaults to "Failed to add {label}")
 */
export function createBasicNode<TFormData = unknown>(
  config: NodeConfig<TFormData>,
  errorMessage?: string
): NodeTypeDefinition<TFormData> {
  const defaultErrorMessage = errorMessage || `Failed to add ${config.label}`

  return {
    ...config,
    onSubmit: (_data, onSuccess, onError) => {
      try {
        // Placeholder submission logic
        // Actual implementation will be added when form provides proper data structure
        onSuccess()
      } catch (error) {
        onError(error instanceof Error ? error.message : defaultErrorMessage)
      }
    },
  }
}

/**
 * Creates a node with custom submission logic.
 * Useful for nodes that need to interact with stores or perform complex operations.
 *
 * @param config - Node configuration
 * @param onSubmit - Custom submission handler
 */
export function createCustomNode<TFormData = unknown>(
  config: NodeConfig<TFormData>,
  onSubmit: (data: TFormData, onSuccess: () => void, onError: (error: string) => void) => void
): NodeTypeDefinition<TFormData> {
  return {
    ...config,
    onSubmit,
  }
}
