import { createContext, useEffect, useRef, type MutableRefObject } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

type AutoSubmitFn = () => Promise<boolean>

export const NodeEditorAutoSubmitContext = createContext<MutableRefObject<AutoSubmitFn | null>>({ current: null })

export function useNodeEditorAutoSubmitRef() {
  return useRef<AutoSubmitFn | null>(null)
}

export function useRegisterAutoSubmit<T extends FieldValues>(
  autoSubmitRef: MutableRefObject<AutoSubmitFn | null>,
  methods: UseFormReturn<T>,
  onSubmit: (data: T) => void
) {
  const onSubmitRef = useRef(onSubmit)
  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    autoSubmitRef.current = async () => {
      let succeeded = false
      await methods.handleSubmit(
        (data) => {
          onSubmitRef.current(data)
          succeeded = true
        },
        () => {
          succeeded = false
        }
      )()
      return succeeded
    }
    return () => {
      autoSubmitRef.current = null
    }
  }, [autoSubmitRef, methods])
}
