import {
  ClosedCaptionIcon,
  GalleryVerticalEndIcon,
  SquarePlusIcon,
  Volume2Icon,
} from "lucide-react";
import { IconButton } from "ui-framework";

export function AppLeftBar() {
  return (
    <div className="grow-0 self-center flex flex-col py-1 text-white/60 glass rounded-full border mx-8">
      <IconButton>
        <SquarePlusIcon />
      </IconButton>

      <IconButton>
        <GalleryVerticalEndIcon />
      </IconButton>

      <div className="m-3 w-6 h-6 rounded-full flex items-center justify-center ai-shadow" />

      <IconButton>
        <Volume2Icon />
      </IconButton>

      <IconButton>
        <ClosedCaptionIcon />
      </IconButton>
    </div>
  );
}
