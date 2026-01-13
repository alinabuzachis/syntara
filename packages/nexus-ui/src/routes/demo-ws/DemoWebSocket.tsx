/**
 * WebSocket Demo Page
 *
 * Demonstrates the WebSocket infrastructure by connecting to the backend
 * example WebSocket channels: Coffee, Chat, Agent Events, and Tokens.
 */

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  CompassPanel,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Grid,
  GridItem,
  Label,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { ConnectedIcon, DisconnectedIcon, ExclamationCircleIcon, SyncAltIcon } from '@patternfly/react-icons'
import { useCallback, useState } from 'react'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import {
  useWebSocket,
  WebSocketChannel,
  getConnectionStateLabel,
  getConnectionStateColor,
  type ConnectionState,
} from '../../lib/websocket'

// ============================================================================
// Types
// ============================================================================

interface CoffeeResponse {
  output: string
  timestamp?: string
}

interface ChatResponse {
  reply: string
  type: 'echo' | 'random'
  timestamp?: string
}

interface AgentEvent {
  type: 'event'
  group: 'log' | 'progress'
  level?: 'debug' | 'info' | 'warning' | 'error'
  message: string
  progress?: number
  task?: string
  timestamp?: string
}

interface AgentEventsResponse {
  status: 'success'
  action: 'subscribe' | 'unsubscribe'
  groups: string[]
  timestamp?: string
}

interface TokenMessage {
  token: string
  sequence: number
  timestamp?: string
}

// ============================================================================
// Helper Components
// ============================================================================

function ConnectionStatusBadge({ state }: { state: ConnectionState }) {
  const color = getConnectionStateColor(state)
  const label = getConnectionStateLabel(state)

  const iconMap = {
    connected: <ConnectedIcon />,
    connecting: <SyncAltIcon className="pf-v6-u-icon-spin" />,
    reconnecting: <SyncAltIcon className="pf-v6-u-icon-spin" />,
    disconnected: <DisconnectedIcon />,
    failed: <ExclamationCircleIcon />,
  }

  const colorMap = {
    green: 'green',
    yellow: 'gold',
    red: 'red',
    gray: 'grey',
  } as const

  return (
    <Label color={colorMap[color]} icon={iconMap[state]}>
      {label}
    </Label>
  )
}

function MessageList({ messages, maxHeight = '200px' }: { messages: string[]; maxHeight?: string }) {
  return (
    <div
      style={{
        maxHeight,
        overflowY: 'auto',
        fontFamily: 'var(--pf-t--global--font--family--mono)',
        fontSize: 'var(--pf-t--global--font-size--sm)',
        backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
        padding: 'var(--pf-t--global--spacer--sm)',
        borderRadius: 'var(--pf-t--global--border--radius--small)',
      }}
    >
      {messages.length === 0 ? (
        <span style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)' }}>No messages yet...</span>
      ) : (
        messages.map((msg, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`${msg}-${i}`} style={{ marginBottom: '4px' }}>
            {msg}
          </div>
        ))
      )}
    </div>
  )
}

// ============================================================================
// Coffee Channel Demo
// ============================================================================

function CoffeeDemo() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  const { sendRaw, isConnected, connectionState, connect, disconnect } = useWebSocket<CoffeeResponse>(
    WebSocketChannel.Coffee,
    {
      autoConnect: false,
      onMessage: (msg) => {
        const timestamp = new Date().toLocaleTimeString()
        // Backend sends raw response: { output: "..." }
        const output = (msg as unknown as CoffeeResponse).output || msg.payload?.output
        if (output) {
          setMessages((prev) => [...prev, `[${timestamp}] ☕ ${output}`])
        }
      },
    }
  )

  const handleSend = useCallback(() => {
    if (input.trim() && isConnected) {
      // Backend expects raw format: { input: "..." }
      sendRaw({ input: input.trim() })
      setMessages((prev) => [...prev, `[${new Date().toLocaleTimeString()}] → Sent: "${input}"`])
      setInput('')
    }
  }, [input, isConnected, sendRaw])

  return (
    <Card>
      <CardHeader>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <CardTitle>☕ Coffee Channel</CardTitle>
          </FlexItem>
          <FlexItem>
            <ConnectionStatusBadge state={connectionState} />
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        <p
          style={{
            marginBottom: 'var(--pf-t--global--spacer--md)',
            color: 'var(--pf-t--global--color--nonstatus--gray--default)',
          }}
        >
          Send text to receive coffee-related words for each character.
        </p>
        <Form>
          <FormGroup>
            <Flex>
              <FlexItem grow={{ default: 'grow' }}>
                <TextInput
                  value={input}
                  onChange={(_e, val) => setInput(val)}
                  placeholder="Type something (e.g., 'hi')"
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  isDisabled={!isConnected}
                />
              </FlexItem>
              <FlexItem>
                <Button onClick={handleSend} isDisabled={!isConnected || !input.trim()}>
                  Send
                </Button>
              </FlexItem>
              <FlexItem>
                {isConnected ? (
                  <Button variant="secondary" onClick={disconnect}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="primary" onClick={connect}>
                    Connect
                  </Button>
                )}
              </FlexItem>
            </Flex>
          </FormGroup>
        </Form>
        <div style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
          <MessageList messages={messages} />
        </div>
      </CardBody>
    </Card>
  )
}

