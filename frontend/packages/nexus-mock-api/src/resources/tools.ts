import type { Tool } from '@ansible/nexus-contracts'

function makeTool(id: string, integrationId: string, name: string, enabled = true): Tool {
  return {
    id,
    integration_id: integrationId,
    namespaced_name: name,
    name,
    enabled,
    status: enabled ? 'available' : 'missing',
    parameters: [],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  }
}

export const tools: Tool[] = [
  // '1' — GitHub Copilot
  makeTool('t1-1', '1', 'list_resources'),
  makeTool('t1-2', '1', 'get_resource'),
  makeTool('t1-3', '1', 'create_resource'),
  makeTool('t1-4', '1', 'update_resource'),
  makeTool('t1-5', '1', 'delete_resource'),
  makeTool('t1-6', '1', 'deprecated_sync', false), // disabled — exercises groupToolsByIntegration filter
  // '2' — Slack Bot
  makeTool('t2-1', '2', 'dev_tool_1'),
  makeTool('t2-2', '2', 'dev_tool_2'),
  makeTool('t2-3', '2', 'dev_tool_3'),
  // '3' — Jira Integration
  makeTool('t3-1', '3', 'stage_deploy'),
  makeTool('t3-2', '3', 'stage_rollback'),
]
