import { IconButton } from '@ansible/nexus-ui-framework'
import Dagre from '@dagrejs/dagre'
import { Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import { ExpandIcon, MoveHorizontalIcon, MoveVerticalIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import type { WorkflowWithVersion } from 'nexus-contracts'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ChatInput } from '../../components/chat/ChatInput'
import { FlowDirectionContext } from './FlowDirectionContext'
import { nodeTypes, type NodeType } from './nodes/NodeType'

type EdgeType = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

const getLayoutedElements = (nodes: NodeType[], edges: EdgeType[], options: { direction: 'TB' | 'LR' }) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: options.direction })

  edges.forEach((edge) => g.setEdge(edge.source, edge.target))
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    })
  )

  Dagre.layout(g)

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id)
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2
      const y = position.y - (node.measured?.height ?? 0) / 2

      return { ...node, position: { x, y } }
    }),
    edges: edges.map((edge) => ({
      ...edge,
      sourceHandle: options.direction === 'TB' ? 'bottom' : 'right',
      targetHandle: options.direction === 'TB' ? 'top' : 'left',
    })),
  }
}

export function AutomationFlow(props: { workflow: WorkflowWithVersion }) {
  const flowDirectionState = useState<'TB' | 'LR'>('LR')

  const { nodes, edges } = useMemo(() => {
    const nodes: NodeType[] = []
    const edges: EdgeType[] = []
    let previousIds: string[] = []

    // TRIGGERS
    for (const trigger of props.workflow.version?.workflow_definition?.triggers ?? []) {
      switch (trigger.type) {
        case 'manual':
          nodes.push({
            id: 'manual',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { label: 'Manual' },
          })
          break
      }
      previousIds.push('manual')
    }

    // ACTIVITIES
    for (const activity of props.workflow.version?.workflow_definition?.workflow.activities ?? []) {
      switch (activity.type) {
        case 'task':
          nodes.push({
            id: activity.id,
            type: 'task',
            position: { x: 0, y: 0 },
            data: activity,
          })
          for (const id of previousIds) {
            edges.push({ id: `${id}-${activity.id}`, source: id, target: activity.id })
          }
          // previousIds.push(activity.id)
          break
        case 'condition':
          nodes.push({
            id: activity.id,
            type: 'condition',
            position: { x: 0, y: 0 },
            data: activity,
          })
          for (const id of previousIds) {
            edges.push({ id: `${id}-${activity.id}`, source: id, target: activity.id })
          }
          previousIds = [activity.id]
          for (const then of activity.then) {
            // let branchPreviousIds = [...previousIds]
            switch (then.type) {
              case 'task':
                nodes.push({ id: then.id, type: 'task', position: { x: 0, y: 0 }, data: then })
                for (const id of previousIds) {
                  edges.push({ id: `${id}-${then.id}`, source: id, target: then.id })
                }
                // branchPreviousIds = [then.id]
                break
            }
          }
          break
        case 'parallel':
        case 'join':
        case 'loop':
          break

        case 'sequence':
          for (const step of activity.steps ?? []) {
            switch (step.type) {
              case 'task':
                nodes.push({ id: step.id, type: 'task', position: { x: 0, y: 0 }, data: step })
                for (const id of previousIds) {
                  edges.push({ id: `${id}-${activity.id}`, source: id, target: step.id })
                }
                previousIds = [step.id]
                break
            }
          }
          break
      }
    }
    console.log('nodes', nodes)
    console.log('edges', edges)
    return { nodes, edges }
  }, [props.workflow.version?.workflow_definition])

  return (
    <FlowDirectionContext.Provider value={flowDirectionState}>
      <ReactFlowProvider>
        <AutomationBuilderFlow initialNodes={nodes} initialEdges={edges} />
        <ChatInput />
      </ReactFlowProvider>
    </FlowDirectionContext.Provider>
  )
}

function AutomationBuilderFlow(props: { initialNodes: NodeType[]; initialEdges: EdgeType[] }) {
  const { fitView } = useReactFlow()
  const [isInitialized, setIsInitialized] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState(props.initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(props.initialEdges)

  const onLayout = useCallback(
    (direction: 'TB' | 'LR') => {
      const layouted = getLayoutedElements(nodes, edges, { direction })
      setNodes([...layouted.nodes])
      setEdges([...layouted.edges])
      fitView({ maxZoom: 1 })
    },
    [nodes, edges, setNodes, setEdges, fitView]
  )

  const [flowDirection] = useContext(FlowDirectionContext)

  // Apply initial layout after nodes are measured
  useEffect(() => {
    if (!isInitialized && nodes.every((node) => node.measured)) {
      // Schedule state update to avoid cascading renders
      queueMicrotask(() => {
        setIsInitialized(true)
        onLayout(flowDirection)
      })
    }
  }, [nodes, isInitialized, flowDirection, onLayout])

  useEffect(() => {
    if (isInitialized) {
      onLayout(flowDirection)
    }
  }, [flowDirection])

  return (
    <ReactFlow<NodeType, EdgeType>
      className="glass rounded-4xl border"
      colorMode="dark"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Panel
        position="bottom-left"
        className="flex gap-4 rounded-4xl border border-white/10 bg-black/80 bg-linear-0 from-violet-500/20 to-violet-400/20 p-4 shadow-lg shadow-black/50"
      >
        <ControlsBar />
      </Panel>
    </ReactFlow>
  )
}

function ControlsBar() {
  const [, setFlowDirection] = useContext(FlowDirectionContext)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  return (
    <>
      <IconButton onClick={() => zoomIn()}>
        <ZoomInIcon />
      </IconButton>
      <IconButton onClick={() => zoomOut()}>
        <ZoomOutIcon />
      </IconButton>
      <IconButton onClick={() => fitView()}>
        <ExpandIcon />
      </IconButton>
      <IconButton onClick={() => setFlowDirection('TB')}>
        <MoveVerticalIcon />
      </IconButton>
      <IconButton onClick={() => setFlowDirection('LR')}>
        <MoveHorizontalIcon />
      </IconButton>
      {/* <button onClick={() => fitView()}>
        <FullscreenIcon />
      </button> */}
    </>
  )
}
