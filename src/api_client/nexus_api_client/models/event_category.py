from enum import Enum


class EventCategory(str, Enum):
    AGENT_INTERACTION = "agent_interaction"
    API_EXECUTION = "api_execution"
    LLM_INTERACTION = "llm_interaction"
    LLM_REASONING = "llm_reasoning"
    LLM_TOOL_CALL = "llm_tool_call"
    SECURITY_EVENT = "security_event"
    SYSTEM_OPERATION = "system_operation"
    USER_ACTION = "user_action"
    WORKFLOW_EVENT = "workflow_event"

    def __str__(self) -> str:
        return str(self.value)
