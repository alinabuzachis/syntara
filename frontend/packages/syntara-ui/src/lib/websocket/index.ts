/**
 * WebSocket Infrastructure
 *
 * Pure Zustand architecture - single source of truth.
 *
 * @example
 * import { useWebSocket } from '../lib/websocket'
 *
 * const executionChannel = { id: 'execution_123', path: '/ws/workflows/v1/executions/123' }
 *
 * const { sendRaw, isConnected } = useWebSocket(executionChannel, {
 *   onMessage: (msg) => console.log(msg),
 * })
 */

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
