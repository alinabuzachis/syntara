import type { IIntegration } from "./IIntegration";

export function useIntegrations() {
  const integrations: IIntegration[] = [
    {
      name: "Ansible Automation Platform",
      type: "MCP Server",
      description:
        "Ansible Automation Platform is an enterprise framework for building and operating IT automation at scale.",
      status: "connected",
      url: "https://ansible.example.com",
    },
    {
      name: "GitHub",
      type: "Version Control",
      description:
        "GitHub is a code hosting platform for version control and collaboration.",
      status: "disconnected",
      url: "https://github.example.com",
    },
    {
      name: "Kubernetes Cluster",
      type: "MCP Server",
      description:
        "A Kubernetes cluster is a set of node machines for running containerized applications.",
      status: "connected",
      url: "https://k8s.example.com",
    },
  ];
  return { integrations };
}
