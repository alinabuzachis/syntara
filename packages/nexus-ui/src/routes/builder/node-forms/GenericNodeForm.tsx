import type { BaseNodeFormProps } from '../registry/NodeRegistry'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface GenericNodeFormData {
  // No data needed - this form just triggers the node to be added
}

/**
 * Form component for Generic placeholder nodes
 * This is a minimal form that immediately succeeds to add the generic node to canvas
 */
export function GenericNodeForm({ onSubmit, onCancel, submitButtonText }: BaseNodeFormProps<GenericNodeFormData>) {
  // Automatically submit when form is shown
  // This creates the generic node on canvas immediately
  const handleSubmit = () => {
    onSubmit({})
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        A generic placeholder node will be added to the canvas. Click on it to configure the node type.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {submitButtonText ?? 'Add Generic Node'}
        </button>
      </div>
    </div>
  )
}
