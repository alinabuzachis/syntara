# Feature Specification: Core Agent

**Feature Branch**: `002-core-agent`  
**Created**: 2025-09-25  
**Status**: Draft

## Overview

The Core Agent functions as the central workflow generation engine of the Automation Nexus System. It interprets natural language user requests by leveraging four critical components: the **Guidance component** for contextual intelligence and policy recommendations, the **Context Manager component** for maintaining decision context and historical patterns, the **Tools Registry component** to discover available tools and sub-agents, and generates **executable workflows** that other system components can execute. The Core Agent focuses on intelligent workflow planning rather than execution, ensuring that complex automation tasks are properly structured with appropriate tool selection, sub-agent coordination, sequencing, and human approval gates.

### Architectural Position & Core Responsibilities

**Tool Discovery and Workflow Generation**: The Core Agent sits at the heart of the workflow generation process, analyzing user requests and identifying required capabilities. It utilizes a Tool Registry that contains information about available tools, their capabilities, parameters, and suitability for specific tasks. The Core Agent analyzes requirements and generates workflows that specify which tools should be used and how they should be coordinated to accomplish the user's objectives.

**Intelligent Decision Making**: The Core Agent performs sophisticated decision-making processes for tool coordination and intelligent analysis for tool selection. It accesses the Context Manager component to retrieve relevant contextual information that informs its decisions, and manages the workflow generation lifecycle from planning through completion.

**Context Manager Integration**: The Core Agent utilizes an external Context Manager component that maintains working memory for active decisions, short-term memory for recent interactions and patterns, and long-term memory for historical workflow patterns and audit trails.

**Guidance Integration**: The Core Agent consults an external Guidance component that provides contextual intelligence for tool selection and workflow generation. The Guidance component delivers hierarchical recommendations based on organizational policies, domain expertise, and user preferences, enabling the Core Agent to make informed workflow generation decisions while maintaining consistency and compliance.

**Dynamic Workflow Generation**: The Core Agent creates complex multi-phase workflows:
- **Phase 1: Request Analysis** - Analyzes user requests, identifies required capabilities, and gathers context
- **Phase 2: Tool Assessment** - Evaluates available tools and determines optimal combinations with policy evaluation
- **Phase 3: Workflow Creation** - Generates structured workflows with defined steps, dependencies, and approval gates
- **Phase 4: Visual Documentation** - Generates mermaid diagrams that visualize workflow structure, component relationships, and execution flow for stakeholder review and documentation

**Human-in-the-Loop Integration**: The Core Agent designs workflows with human oversight capabilities:
- **Approval Gates**: Strategic points where human review and authorization are required
- **Policy Enforcement**: Integration with organizational policies for configurable approval requirements
- **Interactive Elements**: Workflow components that support real-time user interaction and intervention
- **Transparency Features**: Comprehensive workflow visibility with clear decision rationale

**Zero-Trust Secrets Management**: The Core Agent operates through a controlled intermediary layer that manages secure credential access, ensuring that sensitive information is accessed only through validated policy-driven requests.

**Tool Integration**: The Core Agent identifies and selects appropriate external tools for workflow generation including development platforms, service management systems, monitoring tools, directory services, and custom integrations. Tool selection follows guidance patterns with contextual instruction resolution.

