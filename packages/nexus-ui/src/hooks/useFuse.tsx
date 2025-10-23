import Fuse, { type FuseOptionKey } from 'fuse.js'
import { useState } from 'react'

export function useFuse<T>(sourceItems: T[], keys: FuseOptionKey<T>[]) {
  const [search, setSearch] = useState('')

  const fuse = new Fuse(sourceItems, {
    keys,
    threshold: 0.7,
  })
  const items = search ? fuse.search(search).map((result) => result.item) : sourceItems
  return { search, setSearch, items }
}
