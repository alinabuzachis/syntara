import type { Approval } from '@ansible/nexus-contracts'

// Generate mock approvals matching the Approvals API spec
// Note: Using type assertions since contracts haven't been regenerated yet
// Structure includes:
// - Top-level name, description fields
// - execution_id, approval_node_id
// - workflow_context with workflow_version_id (uuid), workflow_name, inputs and previous_step
// - next_step_approved, next_step_rejected (ActivitySummary)
// - decided_by (UserReference with id and name), decided_at, decision_notes
// - timeout_at
const now = Date.now()

export const approvals: Approval[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440001',
    approval_node_id: 'approval-activity-1',
    name: 'AI Agent Decision',
    description:
      'AI agent has recommended deploying version 2.1.0 to production. Review the security scan results and deployment plan before approving.',
    status: 'pending',
    timeout_at: new Date(now + 22 * 60 * 60 * 1000).toISOString(), // 22 hours from now
    next_step_approved: {
      id: 'apply_changes',
      name: 'Apply Changes',
      type: 'task',
      description: 'Applies the reviewed changes to production environment',
    },
    next_step_rejected: {
      id: 'rollback',
      name: 'Rollback',
      type: 'task',
      description: 'Reverts to previous stable version',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440001',
      workflow_name: 'Basic Condition Then Else',
      inputs: {
        target_environment: 'production',
        version: '2.1.0',
        requested_by: 'alice@example.com',
      },
      previous_step: {
        id: 'security_scan',
        name: 'Security Scan',
        type: 'task',
        output: {
          vulnerabilities_found: 0,
          scan_duration_seconds: 120,
          scan_status: 'passed',
        },
      },
    },
    decided_by: null,
    decided_at: null,
    decision_notes: null,
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    updatedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440002',
    approval_node_id: 'approval-activity-2',
    name: 'AI Agent Decision',
    description: 'AI agent has recommended policy remediation actions. Review and approve to proceed.',
    status: 'approved',
    timeout_at: null,
    next_step_approved: {
      id: 'remediate_issues',
      name: 'Remediate Issues',
      type: 'task',
      description: 'Executes the recommended remediation steps',
    },
    next_step_rejected: {
      id: 'escalate',
      name: 'Escalate',
      type: 'task',
      description: 'Escalates to security team for manual review',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440001',
      workflow_name: 'Basic Condition Then Else',
      inputs: {
        policy_violations: ['missing_mfa', 'weak_password'],
        severity: 'high',
      },
      previous_step: {
        id: 'policy_check',
        name: 'Policy Check',
        type: 'task',
        output: {
          violations_found: 2,
          check_status: 'completed',
        },
      },
    },
    decided_by: {
      id: '770e8400-e29b-41d4-a716-446655440001',
      name: 'John Doe',
    },
    decided_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
    decision_notes: 'Approved after reviewing policy violations. Remediation plan looks good.',
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    createdAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    updatedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440003',
    approval_node_id: 'approval-activity-3',
    name: 'Manual Approval Required',
    description: 'Cost optimization workflow requires manual approval before proceeding with resource allocation.',
    status: 'rejected',
    timeout_at: null,
    next_step_approved: {
      id: 'allocate_resources',
      name: 'Allocate Resources',
      type: 'task',
      description: 'Allocates the requested compute resources',
    },
    next_step_rejected: null, // Rejection path ends the workflow
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440002',
      workflow_name: 'Basic Condition No Else Branch',
      inputs: {
        resource_type: 'compute',
        quantity: 10,
        region: 'us-east-1',
      },
      previous_step: {
        id: 'cost_analysis',
        name: 'Cost Analysis',
        type: 'task',
        output: {
          estimated_cost: 500.0,
          cost_breakdown: {
            compute: 400.0,
            storage: 100.0,
          },
        },
      },
    },
    decided_by: {
      id: '770e8400-e29b-41d4-a716-446655440002',
      name: 'Alice Smith',
    },
    decided_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    decision_notes: 'Rejected due to policy violation. Cost exceeds budget threshold.',
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    updatedAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440004',
    approval_node_id: 'approval-activity-4',
    name: 'Policy Server Validation',
    description: 'Policy server has flagged this change for review. Validate compliance before proceeding.',
    status: 'approved',
    timeout_at: null,
    next_step_approved: {
      id: 'deploy_changes',
      name: 'Deploy Changes',
      type: 'task',
    },
    next_step_rejected: {
      id: 'revert',
      name: 'Revert',
      type: 'task',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440003',
      workflow_name: 'Basic Condition Then Else',
      inputs: {
        change_type: 'configuration',
        environment: 'production',
      },
      previous_step: {
        id: 'policy_validation',
        name: 'Policy Validation',
        type: 'task',
        output: {
          compliance_score: 95,
          warnings: [],
        },
      },
    },
    decided_by: {
      id: '770e8400-e29b-41d4-a716-446655440001',
      name: 'John Doe',
    },
    decided_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
    decision_notes: 'Approved - all policies compliant',
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    createdAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    updatedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440005',
    approval_node_id: 'approval-activity-5',
    name: 'Ansible Playbook Execution',
    description: 'Ansible Automation Platform job execution requires approval before running in production.',
    status: 'rejected',
    timeout_at: null,
    next_step_approved: {
      id: 'run_playbook',
      name: 'Run Playbook',
      type: 'task',
    },
    next_step_rejected: {
      id: 'cancel',
      name: 'Cancel',
      type: 'task',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440004',
      workflow_name: 'Ansible Playbook Deployment',
      inputs: {
        playbook_name: 'deploy_app.yml',
        inventory: 'production',
      },
      previous_step: {
        id: 'validate_playbook',
        name: 'Validate Playbook',
        type: 'task',
        output: {
          validation_status: 'success',
          estimated_duration: '15 minutes',
        },
      },
    },
    decided_by: {
      id: '770e8400-e29b-41d4-a716-446655440002',
      name: 'Alice Smith',
    },
    decided_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
    decision_notes: 'Rejected due to cost concerns. Playbook would exceed monthly budget.',
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    createdAt: new Date(now - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    updatedAt: new Date(now - 30 * 60 * 1000).toISOString(),
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440006',
    approval_node_id: 'approval-activity-6',
    name: 'Standalone Approval Request',
    description: 'External system integration requires approval to proceed with data synchronization.',
    status: 'pending',
    timeout_at: new Date(now + 23 * 60 * 60 * 1000).toISOString(), // 23 hours from now
    next_step_approved: {
      id: 'sync_data',
      name: 'Sync Data',
      type: 'task',
    },
    next_step_rejected: null, // No rejection path
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440005',
      workflow_name: 'External System Sync',
      inputs: {
        external_system: 'crm',
        sync_type: 'full',
      },
      previous_step: {
        id: 'validate_connection',
        name: 'Validate Connection',
        type: 'task',
        output: {
          connection_status: 'success',
          records_found: 1500,
        },
      },
    },
    decided_by: null,
    decided_at: null,
    decision_notes: null,
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440007',
    createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    updatedAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440007',
    approval_node_id: 'approval-activity-7',
    name: 'Expired Approval Request',
    description: 'This approval request expired before a decision could be made.',
    status: 'expired',
    timeout_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago (expired)
    next_step_approved: {
      id: 'proceed',
      name: 'Proceed',
      type: 'task',
    },
    next_step_rejected: {
      id: 'abort',
      name: 'Abort',
      type: 'task',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440006',
      workflow_name: 'Scheduled Maintenance',
      inputs: {
        maintenance_window: '2025-01-15T02:00:00Z',
        duration_hours: 4,
      },
      previous_step: {
        id: 'schedule_check',
        name: 'Schedule Check',
        type: 'task',
        output: {
          conflicts: 0,
          available: true,
        },
      },
    },
    decided_by: null,
    decided_at: null,
    decision_notes: null,
  } as unknown as Approval,
  {
    id: '550e8400-e29b-41d4-a716-446655440008',
    createdAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    updatedAt: new Date(now - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440008',
    approval_node_id: 'approval-activity-8',
    name: 'Cancelled Approval Request',
    description: 'This approval was cancelled by the workflow engine (e.g., workflow was cancelled).',
    status: 'cancelled',
    timeout_at: null,
    next_step_approved: {
      id: 'deploy',
      name: 'Deploy',
      type: 'task',
    },
    next_step_rejected: {
      id: 'rollback',
      name: 'Rollback',
      type: 'task',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440007',
      workflow_name: 'Deployment Pipeline',
      inputs: {
        environment: 'staging',
        version: '1.2.3',
      },
      previous_step: {
        id: 'build',
        name: 'Build',
        type: 'task',
        output: {
          build_id: 'build-12345',
          status: 'success',
        },
      },
    },
    decided_by: {
      id: '770e8400-e29b-41d4-a716-446655440003',
      name: 'System',
    },
    decided_at: new Date(now - 30 * 60 * 1000).toISOString(),
    decision_notes: 'Cancelled due to workflow cancellation',
  } as unknown as Approval,
]
