"""AssemblerService implementation for context package assembly.

This module implements the AssemblerService which assembles RelevantDocuments
into ContextPackage objects with token validation and compression retry support.
"""

from typing import Any
from uuid import UUID

import structlog
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.context_manager.compressor import CompressorService
from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.context_manager.retriever_service.models import RelevantDocument
from nexus.agent_orchestrator.exceptions import AgentOrchestratorError
from nexus.agent_orchestrator.token_manager.exceptions import TokenLimitExceededError
from nexus.agent_orchestrator.token_manager.services import TokenValidationService

logger = structlog.stdlib.get_logger(__name__)


class ContextAssemblyError(AgentOrchestratorError):
    """Raised when context assembly fails due to unrecoverable errors.

    This exception indicates that the assembly process cannot continue,
    typically due to token limits being exceeded even after all compression
    retry attempts are exhausted, or other validation failures.

    Examples:
        - Token limit exceeded after all compression_loop retries exhausted
        - Invalid or corrupted input documents
        - Required services unavailable
        - Malformed payload structure

    Attributes:
        message: Human-readable error description
        correlation_id: Correlation ID for tracing (if available)
        retry_count: Number of compression retries attempted (if applicable)
        original_exception: Underlying exception (if applicable)

    """

    def __init__(
        self,
        message: str,
        correlation_id: str | None = None,
        retry_count: int | None = None,
        original_exception: Exception | None = None,
    ) -> None:
        """Initialize ContextAssemblyError.

        Args:
            message: Error description
            correlation_id: Optional correlation ID for tracing
            retry_count: Optional number of retries attempted
            original_exception: Optional underlying exception

        """
        super().__init__(message)
        self.correlation_id = correlation_id
        self.retry_count = retry_count
        self.original_exception = original_exception


