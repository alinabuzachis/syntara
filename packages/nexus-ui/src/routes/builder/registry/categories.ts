import type { LucideIcon } from 'lucide-react'
import { BrainIcon, GitBranchIcon, PlayIcon, UserCheckIcon, ZapIcon } from 'lucide-react'

/**
 * Node category constants
 * Use these constants instead of string literals for type safety
 */
export const NodeCategories = {
  TRIGGER: 'trigger',
  ACTION: 'action',
  LOGIC: 'logic',
  INTEGRATION: 'integration',
  APPROVAL: 'approval',
  OTHER: 'other',
} as const

/**
 * Node category type derived from the constants
 */
export type NodeCategory = (typeof NodeCategories)[keyof typeof NodeCategories]

/**
 * Metadata for a node category
 */
export interface CategoryMetadata {
  /** Unique category identifier */
  id: NodeCategory
  /** Display label for the category */
  label: string
  /** Icon component for the category */
  icon: LucideIcon
  /** Description of what this category contains */
  description: string
  /** Display order (lower = earlier) */
  order: number
  /** Color theme for the category (for potential future use) */
  color?: string
}

/**
 * Complete metadata for all node categories
 * Single source of truth for category information
 */
export const CATEGORY_METADATA: Record<NodeCategory, CategoryMetadata> = {
  trigger: {
    id: NodeCategories.TRIGGER,
    label: 'Triggers',
    icon: PlayIcon,
    description: 'Start workflow execution with manual, scheduled, or event triggers',
    order: 1,
    color: 'blue',
  },
  action: {
    id: NodeCategories.ACTION,
    label: 'Actions',
    icon: ZapIcon,
    description: 'Execute tasks, run scripts, or make API calls',
    order: 2,
    color: 'purple',
  },
  logic: {
    id: NodeCategories.LOGIC,
    label: 'Logic & Control',
    icon: GitBranchIcon,
    description: 'Add conditional logic, branching, and flow control',
    order: 3,
    color: 'orange',
  },
  integration: {
    id: NodeCategories.INTEGRATION,
    label: 'Integrations',
    icon: BrainIcon,
    description: 'Connect to external services and platforms',
    order: 4,
    color: 'green',
  },
  approval: {
    id: NodeCategories.APPROVAL,
    label: 'Approvals',
    icon: UserCheckIcon,
    description: 'Require human approval before continuing',
    order: 5,
    color: 'yellow',
  },
  other: {
    id: NodeCategories.OTHER,
    label: 'Other',
    icon: ZapIcon,
    description: 'Miscellaneous nodes',
    order: 99,
    color: 'gray',
  },
}

/**
 * Get metadata for a specific category
 */
export function getCategoryMetadata(category: NodeCategory): CategoryMetadata {
  return CATEGORY_METADATA[category]
}

/**
 * Get all categories sorted by order
 */
export function getAllCategories(): CategoryMetadata[] {
  return Object.values(CATEGORY_METADATA).sort((a, b) => a.order - b.order)
}

/**
 * Check if a string is a valid category
 */
export function isValidCategory(category: string): category is NodeCategory {
  return Object.values(NodeCategories).includes(category as NodeCategory)
}
