import { PlayCircleIcon, SplitIcon, RepeatIcon, MergeIcon, BrainIcon, FileTerminalIcon, GlobeIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export interface NodeMetadata {
  icon?: ComponentType<{ className?: string }>
  label: string
  className?: string
  disableTarget?: boolean
  enableEnd?: boolean
  enableStart?: boolean
  expandable?: boolean
}

export const nodeMetadata: Record<string, NodeMetadata> = {
  trigger: {
    icon: PlayCircleIcon,
    label: 'Trigger',
    className: 'rounded-4xl rounded-l-[48px] border-l-8 pl-2',
    disableTarget: true,
    expandable: false,
  },
  task: {
    label: 'Task',
    className: 'rounded-3xl',
    expandable: true,
  },
  condition: {
    icon: SplitIcon,
    label: 'Condition',
    className: 'rounded-4xl',
    expandable: true,
  },
  loop: {
    icon: RepeatIcon,
    label: 'Loop',
    className: 'rounded-4xl',
    enableEnd: true,
    enableStart: true,
    expandable: false,
  },
  parallel: {
    label: 'Parallel',
    className: 'rounded-4xl',
    expandable: false,
  },
  join: {
    icon: MergeIcon,
    label: 'Join',
    className: 'rounded-3xl',
    expandable: false,
  },
}

// Task executor metadata - different tasks have different icons
export const executorMetadata: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  script: { icon: FileTerminalIcon, label: 'Script' },
  agentic: { icon: BrainIcon, label: 'Agentic' },
  api: { icon: GlobeIcon, label: 'API Call' },
}
