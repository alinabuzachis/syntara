import { Flex, FlexItem, Spinner } from '@patternfly/react-core'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from './components/ErrorBoundary'
import { registerAllNodes } from './routes/builder/registry/nodes'

import './index.css'

// Register all workflow node types before app initialization
registerAllNodes()

// eslint-disable-next-line react-refresh/only-export-components -- entry point, not a component module
const App = lazy(() => import('./app/App.js'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense
        fallback={
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            justifyContent={{ default: 'justifyContentCenter' }}
            style={{ height: '100vh', width: '100vw', backgroundColor: 'rgb(27, 27, 33)' }}
          >
            <FlexItem>
              <Spinner size="xl" aria-label="Loading application" />
            </FlexItem>
          </Flex>
        }
      >
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>
)
