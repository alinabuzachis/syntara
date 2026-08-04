import { Button, Popover } from '@patternfly/react-core'
import { RhUiQuestionMarkCircleIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'

import { APP_TITLE } from '../../../../utils/appTitle'

const helpIconStyle = { marginLeft: 'var(--pf-t--global--spacer--xs)', cursor: 'pointer' } as const

export function GroupMappingTableHead({
  showActionsColumn,
  showWildcardHelp,
}: Readonly<{ showActionsColumn: boolean; showWildcardHelp: boolean }>) {
  return (
    <Thead>
      <Tr>
        <Th width={45}>
          IdP group value
          {showWildcardHelp && (
            <Popover
              headerContent="Wildcard patterns"
              bodyContent={
                <>
                  {`Use wildcards to match multiple IdP groups to a single ${APP_TITLE} group:`}
                  <br />
                  <br />
                  <strong>*</strong> — matches everything (e.g. assign all users)
                  <br />
                  <strong>admin*</strong> — matches admin-prod, admin-staging, etc.
                  <br />
                  <strong>*/engineers</strong> — matches org1/engineers, org2/engineers
                  <br />
                  <strong>?</strong> — matches a single character
                </>
              }
            >
              <Button
                variant="plain"
                aria-label="Wildcard patterns help"
                isInline
                style={{ ...helpIconStyle, verticalAlign: 'middle', lineHeight: 1, padding: 0 }}
              >
                <RhUiQuestionMarkCircleIcon />
              </Button>
            </Popover>
          )}
        </Th>
        <Th width={45}>{`${APP_TITLE} group`}</Th>
        {showActionsColumn && <Th width={10} screenReaderText="Actions" />}
      </Tr>
    </Thead>
  )
}
