# **Feature Description**
## **Functionality Overview**
**Summary**: Transforms Automation Platform from an experience focused on the Ansible model, where automation content is still developed with technical know-how, into the premier enterprise platform for human-in-the-loop agentic orchestration, enabling users to visually design, launch, monitor, and interact with complex, hybrid, AI-driven automation through a unified workflow designer.
This specification outlines the development of the Automation Nexus workflow engine. This engine is a core component of the Agentic Nexus platform, designed to orchestrate complex, hybrid workflows that combine AI agents, traditional automation, and human-in-the-loop processes. The system will function as the central orchestration layer, connecting AI models and enterprise tools.
Conceptually, this experience builds on ideas of conversational (chat, form, etc. that enable bi-directional inputs and outputs) and a drag-and-drop workflow builder that connects agentic automation with AI services, enterprise systems, and existing tools, providing a single visual control plane for designing, executing, and monitoring workflows, and laying the groundwork for extending automation beyond IT. The expected impact includes faster adoption and broader reach, consistent governance across domains, and greater integration flexibility.
The workflow engine is a required backend system for both task management and the design of agents and tasks. Its purpose is to provide an advanced system that enables collaboration between humans and LLM-driven agents for designing automation, making decisions, and executing tasks. By creating a powerful and flexible workflow engine, the team can establish a solid foundation for the platform's Domain-Specific Language (DSL) and API contract, which will be formally defined using the **OpenAPI Specification**, ensuring it meets long-term integration needs.
Key capabilities of the workflow engine include:
* **Scalable and Reliable Execution**: The engine must enable the reliable execution of automated tasks at scale.  
* **Workflow Orchestration**: It will ingest workflow definitions, validate them, and manage their lifecycle, including scheduling, execution, and monitoring.  
* **Dynamic and Hybrid Workflows**: The engine will support dynamic workflows created by a planning agent in response to user prompts, as well as workflows that are manually customized by users. It will orchestrate both parallel and sequential operations across multiple agents.  
* **Integration with Agentic Systems**: The workflow engine is a key part of the "Orchestration & Scheduling" layer, responsible for executing workflows rendered by the Agent Management Layer and providing feedback to inform future tasks.  
* **Human-in-the-Loop**: The system must support human approval steps as a defined part of any workflow activity, allowing organizations to maintain oversight and control.  
* **Durability and Fault Tolerance**: The engine must be fault-tolerant, capable of handling failures gracefully, supporting task retries, and resuming operations without interrupting in-flight jobs.
---
## **Success Criteria**
1. **User Experience & Adoption** These criteria measure the platform's ability to drive rapid adoption and empower a broader range of users through its visual design interface.  
   * **Reduced Time-to-First-Workflow**: A non-technical user, with minimal training, can successfully design, launch, and monitor a simple automation workflow within 30 minutes of platform access.  
   * **Workflow Designer Usability**: The drag-and-drop workflow builder receives a usability score of 85% or higher in a post-launch user satisfaction survey, with a focus on ease of connecting services and tools.  
2. **Agentic & AI Capabilities** These criteria focus on the successful integration and orchestration of AI services and human intervention points within complex workflows.  
   * **Human-in-the-Loop Adoption**: Designed workflows requiring human approval or data enrichment successfully utilize the "human-in-the-loop" feature.  
   * **Complex Workflow Execution**: The platform can successfully execute a complex hybrid workflow involving at least one AI service, one enterprise system, and a human-in-the-loop approval step.  
3. **Enterprise Integration & Flexibility** These criteria measure the platform's ability to seamlessly connect with existing enterprise systems and provide a flexible foundation for future growth.  
   * **Connector Availability**: The platform launches with out-of-the-box connectors for at least 10 core enterprise systems, covering key domains such as CRM, ITSM, and cloud services.  
   * **Custom Integration Success**: A documented API, specified using **OpenAPI 3.0**, or a software development kit (SDK) for building custom connectors is used by at least 5 different internal development teams to create and deploy new integrations.  
   * **Unified Control Plane**: The platform successfully provides a single, unified view for monitoring and managing workflows that span across legacy tools and new agentic automation, with no more than 1% of monitored workflows requiring manual oversight outside of the platform.  
