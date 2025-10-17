import { IconButton } from '@ansible/nexus-ui-framework'
import Dagre from '@dagrejs/dagre'
import { Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import { ExpandIcon, MoveHorizontalIcon, MoveVerticalIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import type { WorkflowWithVersion } from 'nexus-contracts'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ChatInput } from '../../components/chat/ChatInput'
import { FlowDirectionContext } from './FlowDirectionContext'
import { nodeTypes, type NodeType } from './nodes/NodeType'

const initialNodes: NodeType[] = [
  {
    id: 'trigger',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      label: 'EDA Event',
      description: 'Trigger event show need to create VM.',
      integrations: ['Ansible Automation Platform'],
    },
  },
  {
    id: 'trigger-2',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      label: 'Webhook',
      description: 'Trigger event from webhook.',
      integrations: ['GitHub', 'GitLab'],
    },
  },
  {
    id: 'agent',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Analysis Agent',
      description: 'Analyze region expenses, resource availability, and organizational policies.',
      steps: [
        {
          label: 'Analyze region expenses',
          description: 'Check the cost of resources in different regions.',
          status: 'completed',
        },
        {
          label: 'Check resource availability',
          description: 'Ensure resources are available in the selected region.',
          status: 'in-progress',
        },
        {
          label: 'Review organizational policies',
          description: 'Make sure the deployment complies with company policies.',
          status: 'pending',
        },
      ],
      model: 'Claude Opus 4',
    },
  },
  {
    id: 'result',
    type: 'result',
    position: { x: 0, y: 0 },
    data: {
      label: 'Playbook Run',
      description: 'Create VM playbook.',
      integrations: ['Ansible Automation Platform'],
    },
  },
]
// initialNodes.forEach((node, index) => {
//   node.position = { x: index * 350 + 32, y: index * 0 + 32 };
// });

type EdgeType = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}
const initialEdges: EdgeType[] = [
  { id: 'trigger-agent', source: 'trigger', target: 'agent' },
  { id: 'trigger2-agent', source: 'trigger-2', target: 'agent' },
  { id: 'agent-result', source: 'agent', target: 'result' },
]

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
    for (const trigger of props.workflow.version?.workflow_definition?.triggers ?? []) {
      switch (trigger.type) {
        case 'manual':
          nodes.push({
            id: 'manual',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {
              label: 'Manual',
            },
          })
          break
      }
    }
    let previousId = ''
    for (const activity of props.workflow.version?.workflow_definition?.workflow.activities ?? []) {
      switch (activity.type) {
        case 'sequence':
          for (const step of activity.steps ?? []) {
            switch (step.type) {
              case 'task':
                nodes.push({
                  id: step.id,
                  type: 'task',
                  position: { x: 0, y: 0 },
                  data: step,
                })
                if (!previousId) {
                  edges.push({
                    id: `trigger-${step.id}`,
                    source: 'manual',
                    target: step.id,
                  })
                } else {
                  edges.push({
                    id: `${previousId}-${step.id}`,
                    source: previousId,
                    target: step.id,
                  })
                }
                previousId = step.id
                break
            }
          }

          break
      }
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
      // onConnect={onConnect}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      {/* <Controls /> */}
      {/* <Panel position="bottom-center">
          <div className="bg-white/5 rounded-full px-8 py-4 flex gap-8 border border-white/10 mb-4">
            <div>Add node</div>
            <div>Add notation</div>
            <div>Save</div>
            <div>Run</div>
            <div>Test</div>
          </div>
        </Panel> */}
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
