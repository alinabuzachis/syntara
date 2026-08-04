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
export type ChannelState = {
  socket: WebSocket | null
  url: string
  /** Original path before ticket was appended (used for reconnection with fresh tickets) */
  basePath?: string
  state: ConnectionState
  reconnectAttempts: number
  reconnectTimeout?: ReturnType<typeof setTimeout>
  error?: string
}

// ============================================================================
// Message Types
// ============================================================================

/** Generic WebSocket message structure */
export type WebSocketMessage<T = unknown> = {
  type: string
  payload: T
  timestamp?: number
  channel?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Reconnection configuration */
export type ReconnectionConfig = {
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  maxAttempts: number
}

/** WebSocket configuration */
export type WebSocketConfig = {
  baseUrl: string
  reconnection: ReconnectionConfig
}

function getDefaultWsUrl(): string {
  if (typeof globalThis.location !== 'undefined') {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${globalThis.location.host}`
  }
  return 'ws://localhost:3000'
}

/** Default configuration values */
export const DEFAULT_CONFIG: WebSocketConfig = {
  baseUrl: (import.meta.env.VITE_WS_URL as string | undefined) || getDefaultWsUrl(),
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
export type SubscriberOptions<T = unknown> = {
  onMessage?: MessageCallback<T>
  onStateChange?: StateChangeCallback
  messageTypes?: string[]
}