class AssemblerService:
    """Service for assembling final context packages from retrieved documents.

    Coordinates token validation, compression retry loop with progressive
    strategies, grounding score computation, citation extraction from
    FileMetadata.id, and document content organization.

    - Added compression_loop parameter for retry control
    - Citations from FileMetadata.id (unique identifier, avoids ambiguity)
    - NO System/User Prompt handling (out of scope)
    """

    def __init__(
        self,
        token_service: TokenValidationService | None = None,
        compressor_service: CompressorService | None = None,
    ) -> None:
        """Initialize assembler with injected dependencies.

        Args:
            token_service: Service for token counting and limit validation
            compressor_service: Service for content compression with multiple strategies

        """
        self.token_service = token_service or TokenValidationService()
        self.compressor_service = compressor_service

    async def assemble(
        self,
        documents: list[RelevantDocument] | None,
        correlation_id: str,
        max_tokens: int,
        compression_loop: int,
        invocation_id: UUID | None = None,
        user_id: UUID | None = None,
        session: AsyncSession | None = None,
    ) -> "ContextPackage":
        """Assemble RelevantDocuments into ContextPackage with retry loop.

        Implements compression retry with progressive strategies:
        1. Validate original documents against token budget - compress if exceeded
        2. Retry with increasingly aggressive strategies up to compression_loop limit
        3. Validate after each retry - reject if all retries exhausted

        Args:
            documents: Retrieved documents from RetrieverService (existing model)
            correlation_id: Correlation ID for distributed tracing
            max_tokens: Maximum allowable tokens for assembled content
            compression_loop: Maximum number of compression retry attempts (0 = no retries)
            invocation_id: Optional invocation ID for foreign key reference
            user_id: Optional user ID for token usage tracking
            session: Optional database session for token validation

        Returns:
            ContextPackage with assembled document content, grounding score,
            citations from FileMetadata.id, and package metadata

        Raises:
            ContextAssemblyError: When token limits exceeded after all compression
                retries exhausted or other unrecoverable assembly failures
            TokenLimitExceededError: When token validation fails (if user_id provided)

        """
        logger.info(
            "Starting assembly",
            correlation_id=correlation_id,
            document_count=len(documents) if documents else 0,
        )

        # Handle empty or null documents
        if not documents:
            logger.info(
                "Empty or null documents, returning default ContextPackage",
                correlation_id=correlation_id,
            )
            return ContextPackage(
                correlation_id=correlation_id,
                invocation_id=invocation_id,
                payload={},
                grounding_score=0.0,
                citations=[],
                package_metadata={
                    "compression_applied": False,
                    "compression_retry_count": 0,
                    "original_token_count": 0,
                    "final_token_count": 0,
                },
            )

        # Track compression state
        compression_applied = False
        retry_count = 0
        working_docs = documents
        original_token_count = 0
        final_token_count = 0

        # Stage 1: Pre-compression token validation
        combined_content = "\n".join([doc.content for doc in working_docs])

        # If user_id and session provided, use TokenValidationService for validation
        if user_id is not None and session is not None:
            try:
                logger.debug(
                    "Validating token budget with TokenValidationService",
                    correlation_id=correlation_id,
                    user_id=str(user_id),
                )
                original_token_count = await self._validate_tokens(
                    content=combined_content,
                    user_id=user_id,
                    session=session,
                    invocation_id=invocation_id,
                )
                final_token_count = original_token_count

                logger.info(
                    "Documents within token budget, no compression needed",
                    correlation_id=correlation_id,
                    token_count=original_token_count,
                    max_tokens=max_tokens,
                )

            except TokenLimitExceededError as e:
                logger.info(
                    "Token limit exceeded, triggering compression retry loop",
                    correlation_id=correlation_id,
                    current_usage=e.current_usage,
                    token_limit=e.token_limit,
                    request_tokens=e.request_tokens,
                )

                # Stage 2: Invoke compression with retry
                original_token_count = e.request_tokens
                working_docs, retry_count = await self._compress_with_retry(
                    documents=working_docs,
                    max_tokens=max_tokens,
                    compression_loop=compression_loop,
                    correlation_id=correlation_id,
                    user_id=user_id,
                    session=session,
                    invocation_id=invocation_id,
                )
                compression_applied = True

                # Calculate final token count after compression
                compressed_content = "\n".join([doc.content for doc in working_docs])
                final_token_count = self.token_service.calculator.count_tokens(compressed_content)

        else:
            # No user_id/session - skip token validation (testing mode)
            logger.warning(
                "Skipping token validation - no user_id or session provided",
                correlation_id=correlation_id,
            )

        # Build payload with final documents
        payload = self._build_payload(working_docs, compression_applied=compression_applied)

        # Compute grounding score
        grounding_score = self._compute_grounding_score(working_docs)

        # Extract citations from FileMetadata.id
        citations = self._extract_citations(working_docs)

        # Build final ContextPackage
        package_metadata = {
            "compression_applied": compression_applied,
            "compression_retry_count": retry_count,
            "original_token_count": original_token_count,
            "final_token_count": final_token_count,
        }

        context_package = ContextPackage(
            correlation_id=correlation_id,
            invocation_id=invocation_id,
            payload=payload,
            grounding_score=grounding_score,
            citations=citations,
            package_metadata=package_metadata,
        )

        logger.info(
            "Assembly complete",
            correlation_id=correlation_id,
            grounding_score=grounding_score,
        )

        return context_package

    def _compute_grounding_score(
        self,
        documents: list[RelevantDocument],
    ) -> float:
        """Compute grounding score as simple average of relevancy scores.

        Args:
            documents: List of RelevantDocuments

        Returns:
            Simple average of relevancy_score values

        """
        if not documents:
            return 0.0

        # Extract valid scores (exclude None and out-of-range values)
        valid_scores = [
            doc.relevancy_score
            for doc in documents
            if doc.relevancy_score is not None and 0.0 <= doc.relevancy_score <= 1.0
        ]

        if not valid_scores:
            return 0.0

        return float(sum(valid_scores) / len(valid_scores))

    def _extract_citations(
        self,
        documents: list[RelevantDocument],
    ) -> list[str]:
        """Extract id values from RelevantDocument.file_metadata.id attributes.

        Citations are simply id strings from original documents.
        Compression does not generate new ids.

        Args:
            documents: List of RelevantDocuments

        Returns:
            List of id strings (UUIDs as strings)

        """
        citations = []

        for doc in documents:
            if doc.file_metadata and hasattr(doc.file_metadata, "id") and doc.file_metadata.id:
                citations.append(str(doc.file_metadata.id))
            else:
                logger.warning("Document missing file_metadata or id, skipping citation extraction")

        return citations

    def _build_payload(
        self,
        documents: list[RelevantDocument],
        compression_applied: bool,  # noqa: FBT001 - Simple flag parameter
    ) -> dict[str, Any]:
        """Build payload with assembled document content.

        Args:
            documents: List of RelevantDocuments
            compression_applied: Whether compression was applied

        Returns:
            Payload dictionary with document content

        """
        # Assemble document content into payload
        document_contents = [
            {
                "content": doc.content,
                "source_type": doc.source_type,
                "relevancy_score": doc.relevancy_score,
            }
            for doc in documents
            if doc.content
        ]

        return {
            "documents": document_contents,
            "compression_applied": compression_applied,
        }

    async def _validate_tokens(
        self,
        content: str,
        user_id: UUID,
        session: AsyncSession,
        invocation_id: UUID | None,
    ) -> int:
        """Validate content against token budget via TokenValidationService.

        Args:
            content: Text to validate
            user_id: User ID for token usage tracking
            session: Database session for token validation
            invocation_id: Optional invocation ID for foreign key reference

        Returns:
            Token count from validation

        Raises:
            TokenLimitExceededError: When token validation fails

        """
        return await self.token_service.validate_and_record(
            user_id=user_id,
            request_text=content,
            session=session,
            invocation_id=invocation_id,
        )

    async def _compress_with_retry(
        self,
        documents: list[RelevantDocument],
        max_tokens: int,
        compression_loop: int,
        correlation_id: str,
        user_id: UUID | None = None,
        session: AsyncSession | None = None,
        invocation_id: UUID | None = None,
    ) -> tuple[list[Any], int]:
        """Attempt compression with progressive retry loop.

        Args:
            documents: List of RelevantDocuments
            max_tokens: Maximum token budget
            compression_loop: Maximum retry attempts
            correlation_id: Correlation ID for tracing
            user_id: Optional user ID for token validation
            session: Optional database session for token validation
            invocation_id: Optional invocation ID for token tracking

        Returns:
            Tuple of (compressed_documents, retry_count)

        Raises:
            ContextAssemblyError: When all retries exhausted
            TokenLimitExceededError: When token validation fails even after compression

        """
        retry_count = 0
        compressed_docs = documents

        while retry_count < compression_loop:
            strategy_level = retry_count

            logger.info(
                "Compression retry attempt",
                retry_attempt=retry_count + 1,
                max_attempts=compression_loop,
                strategy_level=strategy_level,
                correlation_id=correlation_id,
            )

            # Try compression with current strategy level
            try:
                # Call compressor service with increasing strategy aggression
                if self.compressor_service is None:
                    msg = "Compressor service not available"
                    raise ContextAssemblyError(  # noqa: TRY301
                        msg,
                        correlation_id=correlation_id,
                        retry_count=retry_count,
                    )

                # Extract content from documents for compression
                doc_contents = [doc.content for doc in compressed_docs]

                # Compress the content
                compressed_content = await self.compressor_service.compress(
                    data=doc_contents,
                    max_tokens=max_tokens,
                    strategy="greedy",
                    correlation_id=correlation_id,
                )

                # Validate compressed content against token budget
                if user_id is not None and session is not None:
                    # This will raise TokenLimitExceededError if still over budget
                    await self._validate_tokens(
                        content=compressed_content,
                        user_id=user_id,
                        session=session,
                        invocation_id=invocation_id,
                    )

                # Create new document with compressed content
                # Use metadata from first document, merge relevancy scores
                avg_relevancy = sum(doc.relevancy_score for doc in compressed_docs) / len(compressed_docs)
                compressed_doc = RelevantDocument(
                    content=compressed_content,
                    relevancy_score=avg_relevancy,
                    file_metadata=compressed_docs[0].file_metadata,
                    source_type="compressed",
                )

                # If we reach here, compression was successful
                logger.info(
                    "Compression successful at retry",
                    retry_count=retry_count,
                    correlation_id=correlation_id,
                )
                return [compressed_doc], retry_count

            # Catch both TokenLimitExceededError and any other exceptions from compression
            # (e.g., LLM failures, network issues). All failures trigger retry logic.
            except Exception as e:
                retry_count += 1
                logger.warning(
                    "Compression attempt failed",
                    retry_count=retry_count,
                    error=str(e),
                    correlation_id=correlation_id,
                )
                if retry_count >= compression_loop:
                    msg = f"Content exceeds token limit ({max_tokens}) after {retry_count} compression retries"
                    raise ContextAssemblyError(
                        msg,
                        correlation_id=correlation_id,
                        retry_count=retry_count,
                        original_exception=e,
                    ) from e
                # Continue to next retry
                continue

        # Should not reach here, but handle edge case
        msg = f"Compression retries exhausted ({compression_loop} attempts)"
        raise ContextAssemblyError(
            msg,
            correlation_id=correlation_id,
            retry_count=retry_count,
        )
