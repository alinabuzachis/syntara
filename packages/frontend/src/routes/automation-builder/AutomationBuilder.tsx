import Dagre from "@dagrejs/dagre";
import {
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "../../app/AppPage";
import { AppPageHeader } from "../../app/AppPageHeader";
import { ChatInput } from "../../components/chat/ChatInput";
import { FlowDirectionContext } from "./FlowDirectionContext";
import { nodeTypes, type NodeType } from "./nodes/NodeType";
import "./react-flow.css";

const initialNodes: NodeType[] = [
  {
    id: "trigger",
    type: "trigger",
    position: { x: 0, y: 0 },
    data: {
      label: "EDA Event",
      description: "Trigger event show need to create VM.",
      integrations: ["Ansible Automation Platform"],
    },
  },
  {
    id: "trigger-2",
    type: "trigger",
    position: { x: 0, y: 0 },
    data: {
      label: "Webhook",
      description: "Trigger event from webhook.",
      integrations: ["GitHub", "GitLab"],
    },
  },
  {
    id: "agent",
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      label: "Analysis Agent",
      description:
        "Analyze region expenses, resource availability, and organizational policies.",
      model: "Claude Opus 4",
    },
  },
  {
    id: "result",
    type: "result",
    position: { x: 0, y: 0 },
    data: {
      label: "Playbook Run",
      description: "Create VM playbook.",
      integrations: ["Ansible Automation Platform"],
    },
  },
];
// initialNodes.forEach((node, index) => {
//   node.position = { x: index * 350 + 32, y: index * 0 + 32 };
// });

type EdgeType = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};
const initialEdges: EdgeType[] = [
  { id: "trigger-agent", source: "trigger", target: "agent" },
  { id: "trigger2-agent", source: "trigger-2", target: "agent" },
  { id: "agent-result", source: "agent", target: "result" },
];

const getLayoutedElements = (
  nodes: NodeType[],
  edges: EdgeType[],
  options: { direction: "TB" | "LR" }
) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: options.direction });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    })
  );

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;

      return { ...node, position: { x, y } };
    }),
    edges: edges.map((edge) => ({
      ...edge,
      sourceHandle: options.direction === "TB" ? "bottom" : "right",
      targetHandle: options.direction === "TB" ? "top" : "left",
    })),
  };
};

export default function AutomationBuilder() {
  return (
    <AppPage>
      <AppPageHeader title="Automation Builder">
        <div className="grow" />
        <div>Add node</div>
        <div>Add notation</div>
        <div>Save</div>
        <div>Run</div>
        <div>Test</div>
      </AppPageHeader>
      <ReactFlowProvider>
        <AutomationBuilderFlow />
      </ReactFlowProvider>
      <ChatInput />
    </AppPage>
  );
}

function AutomationBuilderFlow() {
  const { fitView } = useReactFlow();
  const [flowDirection, setFlowDirection] = useState<"TB" | "LR">("LR");
  const [isInitialized, setIsInitialized] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onLayout = useCallback(
    (direction: "TB" | "LR") => {
      const layouted = getLayoutedElements(nodes, edges, { direction });
      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
      fitView({ maxZoom: 1 });
    },
    [nodes, edges, setNodes, setEdges, fitView]
  );

  // Apply initial layout after nodes are measured
  useEffect(() => {
    if (!isInitialized && nodes.every((node) => node.measured)) {
      setIsInitialized(true);
      onLayout(flowDirection);
    }
  }, [nodes, isInitialized, flowDirection, onLayout]);

  useEffect(() => {
    if (isInitialized) {
      onLayout(flowDirection);
    }
  }, [flowDirection]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FlowDirectionContext.Provider value={flowDirection}>
      <ReactFlow<NodeType, EdgeType>
        className="glass border rounded-4xl"
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
        <Controls />
        {/* <Panel position="bottom-center">
          <div className="bg-white/5 rounded-full px-8 py-4 flex gap-8 border border-white/10 mb-4">
            <div>Add node</div>
            <div>Add notation</div>
            <div>Save</div>
            <div>Run</div>
            <div>Test</div>
          </div>
        </Panel> */}
        <Panel position="top-right" className="flex gap-4">
          <button
            onClick={() => {
              setFlowDirection("TB");
            }}
          >
            vertical
          </button>
          <button
            onClick={() => {
              setFlowDirection("LR");
            }}
          >
            horizontal
          </button>
        </Panel>
      </ReactFlow>
    </FlowDirectionContext.Provider>
  );
}
