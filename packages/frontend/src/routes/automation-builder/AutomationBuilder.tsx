import {
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";
import { AppPage } from "../../app/AppPage";
import { AppPageHeader } from "../../app/AppPageHeader";
import { ChatInput } from "../../components/chat/ChatInput";
import "./react-flow.css";

type NodeType = TriggerNode | AgentNode | OutputNode;
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
initialNodes.forEach((node, index) => {
  node.position = { x: index * 350 + 32, y: index * 0 + 32 };
});

type EdgeType = { id: string; source: string; target: string };
const initialEdges: EdgeType[] = [
  { id: "trigger-agent", source: "trigger", target: "agent" },
  { id: "agent-result", source: "agent", target: "result" },
];

export default function AutomationBuilder() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const onNodesChange = useCallback(
    (nodeChanges: NodeChange<NodeType>[]) =>
      setNodes((nodesSnapshot) =>
        applyNodeChanges<NodeType>(nodeChanges, nodesSnapshot)
      ),
    []
  );

  const onEdgesChange = useCallback(
    (edgeChanges: EdgeChange[]) =>
      setEdges((edgesSnapshot) => applyEdgeChanges(edgeChanges, edgesSnapshot)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((edgesSnapshot) => addEdge(connection, edgesSnapshot)),
    []
  );

  return (
    <AppPage>
      <AppPageHeader title="Automation Builder" />
      <ReactFlow<NodeType, EdgeType>
        className="glass border rounded-4xl"
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Panel position="bottom-center">
          <div className="bg-white/5 rounded-full px-8 py-4 flex gap-8 border border-white/10 mb-4">
            <div>Add node</div>
            <div>Add notation</div>
            <div>Save</div>
            <div>Run</div>
            <div>Test</div>
          </div>
        </Panel>
      </ReactFlow>
      <ChatInput />
    </AppPage>
  );
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  agent: AgentNodeComponent,
  result: OutputNodeComponent,
};

type TriggerNode = { type: "trigger" } & Node<{
  label: string;
  description?: string;
  integrations?: Array<string>;
}>;
export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  return (
    <>
      <div>
        <label className="text-lg font-bold">{props.data.label}</label>
        <div className="text-white/60 text-xs">Trigger</div>
      </div>
      {props.data.description && (
        <div className="text-pretty">{props.data.description}</div>
      )}
      {props.data.integrations && (
        <div>
          <div className="text-white/70">Integrations</div>
          <ul className="flex mt-1">
            {props.data.integrations.map((integration) => (
              <li
                className="px-4 py-0 bg-white/10 rounded-xl"
                key={integration}
              >
                {integration}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </>
  );
}

type AgentNode = { type: "agent" } & Node<{
  label: string;
  description?: string;
  model: string;
}>;
function AgentNodeComponent(props: NodeProps<AgentNode>) {
  return (
    <>
      <div>
        <label className="text-lg font-bold">{props.data.label}</label>
        <div className="text-white/60 text-xs">Agent</div>
      </div>
      {props.data.description && (
        <div className="text-pretty">{props.data.description}</div>
      )}
      {props.data.model && (
        <div>
          <div className="text-white/70">Model</div>
          <div className="text-pretty">{props.data.model}</div>
        </div>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

type OutputNode = { type: "result" } & Node<{
  label: string;
  description?: string;
  integrations?: Array<string>;
}>;
function OutputNodeComponent(props: NodeProps<OutputNode>) {
  return (
    <>
      <div>
        <label className="text-lg font-bold">{props.data.label}</label>
        <div className="text-white/60 text-xs">Result</div>
      </div>
      {props.data.description && (
        <div className="text-pretty">{props.data.description}</div>
      )}
      {props.data.integrations && (
        <div>
          <div className="text-white/70">Integrations</div>
          <ul className="flex mt-1">
            {props.data.integrations.map((integration) => (
              <li
                className="px-4 py-0 bg-white/10 rounded-xl"
                key={integration}
              >
                {integration}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Handle type="target" position={Position.Left} />
    </>
  );
}
