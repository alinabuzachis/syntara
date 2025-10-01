import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IIntegration } from "./IIntegration";

const defaultIntegrations: IIntegration[] = [
  {
    id: 1,
    name: "Ansible Automation Platform",
    type: "MCP Server",
    description:
      "Ansible Automation Platform is an enterprise framework for building and operating IT automation at scale.",
    status: "connected",
    url: "https://ansible.example.com",
  },
  {
    id: 2,
    name: "GitHub",
    type: "Version Control",
    description:
      "GitHub is a code hosting platform for version control and collaboration.",
    status: "disconnected",
    url: "https://github.example.com",
  },
  {
    id: 3,
    name: "Kubernetes Cluster",
    type: "MCP Server",
    description:
      "A Kubernetes cluster is a set of node machines for running containerized applications.",
    status: "connected",
    url: "https://k8s.example.com",
  },
];

interface IntegrationsStore {
  integrations: IIntegration[];
  addIntegration: (integration: Omit<IIntegration, "id">) => void;
  editIntegration: (id: number, integration: Partial<IIntegration>) => void;
  deleteIntegration: (id: number) => void;
}

export const useIntegrations = create<IntegrationsStore>()(
  persist(
    (set) => ({
      integrations: defaultIntegrations,
      addIntegration: (integration) =>
        set((state) => ({
          integrations: [
            ...state.integrations,
            {
              ...integration,
              id: Math.max(0, ...state.integrations.map((i) => i.id)) + 1,
            },
          ],
        })),
      editIntegration: (id, updates) =>
        set((state) => ({
          integrations: state.integrations.map((i) =>
            i.id === id ? { ...i, ...updates } : i,
          ),
        })),
      deleteIntegration: (id) =>
        set((state) => ({
          integrations: state.integrations.filter((i) => i.id !== id),
        })),
    }),
    {
      name: "integrations-storage",
    },
  ),
);
