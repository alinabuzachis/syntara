import { RedHatIcon } from "../components/icons/RedHatIcon";
import { AppNavigation } from "./AppNavigation";

export function AppHeader() {
  return (
    <div className="p-8 pb-8 flex justify-center">
      <div className="left-8 top-7 absolute flex gap-4 items-center">
        <RedHatIcon />
        <div className="flex flex-col">
          <span className="text-[#e00] text-sm font-extrabold">Red Hat</span>
          <span className="text-4xl font-bold text-white leading-7">
            Automation
          </span>
        </div>
      </div>

      <AppNavigation />

      <div className="absolute right-8 top-8 flex flex-row gap-4 items-center">
        <div className="flex flex-col text-right">
          <span className="text-white text-lg leading-5">Demo</span>
          <span className="text-sm text-white/70 leading-5">Coffee</span>
        </div>
        <div className="glass border flex flex-row gap-4 items-center justify-center text-xl text-white w-12 h-12 rounded-full">
          DC
        </div>
      </div>
    </div>
  );
}
