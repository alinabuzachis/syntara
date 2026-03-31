/**
 * WebSocket Type Definitions
 *
 * All TypeScript types for the WebSocket infrastructure in one place.
 */

// ============================================================================
// Connection Types
// ============================================================================

/** Possible states for a WebSocket connection */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed'

/** State for a single channel */
export interface ChannelState {
  socket: WebSocket | null
  url: string
  state: ConnectionState
  reconnectAttempts: number
  reconnectTimeout?: ReturnType<typeof setTimeout>
  error?: string
}

// ============================================================================
// Message Types
// ============================================================================

/** Generic WebSocket message structure */
export interface WebSocketMessage<T = unknown> {
  type: string
  payload: T
  timestamp?: number
  channel?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Reconnection configuration */
export interface ReconnectionConfig {
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  maxAttempts: number
}

/** WebSocket configuration */
export interface WebSocketConfig {
  baseUrl: string
  reconnection: ReconnectionConfig
}

/** Default configuration values */
export const DEFAULT_CONFIG: WebSocketConfig = {
  baseUrl: (import.meta.env.VITE_WS_URL as string | undefined) || 'ws://localhost:8000',
  reconnection: {
    initialDelay: 100,
    maxDelay: 30000,
    backoffMultiplier: 2,
    maxAttempts: 10,
  },
}

// ============================================================================
// Callback Types
// ============================================================================

/** Callback for incoming messages */
export type MessageCallback<T = unknown> = (message: WebSocketMessage<T>) => void

/** Callback for connection state changes */
export type StateChangeCallback = (state: ConnectionState, channelId: string) => void

/** Subscriber options */
export interface SubscriberOptions<T = unknown> {
  onMessage?: MessageCallback<T>
  onStateChange?: StateChangeCallback
  messageTypes?: string[]
}
