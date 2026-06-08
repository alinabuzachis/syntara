import { useMemo, useRef, useState } from 'react'

/**
 * Local UI state for a claim-mapping field: typeahead dropdown vs custom text,
 * open state, filter text, and derived filtered option list.
 *
 * - `useCustom` — user chose free-form entry ("Custom..."); not persisted; resets on remount.
 * - `filterValue` — typeahead filter while open; separate from the form field string value.
 */
export function useClaimMappingFieldTypeahead(options: string[] | null | undefined) {
  const [useCustom, setUseCustom] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = useMemo(() => {
    if (!options) return []
    if (!filterValue) return options
    const term = filterValue.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(term))
  }, [options, filterValue])

  return {
    useCustom,
    setUseCustom,
    isOpen,
    setIsOpen,
    filterValue,
    setFilterValue,
    inputRef,
    filteredOptions,
  }
}

export type ClaimMappingFieldTypeahead = ReturnType<typeof useClaimMappingFieldTypeahead>
