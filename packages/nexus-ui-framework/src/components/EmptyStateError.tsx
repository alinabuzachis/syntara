import { EmptyState } from './EmptyState'

export interface EmptyStateErrorProps {
  title?: string
  description?: string
  buttonText?: string
}

export function EmptyStateError(props: EmptyStateErrorProps) {
  const { title, description, buttonText } = props

  const defaultTitle = 'Something went wrong'
  const defaultDescription = 'Please refresh the page by using the button below.'
  const defaultButtonText = 'Refresh'

  return (
    <EmptyState
      title={title ?? defaultTitle}
      description={description ?? defaultDescription}
      imageSrc="/src/assets/collage-circle-sparkles-window-server-dark-RH.png"
      imageAlt="Error"
      buttonText={buttonText ?? defaultButtonText}
      onButtonClick={() => window.location.reload()}
    />
  )
}
