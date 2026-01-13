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
} as const

// ============================================================================
// Types
// ============================================================================

/** Type for a channel configuration */
export type WebSocketChannelConfig = (typeof WebSocketChannel)[keyof typeof WebSocketChannel]

/** Type for channel IDs */
export type WebSocketChannelId = WebSocketChannelConfig['id']
