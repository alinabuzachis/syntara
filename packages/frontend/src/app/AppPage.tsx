import { AppLeftBar } from "./AppLeftBar";
import { AppRightBar } from "./AppRightBar";

export function AppPage(props: { children: React.ReactNode }) {
  return (
    <div className="flex grow overflow-hidden gap-4">
      <AppLeftBar />
      <div className="flex flex-col grow gap-6 pb-8 max-h-full">
        {props.children}
      </div>
      <AppRightBar />
    </div>
  );
}
