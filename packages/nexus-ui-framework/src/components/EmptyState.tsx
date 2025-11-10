import clsx from 'clsx'
import { Button } from './Button'

export interface EmptyStateProps {
  title: string
  description: string
  imageSrc?: string
  imageAlt?: string
  buttonText?: string
  onButtonClick?: () => void
  className?: string
}

export function EmptyState(props: EmptyStateProps) {
  const { title, description, imageSrc, imageAlt, buttonText, onButtonClick, className } = props

  return (
    <div className={clsx('flex grow flex-col overflow-hidden rounded-4xl border-2 border-white/20', className)}>
      <div className="glass m-2 flex grow flex-row items-center justify-start gap-16 overflow-hidden rounded-4xl border p-8">
        {imageSrc && (
          <img
            src={imageSrc}
            alt={imageAlt ?? ''}
            className="block h-auto max-h-full w-auto max-w-xs shrink-0 object-contain sm:max-w-sm md:max-w-md lg:max-w-lg"
          />
        )}
        <div className="flex min-w-0 flex-col items-start gap-4 text-balance">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-sm text-white/90">{description}</p>
          {buttonText && onButtonClick && (
            <Button type="button" className="mt-2 rounded-full px-4 py-2" onClick={onButtonClick}>
              {buttonText}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
