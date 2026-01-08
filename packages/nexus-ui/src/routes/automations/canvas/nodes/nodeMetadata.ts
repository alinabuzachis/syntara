import {
  BrainIcon,
  CodeBranchIcon,
  CodeIcon,
  PlayIcon,
  PluggedIcon,
  ServerIcon,
  SyncIcon,
  UserCheckIcon,
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
    disableTarget: true,
    expandable: false,
  },
  task: {
    label: 'Task',
    expandable: true,
  },
  condition: {
    icon: CodeBranchIcon,
    label: 'Condition',
    expandable: true,
  },
  loop: {
    icon: SyncIcon,
    label: 'Loop',
    enableEnd: true,
    expandable: false,
  },
  parallel: {
    label: 'Parallel',
    expandable: false,
  },
  converge: {
    icon: CodeBranchIcon,
    label: 'Converge',
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
  aap: { icon: AnsibleIcon, label: 'AAP Job' }, // Ansible Automation Platform (alternative key)
  approval: { icon: UserCheckIcon, label: 'Approval' }, // Human approval gate
}
