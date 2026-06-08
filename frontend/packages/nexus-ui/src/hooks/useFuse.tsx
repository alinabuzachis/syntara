import Fuse, { type FuseOptionKey } from 'fuse.js'
import { useMemo, useState } from 'react'

const FUSE_THRESHOLD = 0.7

export function useFuse<T>(sourceItems: T[], keys: FuseOptionKey<T>[]) {
  const [search, setSearch] = useState('')

  const fuse = useMemo(
    () =>
      new Fuse(sourceItems, {
        keys,
        threshold: FUSE_THRESHOLD,
        useTokenSearch: true,
      }),
    [sourceItems, keys]
  )

  const items = useMemo(
    () => (search ? fuse.search(search).map((result) => result.item) : sourceItems),
    [search, sourceItems, fuse]
  )

  return { search, setSearch, items }
}
