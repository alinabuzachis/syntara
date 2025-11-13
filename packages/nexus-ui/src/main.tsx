import '@ansible/nexus-ui-framework/style.css'
import { lazy, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerAllNodes } from './routes/builder/registry/nodes'

// Register all workflow node types before app initialization
registerAllNodes()

const App = lazy(() => import('./app/App.js'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
