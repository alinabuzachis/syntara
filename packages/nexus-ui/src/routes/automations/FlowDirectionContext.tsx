import { createContext } from 'react'

type FlowDirection = 'TB' | 'LR'
export const FlowDirectionContext = createContext<[FlowDirection, React.Dispatch<React.SetStateAction<FlowDirection>>]>(
  ['TB', () => {}]
)
