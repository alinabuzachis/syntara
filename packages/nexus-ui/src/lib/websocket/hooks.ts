/**
 * WebSocket React Hooks
 *
 * React hooks for WebSocket connections.
 */

import { useCallback, useEffect, useRef } from 'react'

import type { WebSocketChannelConfig } from './channels'
import { useWebSocketStore, selectConnectionState, selectIsConnected, selectError } from './store'
import type { ConnectionState, WebSocketMessage } from './types'

// ============================================================================
// Hook Options
// ============================================================================

export type UseWebSocketOptions<T = unknown> = {
  /** Callback for incoming messages */
  onMessage?: (message: WebSocketMessage<T>) => void

  /** Filter messages by type */
  messageTypes?: string[]

  /** Callback for connection state changes */
  onStateChange?: (state: ConnectionState, channelId: string) => void

  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean

  /** Auto-disconnect on unmount (default: false) */
  autoDisconnect?: boolean
}

// ============================================================================
// Hook Return Type
// ============================================================================

export type UseWebSocketReturn = {
  /** Send a wrapped message ({ type, payload, timestamp }) */
  sendWrapped: <T = unknown>(message: WebSocketMessage<T>) => boolean
  /** Send raw data (no wrapping) */
  sendRaw: <T = unknown>(data: T) => boolean
  /** Current connection state */
  connectionState: ConnectionState
  /** Whether connected */
  isConnected: boolean
  /** Connect to channel */
  connect: () => void
  /** Disconnect from channel */
  disconnect: () => void
  /** Last error */
  error?: string
}

// ============================================================================
// useWebSocket Hook
// ============================================================================

/**
 * Main hook for WebSocket connections.
 *
 * @example Using a channel config
 * const chatChannel = { id: 'chat', path: '/ws/example/v1/chat' }
 *
 * const { sendRaw, isConnected } = useWebSocket(chatChannel, {
 *   onMessage: (msg) => console.log(msg),
 * })
 *
 * @example Using custom channel (not predefined)
 * const { sendRaw, isConnected } = useWebSocket(
 *   { id: 'custom', path: '/ws/custom/endpoint' },
 *   { onMessage: (msg) => console.log(msg) }
 * )
 */
export function useWebSocket<T = unknown>(
  channel: WebSocketChannelConfig,
  options: UseWebSocketOptions<T> = {}
): UseWebSocketReturn {
  const { id: channelId, path: url } = channel
  const { onMessage, messageTypes, onStateChange, autoConnect = true, autoDisconnect = false } = options

  // Store actions
  const storeConnect = useWebSocketStore((s) => s.connect)
  const storeDisconnect = useWebSocketStore((s) => s.disconnect)
  const storeSend = useWebSocketStore((s) => s.send)
  const storeSendRaw = useWebSocketStore((s) => s.sendRaw)
  const storeSubscribe = useWebSocketStore((s) => s.subscribe)

  // Store state
  const connectionState = useWebSocketStore(selectConnectionState(channelId))
  const isConnected = useWebSocketStore(selectIsConnected(channelId))
  const error = useWebSocketStore(selectError(channelId))

  // Refs for stable callbacks
  const onMessageRef = useRef(onMessage)
  const onStateChangeRef = useRef(onStateChange)

  // Keep refs in sync with latest callbacks
  useEffect(() => {
    onMessageRef.current = onMessage
    onStateChangeRef.current = onStateChange
  })

  // Auto-connect on mount, cleanup on unmount
  useEffect(() => {
    if (autoConnect && url) {
      storeConnect(channelId, url)
    }
    return () => {
      if (autoDisconnect) {
        storeDisconnect(channelId)
      }
    }
  }, [channelId, url, autoConnect, autoDisconnect, storeConnect, storeDisconnect])

  // Subscribe to messages
  useEffect(() => {
    if (!onMessageRef.current && !onStateChangeRef.current) return

    return storeSubscribe<T>(channelId, {
      onMessage: (msg) => onMessageRef.current?.(msg),
      onStateChange: onStateChangeRef.current,
      messageTypes,
    })
  }, [channelId, messageTypes, storeSubscribe])

  // Memoized actions
  const sendWrapped = useCallback(
    <M = unknown>(message: WebSocketMessage<M>) => storeSend(channelId, message),
    [channelId, storeSend]
  )

  const sendRaw = useCallback(<M = unknown>(data: M) => storeSendRaw(channelId, data), [channelId, storeSendRaw])

  const connect = useCallback(() => storeConnect(channelId, url), [channelId, url, storeConnect])

  const disconnect = useCallback(() => storeDisconnect(channelId), [channelId, storeDisconnect])

  return {
    sendWrapped,
    sendRaw,
    connectionState,
    isConnected,
    connect,
    disconnect,
    error,
  }
}

// ============================================================================
// Simple Hooks
// ============================================================================

/** Get connection state only (minimal re-renders) */
export function useWebSocketState(channelId: string): ConnectionState {
  return useWebSocketStore(selectConnectionState(channelId))
}

/** Check if connected (minimal re-renders) */
export function useIsWebSocketConnected(channelId: string): boolean {
  return useWebSocketStore(selectIsConnected(channelId))
}
