import type * as Monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'

/**
 * Manages Monaco editor ref, latest value ref, and blur listener for code editors.
 * Used by ExpandableCodeEditor so inline and modal editors share the same blur wiring
 * and value sync without duplicating logic.
 */
export function useMonacoBlur(code: string, onBlur?: (value: string) => void) {
  const latestValueRef = useRef(code)
  const editorInstanceRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const blurDisposableRef = useRef<Monaco.IDisposable | null>(null)

  const getValue = () => latestValueRef.current
  const focus = () => editorInstanceRef.current?.focus()

  useEffect(
    () => () => {
      blurDisposableRef.current?.dispose()
      blurDisposableRef.current = null
      editorInstanceRef.current = null
    },
    []
  )

  useEffect(() => {
    if (!editorInstanceRef.current || !onBlur) return
    blurDisposableRef.current?.dispose()
    blurDisposableRef.current = editorInstanceRef.current.onDidBlurEditorText(() => {
      onBlur(latestValueRef.current)
    })
    return () => {
      blurDisposableRef.current?.dispose()
      blurDisposableRef.current = null
    }
  }, [onBlur])

  useEffect(() => {
    latestValueRef.current = code
  }, [code])

  const handleEditorDidMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorInstanceRef.current = editor
    if (onBlur) {
      blurDisposableRef.current?.dispose()
      blurDisposableRef.current = editor.onDidBlurEditorText(() => onBlur(latestValueRef.current))
    }
  }

  const setValue = (value: string) => {
    latestValueRef.current = value
  }

  return { getValue, focus, handleEditorDidMount, setValue }
}
