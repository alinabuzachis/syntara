export interface IIntegration {
  name: string;
  type: string;
  description?: string;
  status?: "connected" | "disconnected";
  url?: string;
}