4. **Governance & Scalability** These criteria evaluate the platform's ability to provide consistent governance and reliable performance as it scales across the enterprise.  
   * **Consistent Policy Enforcement**: The platform's governance features are successfully used to apply and enforce consistent access controls and execution policies across three distinct business domains (e.g., IT Operations, Marketing, Finance).  
   * **Reporting and Auditing**: A comprehensive reporting and auditing dashboard is available, allowing a governance team to generate a full report on workflow usage, performance, and compliance within 5 minutes.
---
## **Crosscutting Concepts**
1. **Security**  
   * **Authorization**: The system will support Role-Based Access Control (RBAC).  
   * **Human & Policy Guardrails**: Activities such as executing scripts or playbooks must be guarded by human and policy approvals.  
   * **Audit Logging**: All user and system actions, especially workflow execution history and activity logs, will be logged for compliance and security.  
2. **Scalability**  
   * **Concurrent Operations**: The platform must be able to support at least 1000 concurrent automation jobs.  
   * **Horizontal Scaling**: The architecture will be based on stateless microservices to allow for horizontal scaling.  
3. **Reliability**  
   * **Fault Tolerance**: The architecture must be resilient and able to recover from single service failures without interrupting active jobs. This includes support for task retries and durable execution.  
   * **Data Durability**: The system will use persistence strategies to ensure state can be recovered after failures.
---
## **Workflow API**
An API-first approach is required for all components. All API endpoints must be documented using the **OpenAPI Specification (OAS)**, ensuring clarity for both internal UI development and external programmatic consumers. This API will serve as the primary interface for all interactions with the workflow engine, supporting both the user interface and programmatic access.
The API must provide comprehensive capabilities for managing the entire lifecycle of workflows and their constituent activities. This includes programmatic control over:
* **Workflow Definition Management**: Functionality to create, retrieve, update, and delete workflow definitions. The API should also support versioning of these definitions.  
* **Workflow Execution Control**: Capabilities to trigger new workflow instances and manage their state, including pausing, resuming, canceling, and terminating active executions.  
* **Activity Interaction**: Methods to manage and interact with individual activities within a running workflow. This includes the ability to approve pending human-in-the-loop steps, retry failed activities, and cancel specific tasks.  
* **Monitoring and Auditing**: Access to detailed information about workflow executions. The API must expose execution history, comprehensive logs for both entire workflows and individual activities, and the status of all activities within a workflow instance.  
* **Resource Discovery**: An endpoint to list all available activity types that can be used within a workflow. This endpoint, along with all others, will be clearly defined in the **OpenAPI document**, allowing clients to dynamically discover the engine's capabilities and build integrations accordingly.
---
## **Requirements**
1. The workflow engine backend will leverage Temporal.  
2. We must develop it in Python.  
3. Workflows must support parallel and sequential execution of activities.  
4. Workflows must support conditional flows.  
5. Workflows must support human-in-the-loop capability at any point.
---
## **General Notes**
1. We are aiming to have the Nexus system dynamically construct workflows in a standard format that can be read into our Temporal workflow engine as well as support manual workflow design. A user may update workflows both via the agentic Nexus and manually.  
2. The output from the Nexus system will include a structured workflow defined in YAML, which must be backed by a schema.  
   1. This will define the workflow operations, its schedule, and other related data.  
3. We need to be able to read in the structured workflow definition and be able to execute it.  
4. We need to have API capability to CRUD workflows, version them, and trigger them (schedule/manual/continuous triggers) via API. We also need to be able to read the data for each individual activity in the workflow. All of these API endpoints will be formally specified in an **OpenAPI definition**, which will serve as the single source of truth for API contracts.
