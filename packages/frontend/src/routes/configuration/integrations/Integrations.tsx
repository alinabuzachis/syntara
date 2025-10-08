import clsx from "clsx";
import Fuse from "fuse.js";
import { EllipsisVerticalIcon } from "lucide-react";
import { useState } from "react";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Scrollable,
} from "ui-framework";
import { useLocation } from "wouter";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { AppRoute } from "../../../app/AppRoute";
import { ChatInput } from "../../../components/chat/ChatInput";
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
  const [view, setView] = useState<"table" | "cards">("table");
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
        <Menu>
          <MenuTrigger>
            <EllipsisVerticalIcon />
          </MenuTrigger>
          <MenuItems>
            <MenuGroup label="View">
              <MenuRadioGroup value={view} onValueChange={setView}>
                <MenuRadioItem value="table">Table</MenuRadioItem>
                <MenuRadioItem value="cards">Cards</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </MenuItems>
        </Menu>
        {/* <ExampleToggleGroup /> */}
      </AppPageHeader>
      {view !== "cards" ? (
        // <div className="roundedgrow overflow-hidden flex flex-col">
        <div className="rounded-4xl grow flex flex-col overflow-hidden border-2 border-violet-300/20">
          <Scrollable className="grow">
            <table className="w-full border-separate border-spacing-0 h-full">
              <thead
                className={clsx("sticky top-0 glass z-10 ", {
                  "shadow-lg shadow-black/50": false,
                })}
              >
                <tr className="text-left *:border-b *:border-violet-300/20 *:h-16 bg-white/5 *:px-8">
                  {/* <th className="w-1 min-w-12 text-center">
                    <input type="checkbox" />
                  </th> */}
                  <th>Name</th>
                  <th>Type</th>
                  <th className="w-1 min-w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="glass">
                {results.map((integration) => (
                  <tr
                    key={integration.id}
                    className="text-left *:border-b *:border-violet-300/20 *:h-12 *:px-8"
                  >
                    {/* <td className="w-1 min-w-12 text-center">
                      <input type="checkbox" />
                    </td> */}
                    <td>{integration.name}</td>
                    <td>{integration.type}</td>
                    <td className="w-1 min-w-12 text-center pt-1.5">
                      <Menu>
                        <MenuTrigger>
                          <EllipsisVerticalIcon />
                        </MenuTrigger>
                        <MenuItems>
                          <MenuItem>Stop server</MenuItem>
                          <MenuItem>Restart server</MenuItem>
                          <MenuSeparator />
                          <MenuItem>View and enable/disable tools</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Show output</MenuItem>
                          <MenuItem>Show configuration</MenuItem>
                          <MenuItem>Show configuration (JSON)</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Configure model access</MenuItem>
                          <MenuItem>Show sampling requests</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Browser resources</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Uninstall</MenuItem>
                        </MenuItems>
                      </Menu>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} />
                </tr>
              </tbody>
              <tfoot className="sticky bottom-0 glass z-10 min-h-12 h-16">
                <tr className="bg-white/5">
                  <td
                    colSpan={4}
                    className="px-6 border-t border-violet-300/20"
                  >
                    {results.length} integrations
                  </td>
                </tr>
              </tfoot>
            </table>
          </Scrollable>
        </div>
      ) : (
        <Scrollable className="glass rounded-4xl border grow">
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
