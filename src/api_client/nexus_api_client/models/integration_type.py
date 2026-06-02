from enum import Enum


class IntegrationType(str, Enum):
    AAP_GATEWAY = "aap_gateway"
    LLM_PROVIDER = "llm_provider"
    MCP_SERVER = "mcp_server"

    def __str__(self) -> str:
        return str(self.value)
