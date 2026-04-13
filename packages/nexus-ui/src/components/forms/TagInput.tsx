/**
 * Controlled input for a list of string items (e.g. tags, approvers).
 * Each item is shown as a PatternFly Label (removable pill). Add via Enter or comma.
 * Uses a native input (not PF TextInput) so it sits inside the same bordered area as the
 * chips with no inner wrapper—one seamless control.
 */

import { Flex, FormHelperText, HelperText, HelperTextItem, Label } from '@patternfly/react-core'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useState } from 'react'

export interface TagInputProps {
  /** Current list of items */
  value: string[]
  /** Called when the list changes */
  onChange: (value: string[]) => void
  /** Input id for focus and accessibility */
  id: string
  /** Aria label for the inline input */
  ariaLabel: string
  /** Placeholder when empty */
  placeholder?: string
  /** Helper text below the control */
  helperText?: string
}

const containerStyle = {
  height: 'auto' as const,
  minHeight: '36px',
  padding:
    'var(--pf-t--global--spacer--control--vertical--default) var(--pf-t--global--spacer--control--horizontal--default)',
  cursor: 'text' as const,
}

const inlineInputStyle: CSSProperties = {
  flex: 1,
  minWidth: '100px',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  padding: 0,
  margin: 0,
  fontFamily: 'inherit',
  fontSize: 'inherit',
}

export function TagInput({ value, onChange, id, ariaLabel, placeholder = '', helperText }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const handleAdd = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      e.stopPropagation()
      const newItem = inputValue.trim()
      if (newItem && !value.includes(newItem)) {
        onChange([...value, newItem])
        setInputValue('')
      } else {
        setInputValue('')
      }
    }
  }

  const handleRemove = (itemToRemove: string) => {
    onChange(value.filter((item) => item !== itemToRemove))
  }

  const focusInput = () => document.getElementById(id)?.focus()

  return (
    <>
      <Flex
        className="pf-v6-c-form-control"
        flexWrap={{ default: 'wrap' }}
        alignItems={{ default: 'alignItemsCenter' }}
        columnGap={{ default: 'columnGapSm' }}
        rowGap={{ default: 'rowGapSm' }}
        style={containerStyle}
        onClick={focusInput}
      >
        {value.map((item) => (
          <Label
            key={item}
            color="grey"
            onClose={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleRemove(item)
            }}
            closeBtnAriaLabel={`Remove ${item}`}
          >
            {item}
          </Label>
        ))}
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleAdd}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={ariaLabel}
          style={inlineInputStyle}
        />
      </Flex>
      {helperText && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{helperText}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </>
  )
}
