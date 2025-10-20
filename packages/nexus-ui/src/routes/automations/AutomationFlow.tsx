import type {
  Activity,
  ConditionActivity,
  JoinActivity,
  LoopActivity,
  ParallelActivity,
  SequenceActivity,
  TaskActivity,
  WorkflowWithVersion,
} from '@ansible/nexus-contracts'
import Dagre from '@dagrejs/dagre'
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type EdgeProps } from '@xyflow/react'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasControls } from './CanvasControls'
import { edgeTypes } from './edges/EdgeType'
import { FlowDirectionContext } from './FlowDirectionContext'
import { nodeTypes, type NodeType } from './nodes/NodeType'

type EdgeType = Pick<EdgeProps, 'markerEnd'> & {
  id: string
  type?: string
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
      edgeTypes={edgeTypes}
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
    case 'parallel':
      addParallelActivity(activity, nodes, edges, previousIds)
      return true
    case 'loop':
      addLoopActivity(activity, nodes, edges, previousIds)
      return true
    case 'join':
      addJoinActivity(activity, nodes, edges, previousIds)
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

function addParallelActivity(
  parallelActivity: ParallelActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[]
) {
  for (const branch of parallelActivity.branches ?? []) {
    addActivity(branch, nodes, edges, previousIds)
  }
}

function addLoopActivity(loopActivity: LoopActivity, nodes: NodeType[], edges: EdgeType[], previousIds: string[]) {
  let firstId = ''
  let loopPreviousId = ''
  for (const step of loopActivity.loop.do ?? []) {
    const added = addActivity(step, nodes, edges, loopPreviousId ? [loopPreviousId] : previousIds)
    if (added) {
      if (!firstId) {
        firstId = step.id
      }
      loopPreviousId = step.id
    }
  }
  if (loopPreviousId && firstId) {
    edges.push({ id: `${loopPreviousId}-${firstId}`, source: loopPreviousId, target: firstId, type: 'loop' })
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function addJoinActivity(joinActivity: JoinActivity, nodes: NodeType[], edges: EdgeType[], previousIds: string[]) {
  nodes.push({
    id: joinActivity.id,
    type: 'join',
    position: { x: 0, y: 0 },
    data: joinActivity,
  })
  for (const id of joinActivity.join.branches) {
    edges.push({ id: `${id}-${joinActivity.id}`, source: id, target: joinActivity.id })
  }
}
