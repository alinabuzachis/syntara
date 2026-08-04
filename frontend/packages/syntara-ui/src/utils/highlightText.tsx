import type { ReactNode } from 'react'

/**
 * Highlights matching text within a string by wrapping matches in <mark> elements.
 * Case-insensitive matching. Returns the original text if no search term provided.
 *
 * @param text - The text to search within
 * @param searchTerm - The term to highlight (case-insensitive)
 * @returns React nodes with highlighted matches, or the original text
 *
 * @example
 * highlightText('Hello World', 'wor') // => ['Hello ', <mark>Wor</mark>, 'ld']
 * highlightText('No match', '') // => 'No match'
 */
export function highlightText(text: string, searchTerm: string): ReactNode {
  if (!searchTerm.trim()) {
    return text
  }

  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi')
  const parts = text.split(regex)

  // If no match found, regex split returns array with single element
  if (parts.length === 1) {
    return text
  }

  return parts.map((part, index) => {
    // Even indices are non-matching text, odd indices are matches (due to capturing group)
    if (index % 2 === 1) {
      return (
        <mark
          // Using part content + index for key since parts can repeat
          // eslint-disable-next-line react/no-array-index-key
          key={`match-${part.slice(0, 10)}-${index}`}
          style={{
            backgroundColor: 'var(--pf-t--global--color--nonstatus--orange--300)',
            color: 'inherit',
            padding: 0,
          }}
        >
          {part}
        </mark>
      )
    }
    return part
  })
}

/**
 * Highlights matching text in each line of a multi-line string.
 * Lines without matches are still included (not filtered out).
 *
 * @param text - Multi-line text (e.g., JSON string)
 * @param searchTerm - The term to highlight
 * @returns React node with highlights applied, preserving line breaks
 */
export function highlightTextLines(text: string, searchTerm: string): ReactNode {
  if (!searchTerm.trim()) {
    return text
  }

  const lines = text.split('\n')

  return lines.map((line, index) => {
    const highlighted = highlightText(line, searchTerm)

    // Add line breaks between lines (except after the last line)
    return (
      // Using line content + index for key since lines can repeat
      // eslint-disable-next-line react/no-array-index-key
      <span key={`line-${index}-${line.slice(0, 20)}`}>
        {highlighted}
        {index < lines.length - 1 && '\n'}
      </span>
    )
  })
}

/**
 * Escapes special regex characters in a string to use as a literal pattern.
 */
function escapeRegExp(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