// ============================================================================
// Chat Channel Demo
// ============================================================================

function ChatDemo() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  const { sendRaw, isConnected, connectionState, connect, disconnect } = useWebSocket<ChatResponse>(
    WebSocketChannel.Chat,
    {
      autoConnect: false,
      onMessage: (msg) => {
        const timestamp = new Date().toLocaleTimeString()
        // Backend sends raw response: { reply: "...", type: "echo"|"random" }
        const response = msg as unknown as ChatResponse
        const reply = response.reply || msg.payload?.reply
        const msgType = response.type || msg.payload?.type
        if (reply) {
          const icon = msgType === 'random' ? '🤖' : '💬'
          setMessages((prev) => [...prev, `[${timestamp}] ${icon} ${reply}`])
        }
      },
    }
  )

  const handleSend = useCallback(() => {
    if (message.trim() && isConnected) {
      // Backend expects raw format: { message: "..." }
      sendRaw({ message: message.trim() })
      setMessages((prev) => [...prev, `[${new Date().toLocaleTimeString()}] → You: ${message}`])
      setMessage('')
    }
  }, [message, isConnected, sendRaw])

  return (
    <Card>
      <CardHeader>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <CardTitle>💬 Chat Channel</CardTitle>
          </FlexItem>
          <FlexItem>
            <ConnectionStatusBadge state={connectionState} />
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        <p
          style={{
            marginBottom: 'var(--pf-t--global--spacer--md)',
            color: 'var(--pf-t--global--color--nonstatus--gray--default)',
          }}
        >
          Bidirectional chat with uppercase echo. Server sends random messages every 3 seconds.
        </p>
        <Form>
          <FormGroup>
            <Flex>
              <FlexItem grow={{ default: 'grow' }}>
                <TextInput
                  value={message}
                  onChange={(_e, val) => setMessage(val)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  isDisabled={!isConnected}
                />
              </FlexItem>
              <FlexItem>
                <Button onClick={handleSend} isDisabled={!isConnected || !message.trim()}>
                  Send
                </Button>
              </FlexItem>
              <FlexItem>
                {isConnected ? (
                  <Button variant="secondary" onClick={disconnect}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="primary" onClick={connect}>
                    Connect
                  </Button>
                )}
              </FlexItem>
            </Flex>
          </FormGroup>
        </Form>
        <div style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
          <MessageList messages={messages} maxHeight="250px" />
        </div>
      </CardBody>
    </Card>
  )
}

// ============================================================================
// Agent Events Channel Demo
// ============================================================================

