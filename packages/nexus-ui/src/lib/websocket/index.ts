/**
 * WebSocket Infrastructure
 *
 * Pure Zustand architecture - single source of truth.
 *
 * @example
 * import { useWebSocket, WebSocketChannel } from '../lib/websocket'
 *
 * const { sendRaw, isConnected } = useWebSocket(WebSocketChannel.Chat, {
 *   onMessage: (msg) => console.log(msg),
 * })
 */

// ============================================================================
// Channels
// ============================================================================

export { WebSocketChannel, type WebSocketChannelConfig, type WebSocketChannelId } from './channels'

// ============================================================================
// Types
// ============================================================================

export type {
  ConnectionState,
  ChannelState,
  WebSocketMessage,
  WebSocketConfig,
  ReconnectionConfig,
  MessageCallback,
  StateChangeCallback,
  SubscriberOptions,
} from './types'

export { DEFAULT_CONFIG } from './types'

// ============================================================================
// Hooks (Primary API)
// ============================================================================

export {
  useWebSocket,
  useWebSocketState,
  useIsWebSocketConnected,
  type UseWebSocketOptions,
  type UseWebSocketReturn,
} from './hooks'

// ============================================================================
// Store (Advanced Usage)
// ============================================================================

export { useWebSocketStore, selectConnectionState, selectIsConnected, selectError } from './store'

// ============================================================================
// Utilities
// ============================================================================

export {
  getConnectionStateLabel,
  getConnectionStateColor,
  isActiveState,
  isConnectingState,
  isFailedState,
} from './utils'
