import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  SearchInput,
} from '@patternfly/react-core'
import { useMemo } from 'react'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppPanel } from '../../../components/AppPanel'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
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
    <AppPage>
      <AppPageHeader title="Glossary">
        <SearchInput
          placeholder="Search glossary..."
          value={search}
          onChange={(_event, value) => setSearch(value)}
          onClear={() => setSearch('')}
          style={{ width: '16rem' }}
        />
      </AppPageHeader>
      {results.length === 0 ? (
        <AppPageMain>
          <AppPanel isFullHeight>
            <EmptyStateFilter clearAllFilters={() => setSearch('')} />
          </AppPanel>
        </AppPageMain>
      ) : (
        <AppPageMain>
          <AppPanel isFullHeight isScrollable>
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
          </AppPanel>
        </AppPageMain>
      )}
    </AppPage>
  )
}
