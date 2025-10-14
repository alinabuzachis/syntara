import { LoaderCircleIcon } from 'lucide-react'

export function LoadingState() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="glass rounded-full p-2">
        <LoaderCircleIcon className="h-16 w-16 animate-spin" />
      </div>
    </div>
  )
}
