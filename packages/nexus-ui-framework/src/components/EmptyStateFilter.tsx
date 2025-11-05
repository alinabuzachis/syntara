import { EmptyState } from './EmptyState'

export interface EmptyStateFilterProps {
  title?: string
  description?: string
  buttonText?: string
  clearAllFilters?: () => void
}

export function EmptyStateFilter(props: EmptyStateFilterProps) {
  const { title, description, buttonText, clearAllFilters } = props

  const defaultTitle = 'No results found'
  const defaultDescription = 'No results match the filter criteria. Try changing your filter settings.'
  const defaultButtonText = 'Clear all filters'

  return (
    <EmptyState
      title={title ?? defaultTitle}
      description={description ?? defaultDescription}
      imageSrc="/src/assets/collage-circle-sparkles-window-server-dark-RH.png"
      imageAlt="No results"
      buttonText={clearAllFilters ? (buttonText ?? defaultButtonText) : undefined}
      onButtonClick={clearAllFilters}
    />
  )
}
