import type { Execution } from '@ansible/nexus-contracts'

// Generate mock executions for workflows
// We'll create a few executions for each workflow to simulate run history
export const executions: Execution[] = [
  // Executions for workflow-1 (basic/hello-world.yaml)
  {
    id: 'exec-1',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    workflow_id: '1',
    status: 'completed',
    started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5000).toISOString(),
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-2',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    workflow_id: '1',
    status: 'completed',
    started_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 3000).toISOString(),
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-3',
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    workflow_id: '1',
    status: 'failed',
    started_at: new Date(Date.now() - 6 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 6 * 60 * 60 * 1000 + 2000).toISOString(),
    started_by: 'user-2',
    input_data: {},
    error_details: 'Task execution failed: Connection timeout',
  },
  {
    id: 'exec-4',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    workflow_id: '1',
    status: 'running',
    started_at: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1000).toISOString(),
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
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    workflow_id: '2',
    status: 'completed',
    started_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 8000).toISOString(),
    started_by: 'user-1',
    input_data: { value: 42 },
  },
  {
    id: 'exec-6',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    workflow_id: '2',
    status: 'paused',
    started_at: new Date(Date.now() - 12 * 60 * 60 * 1000 + 1000).toISOString(),
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
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    workflow_id: '3',
    status: 'completed',
    started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 15000).toISOString(),
    started_by: 'user-1',
    input_data: { items: [1, 2, 3] },
  },
  {
    id: 'exec-8',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    workflow_id: '3',
    status: 'cancelled',
    started_at: new Date(Date.now() - 1 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 minutes ago
    started_by: 'user-3',
    input_data: { items: [1, 2, 3, 4, 5] },
  },
  // Executions for workflow-4 (basic/parallel-demo.yaml)
  {
    id: 'exec-9',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    workflow_id: '4',
    status: 'completed',
    started_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    completed_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 12000).toISOString(),
    started_by: 'user-1',
    input_data: {},
  },
  {
    id: 'exec-10',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
    workflow_id: '4',
    status: 'pending',
    started_at: null,
    completed_at: null,
    started_by: 'user-2',
    input_data: {},
  },
]
