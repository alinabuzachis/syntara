import {
  BrainIcon,
  CodeBranchIcon,
  CodeIcon,
  PlayIcon,
  PluggedIcon,
  ServerIcon,
  SyncIcon,
} from '@patternfly/react-icons'
import type { ComponentType } from 'react'

import AnsibleIcon from '../../../../assets/ansible-automation-platform.svg?react'

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
    icon: CodeBranchIcon,
    label: 'Condition',
    className: 'w-node rounded-4xl',
    expandable: true,
  },
  loop: {
    icon: SyncIcon,
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
    icon: CodeBranchIcon,
    label: 'Converge',
    className: 'w-node rounded-3xl',
    expandable: false,
  },
}

// Task executor metadata - different tasks have different icons
export const executorMetadata: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  script: { icon: CodeIcon, label: 'Script' },
  agentic: { icon: BrainIcon, label: 'Agentic' },
  api: { icon: ServerIcon, label: 'REST Api' },
  connector: { icon: PluggedIcon, label: 'Connector' },
  aap_job_template: { icon: AnsibleIcon, label: 'AAP Job' },
}
