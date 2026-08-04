import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'

type ShowAlert = (config: {
  title: string
  description?: string
  variant: 'success' | 'danger'
  autoDismiss?: boolean
}) => void

export function logoutWithAlert(logout: () => Promise<void>, showAlert: ShowAlert, title: string) {
  showAlert({ title, variant: 'success', autoDismiss: true })
  detachPromise(logout(), {
    onReject: (error: unknown) => {
      showAlert({
        title: 'Sign out failed',
        description: getErrorMessage(error),
        variant: 'danger',
        autoDismiss: false,
      })
    },
  })
}
