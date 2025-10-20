import Dagre from '@dagrejs/dagre'
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import type { Activity, ConditionActivity, SequenceActivity, TaskActivity, WorkflowWithVersion } from 'nexus-contracts'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ChatInput } from '../../components/chat/ChatInput'
import { CanvasControls } from './CanvasControls'
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
    const previousIds: string[] = []

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
      addActivity(activity, nodes, edges, previousIds)
    }
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

  // Store latest onLayout in a ref to avoid it being a dependency
  const onLayoutRef = useRef(onLayout)
  useEffect(() => {
    onLayoutRef.current = onLayout
  }, [onLayout])

  const [flowDirection] = useContext(FlowDirectionContext)

  // Apply initial layout after nodes are measured
  useEffect(() => {
    if (!isInitialized && nodes.every((node) => node.measured)) {
      // Schedule state update to avoid cascading renders
      queueMicrotask(() => {
        setIsInitialized(true)
        onLayoutRef.current(flowDirection)
      })
    }
  }, [nodes, isInitialized, flowDirection])

  useEffect(() => {
    if (isInitialized) {
      onLayoutRef.current(flowDirection)
    }
  }, [flowDirection, isInitialized])

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
      <CanvasControls />
    </ReactFlow>
  )
}

function addActivity(activity: Activity, nodes: NodeType[], edges: EdgeType[], previousIds: string[]): boolean {
  switch (activity.type) {
    case 'task':
      addTaskActivity(activity, nodes, edges, previousIds)
      return true
    case 'condition':
      addConditionActivity(activity, nodes, edges, previousIds)
      return true
    case 'sequence':
      addSequenceActivity(activity, nodes, edges, previousIds)
      return true
    case 'join':
      // TODO
      return true
    case 'parallel':
      // TODO
      return true
    case 'loop':
      // TODO
      return true
  }
}

function addTaskActivity(taskActivity: TaskActivity, nodes: NodeType[], edges: EdgeType[], previousIds: string[]) {
  nodes.push({
    id: taskActivity.id,
    type: 'task',
    position: { x: 0, y: 0 },
    data: taskActivity,
  })
  for (const id of previousIds) {
    edges.push({ id: `${id}-${taskActivity.id}`, source: id, target: taskActivity.id })
  }
}

function addConditionActivity(
  conditionActivity: ConditionActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[]
) {
  nodes.push({
    id: conditionActivity.id,
    type: 'condition',
    position: { x: 0, y: 0 },
    data: conditionActivity,
  })
  for (const id of previousIds) {
    edges.push({ id: `${id}-${conditionActivity.id}`, source: id, target: conditionActivity.id })
  }
}

function addSequenceActivity(
  sequenceActivity: SequenceActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[]
) {
  let seqPreviousIds = [...previousIds]
  for (const step of sequenceActivity.steps ?? []) {
    const added = addActivity(step, nodes, edges, seqPreviousIds)
    if (added) {
      seqPreviousIds = [step.id]
    }
  }
}