## Execution Flow (main)
```
1. Parse user description from Input
   � If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   � Identify: actors, actions, data, constraints
3. For each unclear aspect:
   � Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   � If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   � Each requirement must be testable
   � Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   � If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   � If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## � Quick Guidelines
- Focus on WHAT users need and WHY
- Avoid HOW to implement (no tech stack, APIs, code structure)
- Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation
When creating this spec from a user prompt:
1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies  
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## User Scenarios & Testing

### Primary User Story
A system administrator or business user wants to accomplish complex automation tasks by providing natural language instructions. They describe what they want to achieve, and the Core Agent interprets their request, determines which tools are needed, creates an executable workflow definition, and allows the user to review and approve the workflow before it is handed off to execution systems.

### Acceptance Scenarios
1. **Given** a user provides a natural language prompt "Deploy the customer service application to production with health checks", **When** the Core Agent processes the request with available guidance and policies, **Then** the system generates a workflow with deployment steps, validation checks, and approval gates that the user can review and modify.

2. **Given** the Core Agent has identified required tools and created a workflow, **When** the user reviews the proposed workflow, **Then** the user can edit workflow steps, add approval points, modify tool parameters, or reject the workflow entirely.

3. **Given** the Core Agent encounters multiple possible tool combinations for a task, **When** the Guidance component provides recommendations and constraints, **Then** the agent selects the most appropriate tools while respecting the guidance provided.

### Edge Cases
- What happens when user prompt is ambiguous or contradicts existing policies?
- How does the system handle situations where no suitable tools are available for the requested task?
- How does the Core Agent design workflows that handle execution failures and recovery scenarios?
- How does the agent respond when the Guidance component is unavailable or provides conflicting recommendations?
- What occurs when guidance recommendations conflict with available tool capabilities?

## Requirements

### Functional Requirements
- **FR-001**: System MUST accept natural language user prompts describing desired automation tasks
- **FR-002**: Core Agent MUST consult external Guidance component when interpreting user prompts
- **FR-003**: Core Agent MUST utilize Context Manager component for maintaining decision context and historical patterns
- **FR-004**: Core Agent MUST discover and evaluate available tools and sub-agents from Tools Registry component based on task requirements
- **FR-005**: Core Agent MUST apply organizational policies during tool selection process with immutable security/compliance rules taking precedence
- **FR-006**: Core Agent MUST generate or update executable workflows showing tool invocation order, dependencies, and sub-agent coordination
- **FR-007**: Users MAY be able to engage in a chat with the Core Agent to provide additional context needed to generate a workflow
- **FR-008**: Users MUST be able to review and edit generated workflows before execution either manually or via chat with the Core Agent
- **FR-009**: Core Agent MUST generate complete workflow definitions with clear execution requirements
- **FR-010**: Core Agent MUST identify when specialized sub-agent capabilities are needed and specify them in workflows
- **FR-011**: Core Agent MUST validate tool and sub-agent availability before generating workflow recommendations
- **FR-012**: Core Agent MUST respect rate limits and resource constraints when invoking tools during workflow generation, with fallback mechanisms in place
- **FR-013**: Core Agent MUST receive user identity and role information from the SYSTEM to determine appropriate guidance and policies to apply
- **FR-014**: Core Agent MUST rely on Guidance and Policy services for sensitive data access controls
- **FR-015**: Core Agent MUST expose an API for other components to interact with it.
- **FR-016**: Core Agent MUST only execute read operations.
- **FR-017**: Core Agent MUST NOT execute write operations. Write operations are handled by the Workflow.

### Key Entities
- **User Prompt**: Natural language instruction describing desired automation task, including context and constraints
- **Core Agent**: An agent capable of doing research, creating and/or using other specialized agents and building workflows including agentic nodes with agentic loops.
- **Specialized Agent**: Focused capability for specific domains (workflow creator, monitoring, deployment, analysis, etc)
- **Guidance component**: Service that provides contextual recommendations for tool selection and workflow generation
- **Guidance Recommendation**: Contextual advice from Guidance component about appropriate tools and workflow patterns for specific requests
- **Context Manager component**: Service that maintains working memory, short-term patterns, and long-term historical data for informed decision making
- **Tool Registry**: Centralized catalog containing information about available tools, their capabilities, and usage requirements
- **Tool**: External service, application, or capability that can be invoked to perform specific automation tasks
- **Policy**: Organizational constraints and security rules that govern agent behavior and tool usage
- **Workflow**: Executable sequence of tool invocations with defined order, dependencies, and approval gates
- **Workflow instance**: Runtime instance of a Workflow with current state, execution history, logs, and status information
- **Activity**: Individual tasks within a workflow that can be agentic (AI-driven), non-agentic (traditional automation), or human-interactive
- **Approval Gate**: Human intervention point where user review and authorization is required before proceeding
- **Audit Record**: Immutable log of decisions, approvals, and execution outcomes for compliance tracking and organizational learning
---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous  
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
