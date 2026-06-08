import type { ExecutionsAPI } from '@ansible/nexus-contracts'

import { mockDate } from './mockDates'

type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

/**
 * Sample activity execution data for mock API.
 * Keyed by execution ID, values are arrays of ActivityExecution for that execution.
 *
 * These match the workflow node IDs from the example YAML files:
 * - exec-1 and exec-2 map to workflow '1' (hello-world): nodes say_hello, say_goodbye
 * - exec-5 maps to workflow '2' (conditional-demo): nodes check_temperature, temperature_routing, hot_weather
 */
export const activityExecutions: Record<string, ActivityExecution[]> = {
  'exec-1': [
    {
      id: 'act-1-1',
      created_at: mockDate.daysAgo2,
      updated_at: mockDate.daysAgo2Plus2500ms,
      execution_id: 'exec-1',
      activity_name: 'say_hello',
      status: 'completed',
      started_at: mockDate.daysAgo2Plus1s,
      completed_at: mockDate.daysAgo2Plus2500ms,
      input_data: {
        GREETING: 'Hello',
        WORLD_NAME: 'World',
      } as Record<string, unknown>,
      output_data: {
        stdout: 'Hello, World!\nCurrent time: 2025-04-08T10:00:01Z',
        exit_code: 0,
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
    {
      id: 'act-1-2',
      created_at: mockDate.daysAgo2Plus2500ms,
      updated_at: mockDate.daysAgo2Plus4s,
      execution_id: 'exec-1',
      activity_name: 'say_goodbye',
      status: 'completed',
      started_at: mockDate.daysAgo2Plus2500ms,
      completed_at: mockDate.daysAgo2Plus4s,
      input_data: {
        FAREWELL: 'Goodbye',
      } as Record<string, unknown>,
      output_data: {
        stdout: 'Goodbye, World!',
        exit_code: 0,
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
  ],
  'exec-2': [
    {
      id: 'act-2-1',
      created_at: mockDate.daysAgo1,
      updated_at: mockDate.daysAgo1Plus1500ms,
      execution_id: 'exec-2',
      activity_name: 'say_hello',
      status: 'completed',
      started_at: mockDate.daysAgo1Plus1s,
      completed_at: mockDate.daysAgo1Plus1500ms,
      input_data: {
        GREETING: 'Hello',
        WORLD_NAME: 'World',
      } as Record<string, unknown>,
      output_data: {
        stdout: 'Hello, World!\nCurrent time: 2025-04-09T14:30:00Z',
        exit_code: 0,
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
    {
      id: 'act-2-2',
      created_at: mockDate.daysAgo1Plus1500ms,
      updated_at: mockDate.daysAgo1Plus2500ms,
      execution_id: 'exec-2',
      activity_name: 'say_goodbye',
      status: 'completed',
      started_at: mockDate.daysAgo1Plus1500ms,
      completed_at: mockDate.daysAgo1Plus2500ms,
      input_data: {
        FAREWELL: 'Goodbye',
      } as Record<string, unknown>,
      output_data: {
        stdout: 'Goodbye, World!',
        exit_code: 0,
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
  ],
  'exec-5': [
    {
      id: 'act-5-1',
      created_at: mockDate.daysAgo3,
      updated_at: mockDate.daysAgo3Plus2s,
      execution_id: 'exec-5',
      activity_name: 'check_temperature',
      status: 'completed',
      started_at: mockDate.daysAgo3Plus1s,
      completed_at: mockDate.daysAgo3Plus2s,
      input_data: {
        temp: 42,
      } as Record<string, unknown>,
      output_data: {
        temp_value: '42',
        stdout: 'Current temperature: 42°C\nChecked at: 2025-04-07T08:00:00Z',
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
    {
      id: 'act-5-2',
      created_at: mockDate.daysAgo3Plus2s,
      updated_at: mockDate.daysAgo3Plus2500ms,
      execution_id: 'exec-5',
      activity_name: 'temperature_routing',
      status: 'completed',
      started_at: mockDate.daysAgo3Plus2s,
      completed_at: mockDate.daysAgo3Plus2500ms,
      input_data: {
        temperature: 42,
      } as Record<string, unknown>,
      output_data: {
        branch: 'true',
        condition_result: true,
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
    {
      id: 'act-5-3',
      created_at: mockDate.daysAgo3Plus2500ms,
      updated_at: mockDate.daysAgo3Plus4s,
      execution_id: 'exec-5',
      activity_name: 'hot_weather',
      status: 'completed',
      started_at: mockDate.daysAgo3Plus2500ms,
      completed_at: mockDate.daysAgo3Plus4s,
      input_data: {
        temperature: 42,
      } as Record<string, unknown>,
      output_data: {
        stdout: 'It is hot! Stay hydrated.',
        recommendation: 'Stay indoors and drink water',
      } as Record<string, unknown>,
      error_details: null,
      retry_count: 0,
      iteration: null,
    },
  ],
}
