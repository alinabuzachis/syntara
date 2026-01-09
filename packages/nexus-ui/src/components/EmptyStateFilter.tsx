import { Button, EmptyState, EmptyStateBody, EmptyStateActions, EmptyStateFooter } from '@patternfly/react-core'
import { RhUiSearchIcon } from '@patternfly/react-icons'

/**
 * EmptyStateFilter component for displaying when filters return no results.
 * Uses PatternFly's EmptyState component directly.
 *
 * @example
 * <EmptyStateFilter
 *   clearAllFilters={() => setSearch('')}
 *   imageSrc="/no-results.png"
 *   imageAlt="No results"
 * />
 */
export interface EmptyStateFilterProps {
  title?: string
  description?: string
  buttonText?: string
  imageSrc?: string
  imageAlt?: string
  clearAllFilters?: () => void
}

// Component to render an image as an icon
function ImageIcon({ src, alt }: { src: string; alt?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{
        maxWidth: '200px',
        height: 'auto',
        display: 'block',
        margin: '0 auto',
        objectFit: 'contain',
      }}
    />
  )
}

export function EmptyStateFilter(props: EmptyStateFilterProps) {
  const { title, description, buttonText, imageSrc, imageAlt, clearAllFilters } = props

  const defaultTitle = 'No results found'
  const defaultDescription = 'No results match the filter criteria. Try changing your filter settings.'
  const defaultButtonText = 'Clear all filters'

  // Use custom image component if provided, otherwise use default icon
  const icon = imageSrc ? () => <ImageIcon src={imageSrc} alt={imageAlt ?? 'No results'} /> : RhUiSearchIcon

  return (
    <EmptyState headingLevel="h2" titleText={title ?? defaultTitle} icon={icon} isFullHeight>
      <EmptyStateBody>{description ?? defaultDescription}</EmptyStateBody>
      {clearAllFilters && (
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="link" onClick={clearAllFilters}>
              {buttonText ?? defaultButtonText}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      )}
    </EmptyState>
  )
}
