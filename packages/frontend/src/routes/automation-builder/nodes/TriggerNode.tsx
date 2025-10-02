import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useContext } from "react";
import { FlowDirectionContext } from "../FlowDirectionContext";

export type TriggerNode = { type: "trigger" } & Node<{
  label: string;
  description?: string;
  integrations?: Array<string>;
}>;
export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  const flowDirection = useContext(FlowDirectionContext);
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
