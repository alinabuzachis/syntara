import { Toggle, ToggleGroup } from "@base-ui-components/react";
import clsx from "clsx";
import Fuse from "fuse.js";
import {
  EllipsisVerticalIcon,
  LayoutDashboardIcon,
  TableIcon,
} from "lucide-react";
import { useState } from "react";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { ChatInput } from "../../../components/chat/ChatInput";
import { Scrollable } from "../../../components/Scrollable";
import { useIntegrations } from "./useIntegrations";

export default function Integrations() {
  const [search, setSearch] = useState("");
  const { integrations } = useIntegrations();
  const fuse = new Fuse(integrations, {
    keys: [
      { name: "name", weight: 0.5 },
      { name: "type", weight: 0.3 },
      { name: "description", weight: 0.2 },
    ],
    threshold: 0.7,
  });
  const results = search
    ? fuse.search(search).map((result) => result.item)
    : integrations;

  return (
    <AppPage>
      <AppPageHeader title="Integrations">
        {/* <ExampleToggleGroup /> */}
        <input
          className="search grow"
          placeholder="Search integrations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="bg-blue-400/70 px-4 py-1 rounded-full">
          Add Integration
        </button>
      </AppPageHeader>
      <Scrollable className="glass rounded-3xl border">
        <div
          className={`p-8 grid gap-4 grid-cols-[repeat(auto-fit,minmax(350px,1fr))] `}
        >
          {results.map((integration) => (
            <IntegrationCard key={integration.name} {...integration} />
          ))}
        </div>
      </Scrollable>
      <ChatInput />
    </AppPage>
  );
}

function IntegrationCard(props: {
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
          <button className="-mr-3 -mt-0">
            <EllipsisVerticalIcon />
          </button>
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

export function ExampleToggleGroup() {
  return (
    <ToggleGroup
      defaultValue={["dashboard"]}
      className="border rounded-xl border-white/20 flex items-center p-1 gap-1 text-gray-500"
      // className="flex gap-px rounded-md border border-gray-200 bg-gray-50 p-0.5"
    >
      <Toggle
        aria-label="Table view"
        value="table"
        className={clsx("p-1", "data-[pressed]:bg-white/10 rounded ")}

        // className="flex size-8 items-center justify-center rounded-sm text-gray-600 select-none hover:bg-gray-100 focus-visible:bg-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-blue-800 active:bg-gray-200 data-[pressed]:bg-gray-100 data-[pressed]:text-gray-900"
      >
        <TableIcon />
      </Toggle>
      <Toggle
        aria-label="Table view"
        value="dashboard"
        // className="flex size-8 items-center justify-center rounded-sm text-gray-600 select-none hover:bg-gray-100 focus-visible:bg-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-blue-800 active:bg-gray-200 data-[pressed]:bg-gray-100 data-[pressed]:text-gray-900"
        className={clsx(
          "p-1",
          "data-[pressed]:bg-white/10 rounded-lg text-white "
        )}
      >
        <LayoutDashboardIcon />
      </Toggle>
    </ToggleGroup>
  );
}
