import {
  Menu,
  MenuItem,
  MenuItems,
  MenuTrigger,
} from "@ansible/nexus-ui-framework";
import { EllipsisVerticalIcon } from "lucide-react";

export function IntegrationCard(props: {
  name: string;
  type: string;
  description?: string;
  status?: "connected" | "disconnected";
  url?: string;
}) {
  return (
    <div className="p-8 glass rounded-2xl border flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <div className="font-bold text-lg">{props.name}</div>
          <Menu>
            <MenuTrigger>
              <EllipsisVerticalIcon />
            </MenuTrigger>
            <MenuItems>
              <MenuItem>Hello</MenuItem>
            </MenuItems>
          </Menu>
        </div>
        {props.type && (
          <div id="type" className="text-sm text-white/50">
            {props.type}
          </div>
        )}
        <div id="description" className="text-white/70 mt-4">
          {props.description}
        </div>
      </div>

      <dl className="details">
        <dt>Status</dt>
        <dd>
          {props.status === "connected" ? (
            <div className="bg-green-400 rounded-full w-2.5 h-2.5 inline-block mr-2" />
          ) : (
            <div className="bg-red-400 rounded-full w-2.5 h-2.5 inline-block mr-2" />
          )}
          {props.status === "connected" ? "Connected" : "Disconnected"}
        </dd>
        {props.url && (
          <>
            <dt>URL</dt>
            <dd>{props.url}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
