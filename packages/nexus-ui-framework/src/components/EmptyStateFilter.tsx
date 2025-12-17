import { EmptyState } from './EmptyState'

export interface EmptyStateFilterProps {
  title?: string
  description?: string
  buttonText?: string
  imageSrc?: string
  imageAlt?: string
  clearAllFilters?: () => void
}

export function EmptyStateFilter(props: EmptyStateFilterProps) {
  const { title, description, buttonText, imageSrc, imageAlt, clearAllFilters } = props

  const defaultTitle = 'No results found'
  const defaultDescription = 'No results match the filter criteria. Try changing your filter settings.'
  const defaultButtonText = 'Clear all filters'

  return (
    <EmptyState
      title={title ?? defaultTitle}
      description={description ?? defaultDescription}
      imageSrc={imageSrc}
      imageAlt={imageAlt ?? 'No results'}
      buttonText={clearAllFilters ? (buttonText ?? defaultButtonText) : undefined}
      onButtonClick={clearAllFilters}
    />
  )
}
