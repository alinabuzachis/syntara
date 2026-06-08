import { z } from 'zod'

import { conditionValidationRules } from './shared/conditionValidation'

/**
 * Zod schema for the Condition node form.
 * Condition field uses shared conditionValidationRules (expression format, parsing).
 * superRefine calls the validator once and uses its result for the error message.
 *
 * **Backend Evaluation Architecture (Two-Tier):**
 *
 * The condition expressions written in the UI use JavaScript syntax (&&, ||, !, 'contains')
 * but are transformed to Python operators (and, or, not, in) by the visual builder
 * before being sent to the backend. Note: 'contains' in UI becomes 'in' in Python.
 *
 * The backend evaluates conditions using a two-tier architecture:
 *
 * **Tier 1 (Template Substitution)**: `NamespaceResolver.resolve_value()`
 * - Used for ALL non-condition fields (inputs, outputs, loop items, etc.)
 * - String interpolation with str() for value conversion
 * - Example: "${status}" → "completed" when status = "completed"
 *
 * **Tier 2 (Context-Aware AST Evaluation)**: `safe_eval_with_namespace()`
 * - Used EXCLUSIVELY for boolean condition expressions
 * - AST evaluation with direct namespace lookup (no string substitution)
 * - Values preserve original types (no repr() conversion)
 * - Eliminates string quoting issues (quotes, backslashes in values)
 * - Better security (no string concatenation before eval)
 * - Example: "${status} == 'completed'" evaluated with namespace {"status": "completed"}
 *
 * This means condition expressions are validated in the frontend using JavaScript semantics,
 * transformed to Python syntax, and then evaluated using AST with full type preservation.
 */
export const conditionFormSchema = z
  .object({
    name: z.string(),
    condition: z.string(),
  })
  .superRefine((data, ctx) => {
    const result = conditionValidationRules.validate(data.condition)
    if (result !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: typeof result === 'string' ? result : 'Condition is invalid',
        path: ['condition'],
      })
    }
  })

export type ConditionFormData = z.infer<typeof conditionFormSchema>