function AgentEventsDemo() {
  const [messages, setMessages] = useState<string[]>([])
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set())
  const [pendingLog, setPendingLog] = useState(false)
  const [pendingProgress, setPendingProgress] = useState(false)

  const { sendRaw, isConnected, connectionState, connect, disconnect } = useWebSocket<AgentEvent | AgentEventsResponse>(
    WebSocketChannel.AgentEvents,
    {
      autoConnect: false,
      onMessage: (msg) => {
        const timestamp = new Date().toLocaleTimeString()
        // Backend sends raw responses
        const data = msg as unknown as AgentEvent | AgentEventsResponse
        const payload = 'payload' in msg ? msg.payload : data

        // Handle subscription confirmation
        if ('status' in payload && payload.status === 'success') {
          const response = payload as AgentEventsResponse
          setMessages((prev) => [...prev, `[${timestamp}] ✅ ${response.action}: ${response.groups.join(', ')}`])

          // Update subscription state
          if (response.action === 'subscribe') {
            setSubscriptions((prev) => {
              const next = new Set(prev)
              response.groups.forEach((g) => next.add(g))
              return next
            })
          } else {
            setSubscriptions((prev) => {
              const next = new Set(prev)
              response.groups.forEach((g) => next.delete(g))
              return next
            })
          }
          return
        }

        // Handle event
        if ('group' in payload) {
          const event = payload as AgentEvent
          const icon = event.group === 'log' ? '📝' : '📊'
          let line = `[${timestamp}] ${icon} [${event.group}]`

          if (event.level) {
            line += ` [${event.level}]`
          }
          if (event.progress !== undefined) {
            line += ` ${event.progress}%`
          }
          line += ` ${event.message}`

          setMessages((prev) => [...prev, line])
        }
      },
    }
  )

  const handleSubscribe = useCallback(
    (group: 'log' | 'progress', subscribe: boolean) => {
      if (!isConnected) return

      const action = subscribe ? 'subscribe' : 'unsubscribe'
      // Backend expects raw format: { action: "...", groups: [...] }
      sendRaw({ action, groups: [group] })

      if (group === 'log') setPendingLog(false)
      if (group === 'progress') setPendingProgress(false)
    },
    [isConnected, sendRaw]
  )

  return (
    <Card>
      <CardHeader>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <CardTitle>📡 Agent Events Channel</CardTitle>
          </FlexItem>
          <FlexItem>
            <ConnectionStatusBadge state={connectionState} />
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        <p
          style={{
            marginBottom: 'var(--pf-t--global--spacer--md)',
            color: 'var(--pf-t--global--color--nonstatus--gray--default)',
          }}
        >
          Subscribe to event groups (log, progress). Events are sent at random 3-8 second intervals.
        </p>
        <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
          <FlexItem>
            {isConnected ? (
              <Button variant="secondary" onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button variant="primary" onClick={connect}>
                Connect
              </Button>
            )}
          </FlexItem>
          <FlexItem>
            <Checkbox
              label="Log Events"
              id="log-checkbox"
              isChecked={subscriptions.has('log') || pendingLog}
              isDisabled={!isConnected}
              onChange={(_e, checked) => {
                setPendingLog(checked)
                handleSubscribe('log', checked)
              }}
            />
          </FlexItem>
          <FlexItem>
            <Checkbox
              label="Progress Events"
              id="progress-checkbox"
              isChecked={subscriptions.has('progress') || pendingProgress}
              isDisabled={!isConnected}
              onChange={(_e, checked) => {
                setPendingProgress(checked)
                handleSubscribe('progress', checked)
              }}
            />
          </FlexItem>
          <FlexItem>
            <Flex gap={{ default: 'gapSm' }}>
              {subscriptions.has('log') && <Badge>log</Badge>}
              {subscriptions.has('progress') && <Badge>progress</Badge>}
            </Flex>
          </FlexItem>
        </Flex>
        <MessageList messages={messages} maxHeight="200px" />
      </CardBody>
    </Card>
  )
}

// ============================================================================
// Tokens Channel Demo (Receive-only)
// ============================================================================

function TokensDemo() {
  const [tokens, setTokens] = useState<string[]>([])

  const { isConnected, connectionState, connect, disconnect } = useWebSocket<TokenMessage>(WebSocketChannel.Tokens, {
    autoConnect: false,
    onMessage: (msg) => {
      // Backend sends raw: { token: "...", sequence: N }
      const data = msg as unknown as TokenMessage
      const token = data.token ?? msg.payload?.token
      const sequence = data.sequence ?? msg.payload?.sequence
      if (token !== undefined) {
        const timestamp = new Date().toLocaleTimeString()
        setTokens((prev) => [...prev, `[${timestamp}] #${sequence}: ${token}`])
      }
    },
  })

  return (
    <Card>
      <CardHeader>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <CardTitle>🎫 Tokens Channel (Receive-only)</CardTitle>
          </FlexItem>
          <FlexItem>
            <ConnectionStatusBadge state={connectionState} />
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        <p
          style={{
            marginBottom: 'var(--pf-t--global--spacer--md)',
            color: 'var(--pf-t--global--color--nonstatus--gray--default)',
          }}
        >
          Receive-only channel. Server sends tokens automatically after connection.
        </p>
        <Flex style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
          <FlexItem>
            {isConnected ? (
              <Button variant="secondary" onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button variant="primary" onClick={connect}>
                Connect
              </Button>
            )}
          </FlexItem>
          <FlexItem>
            <Button variant="link" onClick={() => setTokens([])}>
              Clear
            </Button>
          </FlexItem>
        </Flex>
        <MessageList messages={tokens} maxHeight="200px" />
      </CardBody>
    </Card>
  )
}

// ============================================================================
// Main Demo Page
// ============================================================================

export default function DemoWebSocket() {
  return (
    <AppPage>
      <AppPageHeader title="WebSocket Demo" />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
        <CompassPanel isFullHeight style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
          <Grid hasGutter>
            <GridItem md={6}>
              <CoffeeDemo />
            </GridItem>
            <GridItem md={6}>
              <ChatDemo />
            </GridItem>
            <GridItem md={6}>
              <AgentEventsDemo />
            </GridItem>
            <GridItem md={6}>
              <TokensDemo />
            </GridItem>
          </Grid>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
