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

// Channels
export { WebSocketChannel, type WebSocketChannelConfig, type WebSocketChannelId } from './channels'

// Types
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

// Hooks (Primary API)
export { useWebSocket, type UseWebSocketOptions, type UseWebSocketReturn } from './hooks'

// Utilities
export { getConnectionStateLabel, getConnectionStateColor } from './utils'
