import { Toggle, ToggleGroup } from "@base-ui-components/react";
import clsx from "clsx";
import { LayoutDashboardIcon, TableIcon } from "lucide-react";

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
