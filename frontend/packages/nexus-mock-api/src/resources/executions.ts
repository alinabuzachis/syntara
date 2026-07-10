import type { Execution } from '@ansible/nexus-contracts'

import { mockDate } from './mockDates'

export const executions: Execution[] = [
  {
    id: 'exec-1',
    created_at: mockDate.daysAgo2,
    updated_at: mockDate.daysAgo2,
    workflow_id: '2',
    status: 'completed',
    started_at: mockDate.daysAgo2Plus1s,
    completed_at: mockDate.daysAgo2Plus5s,
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-2',
    created_at: mockDate.daysAgo1, // 1 day ago
    updated_at: mockDate.daysAgo1,
    workflow_id: '2',
    status: 'completed',
    started_at: mockDate.daysAgo1Plus1s,
    completed_at: mockDate.daysAgo1Plus3s,
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-3',
    created_at: mockDate.hoursAgo6, // 6 hours ago
    updated_at: mockDate.hoursAgo6,
    workflow_id: '1',
    status: 'failed',
    started_at: mockDate.hoursAgo6Plus1s,
    completed_at: mockDate.hoursAgo6Plus2s,
    started_by: 'user-2',
    input_data: {},
    error_details: 'Task execution failed: Connection timeout',
  },
  {
    id: 'exec-4',
    created_at: mockDate.hoursAgo2, // 2 hours ago
    updated_at: mockDate.minutesAgo30, // 30 minutes ago
    workflow_id: '1',
    status: 'running',
    started_at: mockDate.hoursAgo2Plus1s,
    completed_at: null,
    started_by: 'user-1',
    input_data: {},
    current_activities: [
      {
        activity_name: 'check_temperature',
        temporal_activity_id: 'activity-123',
        iteration: null,
      },
    ],
  },
  // Retry of exec-3 (failed run for workflow '1')
  {
    id: 'exec-3-retry',
    created_at: mockDate.hoursAgo1,
    updated_at: mockDate.hoursAgo1,
    workflow_id: '1',
    status: 'completed',
    started_at: mockDate.hoursAgo1,
    completed_at: mockDate.minutesAgo30,
    started_by: 'user-2',
    input_data: {},
    retried_from_execution_id: 'exec-3',
  },
  // Executions for workflow '1' (conditional-demo)
  {
    id: 'exec-5',
    created_at: mockDate.daysAgo3, // 3 days ago
    updated_at: mockDate.daysAgo3,
    workflow_id: '1',
    status: 'completed',
    started_at: mockDate.daysAgo3Plus1s,
    completed_at: mockDate.daysAgo3Plus8s,
    started_by: 'user-1',
    input_data: { value: 42 },
  },
  {
    id: 'exec-6',
    created_at: mockDate.hoursAgo12, // 12 hours ago
    updated_at: mockDate.hoursAgo12,
    workflow_id: '2',
    status: 'paused',
    approval_pending: false,
    started_at: mockDate.hoursAgo12Plus1s,
    completed_at: null,
    started_by: 'user-2',
    input_data: { value: 10 },
    current_activities: [
      {
        activity_name: 'say_hello',
        temporal_activity_id: 'activity-456',
        iteration: null,
      },
    ],
  },
  // Executions for workflow '3' (loop-demo)
  {
    id: 'exec-7',
    created_at: mockDate.daysAgo5, // 5 days ago
    updated_at: mockDate.daysAgo5,
    workflow_id: '3',
    status: 'completed',
    started_at: mockDate.daysAgo5Plus1s,
    completed_at: mockDate.daysAgo5Plus15s,
    started_by: 'user-1',
    input_data: { items: [1, 2, 3] },
  },
  {
    id: 'exec-8',
    created_at: mockDate.hoursAgo1, // 1 hour ago
    updated_at: mockDate.hoursAgo1,
    workflow_id: '3',
    status: 'cancelled',
    started_at: mockDate.hoursAgo1Plus1s,
    completed_at: mockDate.minutesAgo45, // 45 minutes ago
    started_by: 'user-3',
    input_data: { items: [1, 2, 3, 4, 5] },
  },
  // Executions for workflow '4' (parallel-demo)
  {
    id: 'exec-9',
    created_at: mockDate.daysAgo4, // 4 days ago
    updated_at: mockDate.daysAgo4,
    workflow_id: '4',
    status: 'completed',
    started_at: mockDate.daysAgo4Plus1s,
    completed_at: mockDate.daysAgo4Plus12s,
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-10',
    created_at: mockDate.minutesAgo30, // 30 minutes ago
    updated_at: mockDate.minutesAgo15, // 15 minutes ago
    workflow_id: '4',
    status: 'pending',
    started_at: null,
    completed_at: null,
    started_by: 'user-2',
    input_data: {},
  },
  // Execution for workflow '54' (deployment-approval) — waiting at approval gate
  {
    id: 'exec-approval',
    created_at: mockDate.minutesAgo10,
    updated_at: mockDate.minutesAgo10,
    workflow_id: '54',
    status: 'paused',
    approval_pending: true,
    started_at: mockDate.minutesAgo10,
    completed_at: null,
    started_by: 'user-1',
    input_data: { environment: 'production', version: '3.2.0' },
    current_activities: [
      {
        activity_name: 'approval_gate',
        temporal_activity_id: 'activity-approval-gate',
        iteration: null,
      },
    ],
  },
  // Execution for workflow '54' — running with parallel branch waiting at approval
  {
    id: 'exec-parallel-approval',
    created_at: mockDate.minutesAgo30,
    updated_at: mockDate.minutesAgo15,
    workflow_id: '54',
    status: 'running',
    approval_pending: true,
    started_at: mockDate.minutesAgo30,
    completed_at: null,
    started_by: 'user-2',
    input_data: { environment: 'staging', version: '3.1.0' },
    current_activities: [
      {
        activity_name: 'approval_gate',
        temporal_activity_id: 'activity-approval-parallel',
        iteration: null,
      },
    ],
  },
  // Execution for workflow '54' (deployment-approval) — completed with approval audit
  {
    id: 'exec-42',
    created_at: mockDate.hoursAgo3,
    updated_at: mockDate.hoursAgo3,
    workflow_id: '54',
    status: 'completed',
    started_at: mockDate.hoursAgo3,
    completed_at: mockDate.hoursAgo2Plus1s,
    started_by: 'user-1',
    input_data: { environment: 'production', version: '3.2.0' },
  },
]
