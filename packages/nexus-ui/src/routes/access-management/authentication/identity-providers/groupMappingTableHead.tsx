import { Button, Popover } from '@patternfly/react-core'
import { RhUiQuestionMarkCircleIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'

const helpIconStyle = { marginLeft: 'var(--pf-t--global--spacer--xs)', cursor: 'pointer' } as const

export function GroupMappingTableHead({
  showActionsColumn,
  showWildcardHelp,
}: Readonly<{ showActionsColumn: boolean; showWildcardHelp: boolean }>) {
  return (
    <Thead>
      <Tr>
        <Th width={45}>
          <span style={{ verticalAlign: 'middle' }}>IdP group value</span>
          {showWildcardHelp && (
            <Popover
              headerContent="Wildcard patterns"
              bodyContent={
                <>
                  Use wildcards to match multiple IdP groups to a single Nexus group:
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
        <Th width={45}>Automation Orchestrator group</Th>
        {showActionsColumn && <Th width={10} screenReaderText="Actions" />}
      </Tr>
    </Thead>
  )
}
