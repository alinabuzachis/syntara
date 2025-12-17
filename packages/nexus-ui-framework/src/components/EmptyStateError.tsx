import { EmptyState } from './EmptyState'

export interface EmptyStateErrorProps {
  title?: string
  description?: string
  buttonText?: string
  imageSrc?: string
  imageAlt?: string
}

export function EmptyStateError(props: EmptyStateErrorProps) {
  const { title, description, buttonText, imageSrc, imageAlt } = props

  const defaultTitle = 'Something went wrong'
  const defaultDescription = 'Please refresh the page by using the button below.'
  const defaultButtonText = 'Refresh'

  return (
    <EmptyState
      title={title ?? defaultTitle}
      description={description ?? defaultDescription}
      imageSrc={imageSrc}
      imageAlt={imageAlt ?? 'Error'}
      buttonText={buttonText ?? defaultButtonText}
      onButtonClick={() => window.location.reload()}
    />
  )
}
