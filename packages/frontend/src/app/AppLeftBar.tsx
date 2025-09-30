import {
  ClosedCaptionIcon,
  GalleryVerticalEndIcon,
  Volume2Icon,
} from "lucide-react";

export function AppLeftBar() {
  return (
    <div className="grow-0 self-center flex flex-col py-1 text-white/60">
      <button className="p-3">
        <GalleryVerticalEndIcon />
      </button>
      {/* <div
            className="m-3 w-6 h-6 border border-violet-400 rounded-full flex items-center justify-center "
            style={{
              boxShadow:
                "0 0 12px #a78bfa80, inset 0 0 8px #fbbf2480, 0 0 4px violet",
            }}
          ></div> */}
      <button className="p-3">
        <Volume2Icon />
      </button>
      <button className="p-3">
        <ClosedCaptionIcon />
      </button>
    </div>
  );
}
