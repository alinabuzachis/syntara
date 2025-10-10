import { Toolbar, ToolbarButton } from "@ansible/nexus-ui-framework";
import {
  ClosedCaptionIcon,
  GalleryVerticalEndIcon,
  SquarePlusIcon,
  Volume2Icon,
} from "lucide-react";

export function AppLeftBar() {
  return (
    <Toolbar
      orientation="vertical"
      className="glass rounded-full border mx-8 grow-0 self-center py-1"
    >
      <ToolbarButton>
        <SquarePlusIcon />
      </ToolbarButton>

      <ToolbarButton>
        <GalleryVerticalEndIcon />
      </ToolbarButton>

      <ToolbarButton>
        <div className="w-6 h-6 rounded-full flex items-center justify-center ai-shadow" />
      </ToolbarButton>

      <ToolbarButton>
        <Volume2Icon />
      </ToolbarButton>

      <ToolbarButton>
        <ClosedCaptionIcon />
      </ToolbarButton>
    </Toolbar>
  );
}
