import type { Execution } from '@ansible/nexus-contracts'

import { mockDate } from './mockDates'

export const executions: Execution[] = [
  {
    id: 'exec-1',
    createdAt: mockDate.daysAgo2,
    updatedAt: mockDate.daysAgo2,
    workflow_id: '1',
    status: 'completed',
    started_at: mockDate.daysAgo2Plus1s,
    completed_at: mockDate.daysAgo2Plus5s,
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-2',
    createdAt: mockDate.daysAgo1, // 1 day ago
    updatedAt: mockDate.daysAgo1,
    workflow_id: '1',
    status: 'completed',
    started_at: mockDate.daysAgo1Plus1s,
    completed_at: mockDate.daysAgo1Plus3s,
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-3',
    createdAt: mockDate.hoursAgo6, // 6 hours ago
    updatedAt: mockDate.hoursAgo6,
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
    createdAt: mockDate.hoursAgo2, // 2 hours ago
    updatedAt: mockDate.minutesAgo30, // 30 minutes ago
    workflow_id: '1',
    status: 'running',
    started_at: mockDate.hoursAgo2Plus1s,
    completed_at: null,
    started_by: 'user-1',
    input_data: {},
    current_activities: [
      {
        activity_name: 'hello-world-task',
        temporal_activity_id: 'activity-123',
        iteration: null,
      },
    ],
  },
  // Executions for workflow-2 (basic/conditional-demo.yaml)
  {
    id: 'exec-5',
    createdAt: mockDate.daysAgo3, // 3 days ago
    updatedAt: mockDate.daysAgo3,
    workflow_id: '2',
    status: 'completed',
    started_at: mockDate.daysAgo3Plus1s,
    completed_at: mockDate.daysAgo3Plus8s,
    started_by: 'user-1',
    input_data: { value: 42 },
  },
  {
    id: 'exec-6',
    createdAt: mockDate.hoursAgo12, // 12 hours ago
    updatedAt: mockDate.hoursAgo12,
    workflow_id: '2',
    status: 'paused',
    started_at: mockDate.hoursAgo12Plus1s,
    completed_at: null,
    started_by: 'user-2',
    input_data: { value: 10 },
    current_activities: [
      {
        activity_name: 'check-value-task',
        temporal_activity_id: 'activity-456',
        iteration: null,
      },
    ],
  },
  // Executions for workflow-3 (basic/loop-demo.yaml)
  {
    id: 'exec-7',
    createdAt: mockDate.daysAgo5, // 5 days ago
    updatedAt: mockDate.daysAgo5,
    workflow_id: '3',
    status: 'completed',
    started_at: mockDate.daysAgo5Plus1s,
    completed_at: mockDate.daysAgo5Plus15s,
    started_by: 'user-1',
    input_data: { items: [1, 2, 3] },
  },
  {
    id: 'exec-8',
    createdAt: mockDate.hoursAgo1, // 1 hour ago
    updatedAt: mockDate.hoursAgo1,
    workflow_id: '3',
    status: 'cancelled',
    started_at: mockDate.hoursAgo1Plus1s,
    completed_at: mockDate.minutesAgo45, // 45 minutes ago
    started_by: 'user-3',
    input_data: { items: [1, 2, 3, 4, 5] },
  },
  // Executions for workflow-4 (basic/parallel-demo.yaml)
  {
    id: 'exec-9',
    createdAt: mockDate.daysAgo4, // 4 days ago
    updatedAt: mockDate.daysAgo4,
    workflow_id: '4',
    status: 'completed',
    started_at: mockDate.daysAgo4Plus1s,
    completed_at: mockDate.daysAgo4Plus12s,
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-10',
    createdAt: mockDate.minutesAgo30, // 30 minutes ago
    updatedAt: mockDate.minutesAgo15, // 15 minutes ago
    workflow_id: '4',
    status: 'pending',
    started_at: null,
    completed_at: null,
    started_by: 'user-2',
    input_data: {},
  },
]
