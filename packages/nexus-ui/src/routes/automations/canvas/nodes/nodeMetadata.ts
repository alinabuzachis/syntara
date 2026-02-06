import {
  RhUiRobotIcon,
  RhUiMergeNodesIcon,
  RhUiCodeIcon,
  RhUiCalendarIcon,
  RhUiPlayIcon,
  RhUiPlugFillIcon,
  RhUiServerFillIcon,
  RhUiConditionNodeIcon,
  RhUiLoopIcon,
  RhUiUserCheckIcon,
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
    icon: RhUiPlayIcon,
    label: 'Trigger',
    disableTarget: true,
    expandable: false,
  },
  scheduledTrigger: {
    icon: RhUiCalendarIcon,
    label: 'Trigger',
    disableTarget: true,
    expandable: false,
  },
  task: {
    label: 'Task',
    expandable: true,
  },
  condition: {
    icon: RhUiConditionNodeIcon,
    label: 'Condition',
    expandable: true,
  },
  loop: {
    icon: RhUiLoopIcon,
    label: 'Loop',
    enableEnd: true,
    expandable: false,
  },
  parallel: {
    label: 'Parallel',
    expandable: false,
  },
  converge: {
    icon: RhUiMergeNodesIcon,
    label: 'Converge',
    expandable: false,
  },
}

// Task executor metadata - different tasks have different icons
export const executorMetadata: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  script: { icon: RhUiCodeIcon, label: 'Script' },
  agentic: { icon: RhUiRobotIcon, label: 'Agentic' },
  api: { icon: RhUiServerFillIcon, label: 'REST Api' },
  connector: { icon: RhUiPlugFillIcon, label: 'Connector' },
  aap_job_template: { icon: AnsibleIcon, label: 'AAP Job' },
  approval: { icon: RhUiUserCheckIcon, label: 'Approval' }, // Human approval gate
}
