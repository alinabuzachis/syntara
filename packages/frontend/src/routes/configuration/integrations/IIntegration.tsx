export interface IIntegration {
  id: number;
  name: string;
  type: string;
  description?: string;
  status?: "connected" | "disconnected";
  url?: string;
}
