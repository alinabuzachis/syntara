from enum import Enum


class LLMProviderHint(str, Enum):
    ANTHROPIC = "anthropic"
    CUSTOM = "custom"
    GEMINI = "gemini"
    OPENAI = "openai"
    RED_HAT_AI = "red_hat_ai"

    def __str__(self) -> str:
        return str(self.value)
