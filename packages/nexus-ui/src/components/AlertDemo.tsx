import { useAlerts } from './alerts'

/**
 * Demo component to showcase Alert functionality
 * Can be used to test different alert variants
 */
export function AlertDemo() {
  const { showSuccess, showError, showWarning, showInfo } = useAlerts()

  return (
    <div className="flex flex-col gap-4 p-8">
      <h2 className="text-2xl font-bold">Alert Demo</h2>
      <p className="text-sm text-white/60">Click buttons to see different alert types</p>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-green-500/70 px-4 py-2 text-sm transition-colors hover:bg-green-500/90"
          onClick={() => showSuccess('This is a success message!', 'Success')}
        >
          Show Success Alert
        </button>

        <button
          className="rounded-lg bg-red-500/70 px-4 py-2 text-sm transition-colors hover:bg-red-500/90"
          onClick={() => showError('Something went wrong!', 'Error')}
        >
          Show Error Alert
        </button>

        <button
          className="rounded-lg bg-yellow-500/70 px-4 py-2 text-sm transition-colors hover:bg-yellow-500/90"
          onClick={() => showWarning('Please be careful!', 'Warning')}
        >
          Show Warning Alert
        </button>

        <button
          className="rounded-lg bg-blue-500/70 px-4 py-2 text-sm transition-colors hover:bg-blue-500/90"
          onClick={() => showInfo('Here is some information.', 'Info')}
        >
          Show Info Alert
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-white/20 bg-white/5 p-4">
        <h3 className="mb-2 font-semibold">Alert Features:</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-white/80">
          <li>Auto-dismissal after 5 seconds (success, warning, info)</li>
          <li>Manual dismissal with close button</li>
          <li>Errors stay until manually dismissed</li>
          <li>Smooth slide-in animation</li>
          <li>Stacked alerts support</li>
          <li>Icon variants per alert type</li>
        </ul>
      </div>
    </div>
  )
}
