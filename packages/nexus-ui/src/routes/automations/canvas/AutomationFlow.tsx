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
import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
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
  g.setGraph({ rankdir: options.direction, ranksep: 150 })

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
    edges: edges.map((edge) => ({ ...edge, markerEnd })),
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
            data: {
              label: 'Manual',
              inputs: props.workflow.version?.workflow_definition?.inputs || {},
            },
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

  // const onConnect = useCallback((params: Connection) => setEdges((eds) => [...eds, params]), [setEdges])

  const onLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, { direction: 'LR' })
    setNodes([...layouted.nodes])
    setEdges([...layouted.edges])
    fitView({ maxZoom: 1 })
  }, [nodes, edges, setNodes, setEdges, fitView])

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
        onLayoutRef.current()
      })
    }
  }, [nodes, isInitialized, flowDirection])

  useEffect(() => {
    if (isInitialized) {
      onLayoutRef.current()
    }
  }, [flowDirection, isInitialized])

  return (
    <ReactFlow<NodeType, EdgeType>
      className=""
      colorMode="dark"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      // onConnect={onConnect}
      proOptions={{ hideAttribution: true }}
      fitView
      minZoom={0.1}
      maxZoom={1}
    >
      <CanvasControls onLayout={onLayout} />
    </ReactFlow>
  )
}

function addActivity(
  activity: Activity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
): string {
  switch (activity.type) {
    case 'task':
      return addTaskActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'condition':
      return addConditionActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'sequence':
      return addSequenceActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'parallel':
      return addParallelActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'loop':
      return addLoopActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'join':
      return addJoinActivity(activity, nodes, edges, previousIds, sourceHandle)
  }
}

function addTaskActivity(
  taskActivity: TaskActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: taskActivity.id,
    type: 'task',
    position: { x: 0, y: 0 },
    data: taskActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${taskActivity.id}`,
      source: id,
      target: taskActivity.id,
      sourceHandle,
    })
  }
  previousIds.length = 0
  previousIds.push(taskActivity.id)
  return taskActivity.id
}

function addConditionActivity(
  conditionActivity: ConditionActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: conditionActivity.id,
    type: 'condition',
    position: { x: 0, y: 0 },
    data: conditionActivity,
  })
  for (const id of previousIds) {
    edges.push({ id: `${id}-${conditionActivity.id}`, source: id, target: conditionActivity.id, sourceHandle })
  }

  previousIds = [conditionActivity.id]
  for (const branch of conditionActivity.then ?? []) {
    for (const id of previousIds) {
      edges.push({
        id: `${id}-${branch.id}-then`,
        source: id,
        target: branch.id,
        sourceHandle: id === conditionActivity.id ? 'then' : 'source',
      })
    }
    addActivity(branch, nodes, edges, previousIds, 'then')
  }

  previousIds = [conditionActivity.id]
  for (const branch of conditionActivity.else ?? []) {
    for (const id of previousIds) {
      edges.push({
        id: `${id}-${branch.id}-else`,
        source: id,
        target: branch.id,
        sourceHandle: id === conditionActivity.id ? 'else' : 'source',
      })
    }
    addActivity(branch, nodes, edges, previousIds, 'else')
  }

  return conditionActivity.id
}

function addSequenceActivity(
  sequenceActivity: SequenceActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  let seqPreviousIds = [...previousIds]
  for (const step of sequenceActivity.steps ?? []) {
    const added = addActivity(step, nodes, edges, seqPreviousIds, sourceHandle)
    if (added) {
      seqPreviousIds = [step.id]
    }
  }
  return sequenceActivity.id
}

function addParallelActivity(
  parallelActivity: ParallelActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  const ids: string[] = []
  for (const branch of parallelActivity.branches ?? []) {
    ids.push(addActivity(branch, nodes, edges, [...previousIds], sourceHandle))
  }

  previousIds.length = 0
  previousIds.push(...ids)

  // nodes.push({
  //   id: parallelActivity.id,
  //   type: 'parallel',
  //   position: { x: 0, y: 0 },
  //   data: parallelActivity,
  //   // style: {
  //   //   width: 300,
  //   //   height: 400,
  //   // },
  // })
  // for (const id of ids) {
  //   edges.push({ id: `${parallelActivity.id}-${id}`, source: id, target: parallelActivity.id })
  // }

  // previousIds.length = 0
  // previousIds.push(parallelActivity.id)

  return parallelActivity.id
}

function addLoopActivity(
  loopActivity: LoopActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sourceHandle?: string
) {
  nodes.push({
    id: loopActivity.id,
    type: 'loop',
    position: { x: 0, y: 0 },
    data: loopActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${loopActivity.id}`,
      source: id,
      target: loopActivity.id,
      targetHandle: 'target',
    })
  }

  let lastId: string = loopActivity.id

  for (const step of loopActivity.loop.do ?? []) {
    const id = addActivity(step, nodes, edges, [lastId], 'start')
    // if (added) {
    //   if (!firstId) {
    //     firstId = step.id
    //   }
    //   loopPreviousId = step.id
    // }
    lastId = id
  }
  // if (loopPreviousId && firstId) {
  //   edges.push({ id: `${loopPreviousId}-${firstId}`, source: loopPreviousId, target: firstId, type: 'loop' })
  // }

  edges.push({
    id: `${lastId}-${loopActivity.id}`,
    source: lastId,
    target: loopActivity.id,
    targetHandle: 'end',
  })

  previousIds.length = 0
  previousIds.push(loopActivity.id)

  return loopActivity.id
}

function addJoinActivity(
  joinActivity: JoinActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: joinActivity.id,
    type: 'join',
    position: { x: 0, y: 0 },
    data: joinActivity,
  })
  for (const id of joinActivity.join.branches) {
    edges.push({
      id: `${id}-${joinActivity.id}`,
      source: id,
      target: joinActivity.id,
      sourceHandle,
    })
  }

  previousIds.length = 0
  previousIds.push(joinActivity.id)

  return joinActivity.id
}

const markerEnd = { type: MarkerType.ArrowClosed } as unknown as EdgeProps['markerEnd']
