> /specify is running… 022-agentic-task-execution

Read specs/022-agentic-task-execution/requirements.md

We need to integrate our Tool Manager with the Agent Orchestrator.

Specifically existing source code for these components is:

# Tool Manager

- REST API to be consumed: src/nexus/api/v1/tool_providers.py
- REST API to be consumed: src/nexus/api/v1/tools.py
- Tool Manager source: src/nexus/tool_manager

# Agent Orchestrator

- Agentic Orchestrator source: src/nexus/agent_orchestrator/services/orchestration_service.py

The Agentic Orchestrator is to use a new Tool Manager client to interface with the REST APIs.

The Agentic Orchestrator is to construct the necessary langgraph BaseTools from the Tool Manager metadata.

The Agentic Orchestrator is to integrate langgraph Tool calling into its StateGraph.
