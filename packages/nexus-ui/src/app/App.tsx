import { AppHeader } from './AppHeader'
import { AppLogin } from './AppLogin'
import { AppRouter } from './AppRouter'

export default function App() {
  return (
    <AppLogin>
      <AppHeader />
      <AppRouter />
    </AppLogin>
  )
}
