import { Button, EmptyState, EmptyStateBody, EmptyStateActions, EmptyStateFooter } from '@patternfly/react-core'
import { RhUiCubesFillIcon } from '@patternfly/react-icons'

/**
 * EmptyStateNoData component for displaying when there's no data available.
 * Uses PatternFly's EmptyState component directly.
 *
 * @example
 * <EmptyStateNoData
 *   title="No workflows found"
 *   description="Create your first workflow to get started."
 *   buttonText="Create Workflow"
 *   addData={() => navigate('/create')}
 * />
 */
export interface EmptyStateNoDataProps {
  title?: string
  description?: string
  buttonText?: string
  imageSrc?: string
  imageAlt?: string
  addData?: () => void
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

export function EmptyStateNoData(props: EmptyStateNoDataProps) {
  const { title, description, buttonText, imageSrc, imageAlt, addData } = props

  const defaultTitle = 'No data available'
  const defaultDescription = 'There is no data to display at this time.'
  const defaultButtonText = 'Add data'

  // Use custom image component if provided, otherwise use default icon
  const icon = imageSrc ? () => <ImageIcon src={imageSrc} alt={imageAlt ?? 'No data'} /> : RhUiCubesFillIcon

  return (
    <EmptyState headingLevel="h2" titleText={title ?? defaultTitle} icon={icon} isFullHeight>
      <EmptyStateBody>{description ?? defaultDescription}</EmptyStateBody>
      {addData && (
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={addData}>
              {buttonText ?? defaultButtonText}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      )}
    </EmptyState>
  )
}
