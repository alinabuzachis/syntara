import {
  PlayIcon,
  SplitIcon,
  RepeatIcon,
  MergeIcon,
  BrainIcon,
  CurlyBracesIcon,
  CloudCogIcon,
  PlugIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'

// @ts-expect-error - SVG import as React component
import AnsibleIcon from '../../../../assets/ansible-light.svg?react'

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
    icon: PlayIcon,
    label: 'Trigger',
    className: 'w-node-trigger rounded-l-full min-h-[80px]',
    disableTarget: true,
    expandable: false,
  },
  task: {
    label: 'Task',
    className: 'w-node rounded-3xl',
    expandable: true,
  },
  condition: {
    icon: SplitIcon,
    label: 'Condition',
    className: 'w-node rounded-4xl',
    expandable: true,
  },
  loop: {
    icon: RepeatIcon,
    label: 'Loop',
    className: 'w-node rounded-4xl',
    enableEnd: true,
    expandable: false,
  },
  parallel: {
    label: 'Parallel',
    className: 'w-node rounded-4xl',
    expandable: false,
  },
  converge: {
    icon: MergeIcon,
    label: 'Converge',
    className: 'w-node rounded-3xl',
    expandable: false,
  },
}

// Task executor metadata - different tasks have different icons
export const executorMetadata: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  script: { icon: CurlyBracesIcon, label: 'Script' },
  agentic: { icon: BrainIcon, label: 'Agentic' },
  api: { icon: CloudCogIcon, label: 'REST Api' },
  connector: { icon: PlugIcon, label: 'Connector' },
  aap: { icon: AnsibleIcon, label: 'AAP Job' }, // Ansible Automation Platform
}
