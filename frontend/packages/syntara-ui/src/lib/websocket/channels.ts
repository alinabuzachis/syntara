/**
 * WebSocket Channel Definitions
 *
 * Centralized configuration for all WebSocket channels.
 * Each channel defines its ID and backend endpoint path.
 */

// ============================================================================
// Channel Configuration
// ============================================================================

export const WebSocketChannel = {
  /** Coffee demo - send text, receive coffee words */
  Coffee: { id: 'coffee', path: '/ws/example/v1/coffee' },

  /** Chat demo - bidirectional chat with echo */
  Chat: { id: 'chat', path: '/ws/example/v1/chat' },

  /** Agent events - subscribe to log/progress groups */
  AgentEvents: { id: 'agent_events', path: '/ws/example/v1/agent_events' },

  /** Tokens - receive-only streaming */
  Tokens: { id: 'tokens', path: '/ws/example/v1/tokens' },

  /**
   * Execution streaming - real-time activity updates
   * Dynamic path - use buildExecutionChannelPath() to construct
   */
  ExecutionBase: { id: 'execution', path: '/ws/workflows/v1/executions' },
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build execution streaming channel path with optional replay parameter
 *
 * @param executionId - Workflow execution ID
 * @param replay - Optional replay parameter (0 for beginning, event_id for specific point)
 * @returns Channel configuration for execution streaming
 *
 * @example
 * ```ts
 * // Stream from beginning
 * const channel = buildExecutionChannelPath('exec-123', '0')
 *
 * // Stream from specific event
 * const channel = buildExecutionChannelPath('exec-123', '1691431234567-5')
 *
 * // Live streaming only (no replay)
 * const channel = buildExecutionChannelPath('exec-123')
 * ```
 */
export function buildExecutionChannelPath(executionId: string, replay?: string): WebSocketChannelConfig {
  const basePath = `${WebSocketChannel.ExecutionBase.path}/${executionId}`
  const path = replay ? `${basePath}?replay=${replay}` : basePath

  return {
    id: `execution_${executionId}`,
    path,
  } as unknown as WebSocketChannelConfig
}

// ============================================================================
// Types
// ============================================================================

/** Type for a channel configuration */
export type WebSocketChannelConfig = (typeof WebSocketChannel)[keyof typeof WebSocketChannel]

/** Type for channel IDs */
export type WebSocketChannelId = WebSocketChannelConfig['id']
