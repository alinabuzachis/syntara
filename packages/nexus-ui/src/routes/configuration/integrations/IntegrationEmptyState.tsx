import { AppRoute } from '../../../app/AppRoute.tsx'
import { navigate } from 'wouter/use-browser-location'

export function IntegrationEmptyState() {
  return (
    <div className="flex grow flex-col overflow-hidden rounded-4xl border-2 border-white/20">
      <div className="glass m-2 flex grow items-center justify-center gap-4 rounded-4xl border p-8 text-balance">
        <div className="items-left flex grow flex-col gap-4 text-balance">
          <span className="text-lg font-bold text-white">
            <img
              src={'/src/assets/collage-circle-sparkles-window-server-dark-RH.png'}
              width="500"
              height="600"
              alt={'No '}
            />
          </span>
        </div>
        <div className="items-left flex grow flex-col gap-4 text-balance">
          <span className="text-lg font-bold text-white">No integrations have been configured yet.</span>
          <span className="text-sm text-white">
            Configure integrations to use them in automation. Integrations will allow for monitoring of server health
            and performance metrics, view server logs, and manage server settings and configurations.
          </span>
          <span>
            <button
              className="rounded-full bg-blue-400/70 px-4 py-1"
              onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}
            >
              Add Integration
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
