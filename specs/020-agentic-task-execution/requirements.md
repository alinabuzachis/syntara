# AAP-57943: Agent Orchestrator: Tool Manager integration and Tool execution

AAP-57943

## *Background*

This Epic establishes the Intelligent Service Layer of the Agent Orchestrator, focusing on its role as a dedicated resource for the Workflow Engine. It implements intelligent routing required to embed non-deterministic (agentic) tasks within repeatable workflows. The core value is providing the Workflow Engine with a reliable contract to delegate tasks, enforce guardrails (tool constraints, guidelines), and receive clean, structured data upon completion, ensuring robust and secure automation.

## *User Stories*

 * As the Workflow Engine I want a dedicated API endpoint for the Agent Orchestrator so that I can reliably execute agentic tasks within a workflow.
 * As the Workflow Engine I want to be able to pass execution guidelines to the Agent Orchestrator so that I can define the agent's behavior for reliable, secure execution within a defined workflow.
 * As a Nexus Developer, I want the Agent Orchestrator to communicate with the Tool Manager API so its agents can use available tools.


# AAP-55696: Tool Manager: Implement HTTP Client for integration with Agent Orchestrator

AAP-55696

## *User Story*

As a Nexus platform developer, I want a client library for the Tool Manager REST API and integration of that library into the Agent Orchestrator so that the orchestrator can reliably interact with tool definitions and capabilities.

## *Supporting documentation*

- Tool Manager specification: https://github.com/syntara-orchestration/syntara/tree/main/specs/004-tool-management

- Agent Orchestrator specification: https://github.com/syntara-orchestration/syntara/tree/main/specs/002-agent-orchestrator

## *Requirements*

- Implement a new client library that wraps the Tool Manager REST API endpoints required by the Agent Orchestrator.

- Support operations such as retrieving tool definitions and querying tool configurations.

- Provide standardized serialization/deserialization of all REST payloads.

- Include robust error handling, including timeouts, retries, and structured error responses.

- Integrate the client library into the Agent Orchestrator interaction flow.

- Provide configuration options for API endpoint, credentials, and request timeouts.

# AAP-60416: Agent Orchestrator: Integrate Tool Manager client

AAP-60416

## *User Story*

As an Agent Orchestrator developer, I want the orchestrator to access Tool Providers and enabled Tools via the Tool Manager client so that Inovcations can dynamically discover and use the correct tools at runtime.

## *Supporting documentation*

- Tool Manager specification: https://github.com/syntara-orchestration/syntara/tree/main/specs/004-tool-management

- Agent Orchestrator specification: https://github.com/syntara-orchestration/syntara/tree/main/specs/002-agent-orchestrator

## *Requirements*

- Update Agent Orchestrator logic to use the client library for all Tool Provider and Tool discovery operations.

- Ensure the orchestrator can identify which tools are enabled and accessible at runtime.

- Provide a structured data model for Tool Providers and Tools within the orchestrator.

- Validate error scenarios such as missing providers, disabled tools, or unavailable API endpoints.

- Provide configuration options for API URLs, credentials, and request handling behavior.

# AAP-60417: Agent Orchestrator: Add Tool calling support

AAP-60417

## *User Story*

As an Agent Orchestrator developer, I want the orchestrator to use metadata for available and enabled tools, -filter those tools based on user prompts,- and configure langgraph to support tool calling so that the orchestrator can dynamically select and invoke the correct tools during agent invocations.

## *Supporting documentation*

 - Tool Manager specification: [https://github.com/syntara-orchestration/syntara/tree/main/specs/004-tool-management]

 - Agent Orchestrator specification: [https://github.com/syntara-orchestration/syntara/tree/main/specs/002-agent-orchestrator]

 - Langgraph documentation: [https://www.langchain.com/langgraph]

 - Langgraph integration and tool-calling examples:
   - [https://sangeethasaravanan.medium.com/building-tool-calling-agents-with-langgraph-a-complete-guide-ebdcdea8f475]
   - [https://shakti-pawar.medium.com/langgraph-tool-calling-agents-02fdfbd86e8b]

## *Requirements*

 - Agent Orchestrator must use metadata for all available and enabled Tools retrieved from Tool Manager.

 - Langgraph must be configured to load and register the filtered tools for execution.

 - Agent Orchestrator must support Tool Calling end-to-end, including:

 - Passing input arguments from prompt context

 - Executing the tool function

 - Returning structured results back to the agent workflow

 - Provide error handling for unavailable tools, invalid tool responses, or tool invocation failures.

 - Provide logs and metrics for tool invocation events.
