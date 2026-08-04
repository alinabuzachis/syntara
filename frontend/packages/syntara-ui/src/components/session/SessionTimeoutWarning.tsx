import { Button, Content, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'

import { useBlurOnOpen } from '../../hooks/useBlurOnOpen'
import { useSessionTimeout } from '../../hooks/useSessionTimeout'

const TITLE_ID = 'session-timeout-title'
const BODY_ID = 'session-timeout-body'

/**
 * Session timeout warning modal.
 *
 * Mounted inside the authenticated shell. When the user has been idle long
 * enough, a warning modal appears with a live countdown. "Continue session"
 * refreshes the JWT and resets the idle timer. "Log out" logs out immediately.
 *
 * Accessibility:
 * - `role="alertdialog"` so screen readers announce the modal immediately.
 * - `aria-live="assertive"` on the countdown so updates are announced.
 * - PatternFly `Modal` provides focus trapping and backdrop automatically.
 * - "Continue session" is the first focusable button (auto-focused by PF).
 */
export function SessionTimeoutWarning() {
  const { phase, remainingSeconds, continueSession, logOut } = useSessionTimeout()

  const isOpen = phase === 'warning'
  useBlurOnOpen(isOpen)

  return (
    <Modal
      isOpen={isOpen}
      onClose={undefined}
      onEscapePress={() => {}}
      variant="small"
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
      role="alertdialog"
    >
      <ModalHeader title="Your session is about to expire" titleIconVariant="warning" labelId={TITLE_ID} />
      <ModalBody id={BODY_ID}>
        <Content component="p" aria-live="assertive" aria-atomic="true">
          You will be logged out in <strong>{remainingSeconds}</strong> {remainingSeconds === 1 ? 'second' : 'seconds'}.
        </Content>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={continueSession}>
          Continue session
        </Button>
        <Button variant="link" onClick={logOut}>
          Log out
        </Button>
      </ModalFooter>
    </Modal>
  )
}
