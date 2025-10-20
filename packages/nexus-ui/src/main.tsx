import '@ansible/nexus-ui-framework/style.css'
import { lazy, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const App = lazy(() => import('./app/App.js'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
