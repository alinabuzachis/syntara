import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from './components/ErrorBoundary'
import { registerAllNodes } from './routes/builder/registry/nodes'

import './index.css'

// Register all workflow node types before app initialization
registerAllNodes()

const App = lazy(() => import('./app/App.js'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-[rgb(27,27,33)]">
            <div className="glass rounded-full p-2">
              <svg className="h-16 w-16 animate-spin text-white" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </div>
        }
      >
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>
)
