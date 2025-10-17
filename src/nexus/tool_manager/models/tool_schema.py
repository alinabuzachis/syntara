"""Tool schema models."""

from dataclasses import dataclass
from typing import Any


@dataclass
class ToolSchema:
    """Schema definition for a tool.

    Attributes:
        name: Name of the tool
        description: Description of what the tool does
        input_schema: JSON schema defining the tool's input parameters
        output_schema: Optional JSON schema defining the tool's output format
        examples: Optional list of usage examples

    """

    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any] | None = None
    examples: list[dict[str, Any]] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "examples": self.examples,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ToolSchema":
        """Create instance from dictionary."""
        return cls(
            name=data["name"],
            description=data["description"],
            input_schema=data["input_schema"],
            output_schema=data.get("output_schema"),
            examples=data.get("examples"),
        )
