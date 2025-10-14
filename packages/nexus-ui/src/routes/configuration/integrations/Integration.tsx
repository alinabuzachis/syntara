import type { Tools } from 'nexus-contracts'

export interface Integration {
  id: number
  name: string
  type: string
  description?: string
  status?: 'connected' | 'disconnected'
  url?: string
}

export type Tool = Tools.components['schemas']['Tool']
