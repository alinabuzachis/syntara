/**
 * Re-export react-hook-form hooks and components so consumers use the same instance.
 * This ensures compatibility when using these hooks with the Form component.
 */
export { useFormContext, useWatch, Controller } from 'react-hook-form'
export type { Control, UseFormRegister } from 'react-hook-form'
