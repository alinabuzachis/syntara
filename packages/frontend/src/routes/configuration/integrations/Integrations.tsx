import clsx from "clsx";
import Fuse from "fuse.js";
import { useState } from "react";
import { useLocation } from "wouter";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { AppRoute } from "../../../app/AppRoute";
import { ChatInput } from "../../../components/chat/ChatInput";
import { Scrollable } from "../../../components/Scrollable";
import { IntegrationCard } from "./IntegrationCard";
import { useIntegrations } from "./useIntegrations";

export default function Integrations() {
  const [_, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const { resources: integrations } = useIntegrations();
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
  const useCards = false;
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
        <button
          className="bg-blue-400/70 px-4 py-1 rounded-full"
          onClick={() =>
            navigate(AppRoute.Configuration.Integrations.Configure)
          }
        >
          Add Integration
        </button>
        {/* <ExampleToggleGroup /> */}
      </AppPageHeader>
      {!useCards ? (
        // <div className="roundedgrow overflow-hidden flex flex-col">
        <div className="rounded-4xl grow flex flex-col overflow-hidden ring-2 ring-white/20">
          <Scrollable>
            <table className="w-full">
              <thead
                className={clsx("sticky top-0 bg-black/10 glass z-10", {
                  "shadow-lg shadow-black/50": false,
                })}
              >
                <tr className="border-0 border-white/20 text-left">
                  <th>
                    <div className="px-8 py-6 border-b border-white/20">
                      Name
                    </div>
                  </th>
                  <th>
                    <div className="px-8 py-6 border-b border-white/20">
                      Type
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="glass">
                {results.map((integration) => (
                  <tr key={integration.id}>
                    <td>
                      <div className="px-8 py-4 border-b border-white/15">
                        {integration.name}
                      </div>
                    </td>
                    <td>
                      <div className="px-8 py-4 border-b border-white/15">
                        {integration.type}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* <tfoot>
                <tr className="sticky bottom-0 bg-black/10 glass z-10 ">
                  <td className="px-8 py-6 bg-white/0 rounded-bl-3xl col-span-2">
                    Name
                  </td>
                </tr>
              </tfoot> */}
            </table>
          </Scrollable>
          <div className="grow glass" />
        </div>
      ) : (
        // </div>
        <Scrollable className="glass rounded-4xl border">
          <div
            className={`p-8 grid gap-4 grid-cols-[repeat(auto-fit,minmax(350px,1fr))]`}
          >
            {results.map((integration) => (
              <IntegrationCard key={integration.id} {...integration} />
            ))}
          </div>
        </Scrollable>
      )}
      <ChatInput />
    </AppPage>
  );
}
