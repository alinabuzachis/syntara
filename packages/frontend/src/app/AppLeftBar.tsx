import {
  ClosedCaptionIcon,
  GalleryVerticalEndIcon,
  SquarePlusIcon,
  Volume2Icon,
} from "lucide-react";

export function AppLeftBar() {
  return (
    <div className="grow-0 self-center flex flex-col py-1 text-white/60 glass rounded-full border mx-8">
      <button className="p-3">
        <SquarePlusIcon />
      </button>

      <button className="p-3">
        <GalleryVerticalEndIcon />
      </button>
      <div className="m-3 w-6 h-6 rounded-full flex items-center justify-center ai-shadow" />
      <button className="p-3">
        <Volume2Icon />
      </button>
      <button className="p-3">
        <ClosedCaptionIcon />
      </button>
    </div>
  );
}
