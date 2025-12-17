import { EmptyState } from './EmptyState'

export interface EmptyStateNoDataProps {
  title?: string
  description?: string
  buttonText?: string
  imageSrc?: string
  imageAlt?: string
  addData?: () => void
}

export function EmptyStateNoData(props: EmptyStateNoDataProps) {
  const { title, description, buttonText, imageSrc, imageAlt, addData } = props

  const defaultTitle = 'No data available'
  const defaultDescription = 'There is no data to display at this time.'
  const defaultButtonText = 'Add data'

  return (
    <EmptyState
      title={title ?? defaultTitle}
      description={description ?? defaultDescription}
      imageSrc={imageSrc}
      imageAlt={imageAlt ?? 'No data'}
      buttonText={addData ? (buttonText ?? defaultButtonText) : undefined}
      onButtonClick={addData}
    />
  )
}
