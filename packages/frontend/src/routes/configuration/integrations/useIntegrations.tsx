import type { IIntegration } from "./IIntegration";
import { createCrud } from "./createCrud";

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

export const useIntegrations = createCrud<IIntegration>(
  "integrations",
  defaultIntegrations
);
