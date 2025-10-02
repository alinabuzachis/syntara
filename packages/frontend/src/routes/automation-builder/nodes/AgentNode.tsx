import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useContext } from "react";
import { FlowDirectionContext } from "../FlowDirectionContext";

export type AgentNode = { type: "agent" } & Node<{
  label: string;
  description?: string;
  model: string;
}>;
export function AgentNodeComponent(props: NodeProps<AgentNode>) {
  const flowDirection = useContext(FlowDirectionContext);

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
      <Handle
        type="target"
        id="top"
        position={Position.Top}
        style={{ opacity: flowDirection === "TB" ? 1 : 0 }}
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        style={{ opacity: flowDirection === "LR" ? 1 : 0 }}
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        style={{ opacity: flowDirection === "TB" ? 1 : 0 }}
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        style={{ opacity: flowDirection === "LR" ? 1 : 0 }}
      />
    </>
  );
}
