import { describe, it, expect } from 'vitest'

// Import all exports from the barrel file to verify they're properly exported
// and to prevent knip from reporting the barrel file as unused
import { BooleanFilter, DateRangeFilter, FilterBar, LabelFilter, SelectFilter, TextFilter } from './index'

describe('Filter Component Barrel Exports', () => {
  it('should export all filter components', () => {
    // Verify all components are defined
    expect(BooleanFilter).toBeDefined()
    expect(DateRangeFilter).toBeDefined()
    expect(FilterBar).toBeDefined()
    expect(LabelFilter).toBeDefined()
    expect(SelectFilter).toBeDefined()
    expect(TextFilter).toBeDefined()
  })
})
