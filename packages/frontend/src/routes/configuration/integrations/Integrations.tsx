import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { ChatInput } from "../../../components/chat/ChatInput";

export default function Integrations() {
  return (
    <AppPage>
      <AppPageHeader title="Integrations" />
      <div className="flex flex-col glass rounded-3xl p-8 border grow overflow-auto max-h-full h-full">
        <div
          className={`grid gap-4 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]`}
        >
          {new Array(30).fill(0).map((_, i) => (
            <div key={i} className="p-8 glass rounded-2xl border">
              <div>Integration {i + 1}</div>
              <div className="text-white/70">MCP Server</div>
            </div>
          ))}
        </div>
      </div>
      <ChatInput />
    </AppPage>
  );
}
