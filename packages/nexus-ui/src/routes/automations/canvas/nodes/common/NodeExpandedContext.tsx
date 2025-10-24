import { createContext, type Dispatch, type SetStateAction } from 'react'

export const NodeExpandedContext = createContext<[boolean, Dispatch<SetStateAction<boolean>>] | null>(null)
