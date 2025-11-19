"""Context Manager module for Nexus agent orchestration.

Provides scaffolding for context retrieval, compression, and assembly
to support coordinated AI agent workflows.
"""

from .assembler import AssemblerService
from .compressor import CompressorService
from .config import get_default_config, get_required_grounding_score
from .models import ContextPackage
from .planner import ContextManagerPlanner
from .retriever import RetrieverService

__all__ = [
    "AssemblerService",
    "CompressorService",
    "ContextManagerPlanner",
    "ContextPackage",
    "RetrieverService",
    "get_default_config",
    "get_required_grounding_score",
]
