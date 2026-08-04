import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  SearchInput,
} from '@patternfly/react-core'
import { useMemo } from 'react'

import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxPageTitle } from '../../../components/NxPageTitle'
import { NxEmptyStateFilter } from '../../../components/states/NxEmptyStateFilter'
import { useFuse } from '../../../hooks/useFuse'

import { useGlossaryTerms } from './useGlossaryTerms'

const GLOSSARY_SEARCH_KEYS = [
  { name: 'term' as const, weight: 0.7 },
  { name: 'definition' as const, weight: 0.3 },
]

export default function Glossary() {
  const glossaryTerms = useGlossaryTerms()
  const memoizedTerms = useMemo(() => [...glossaryTerms], [glossaryTerms])
  const { search, setSearch, items: results } = useFuse(memoizedTerms, GLOSSARY_SEARCH_KEYS)

  return (
    <NxPage>
      <NxPageTitle segments={['Glossary']} />
      <NxPageHeader
        title="Glossary"
        toolbar={
          <SearchInput
            placeholder="Search glossary..."
            value={search}
            onChange={(_event, value) => setSearch(value)}
            onClear={() => setSearch('')}
            style={{ width: '16rem' }}
          />
        }
      />
      {results.length === 0 ? (
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxEmptyStateFilter clearAllFilters={() => setSearch('')} />
          </NxPanel>
        </NxPageBody>
      ) : (
        <NxPageBody>
          <NxPanel isFullHeight isScrollable>
            <DescriptionList>
              {results.map((result) => (
                <DescriptionListGroup key={result.term}>
                  <DescriptionListTerm>
                    <Content>{result.term}</Content>
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <Content>{result.definition}</Content>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ))}
            </DescriptionList>
          </NxPanel>
        </NxPageBody>
      )}
    </NxPage>
  )
}
