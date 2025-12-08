"""Domain-specific exceptions for RetrieverService framework."""


class RetrieverServiceError(Exception):
    """Base exception for RetrieverService framework."""


class DocumentRetrievalError(RetrieverServiceError):
    """Error during document retrieval from storage backend."""


class RelevancyCheckError(RetrieverServiceError):
    """Error during relevancy checking process."""


class ConfigurationError(RetrieverServiceError):
    """Error in configuration validation or loading."""


class RegistryError(RetrieverServiceError):
    """Error in registry operations (registration, lookup, etc.)."""


class LLMRelevancyError(RelevancyCheckError):
    """Specific error during LLM-based relevancy checking."""


class StorageBackendError(DocumentRetrievalError):
    """Error accessing storage backend."""
