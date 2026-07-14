import { Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core'
import { PlusCircleIcon, RhUiAddIcon } from '@patternfly/react-icons'

import { AppRoute } from '../../../app/AppRoute'
import { navigate } from '../../../hooks/routing/navigate'

export function IntegrationEmptyState({ canCreate = true }: Readonly<{ canCreate?: boolean }>) {
  return (
    <EmptyState headingLevel="h2" icon={PlusCircleIcon} titleText="No integrations yet">
      <EmptyStateBody>
        Configure integrations to connect external tools and services for use in workflows.
      </EmptyStateBody>
      {canCreate && (
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button
              variant="primary"
              icon={<RhUiAddIcon />}
              onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}
            >
              Configure integration
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      )}
    </EmptyState>
  )
}
