import {
  CompassPanel,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  SearchInput,
  StackItem,
} from '@patternfly/react-core'
import Fuse from 'fuse.js'
import { useState } from 'react'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'

import { useGlossaryTerms } from './useGlossaryTerms'

export default function Glossary() {
  const glossaryTerms = useGlossaryTerms()
  const [search, setSearch] = useState('')
  const fuse = new Fuse(glossaryTerms, {
    keys: [
      { name: 'term', weight: 0.7 },
      { name: 'definition', weight: 0.3 },
    ],
    threshold: 0.7,
  })
  const results = search ? fuse.search(search).map((result) => result.item) : glossaryTerms

  return (
    <AppPage>
      <AppPageHeader title="Glossary">
        <SearchInput
          placeholder="Search glossary..."
          value={search}
          onChange={(_event, value) => setSearch(value)}
          onClear={() => setSearch('')}
          style={{ width: '250px' }}
        />
      </AppPageHeader>
      {results.length === 0 ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <EmptyStateFilter clearAllFilters={() => setSearch('')} />
          </CompassPanel>
        </StackItem>
      ) : (
        <StackItem isFilled>
          <CompassPanel isFullHeight isScrollable>
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
          </CompassPanel>
        </StackItem>
      )}
    </AppPage>
  )
}
