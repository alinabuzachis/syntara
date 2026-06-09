"""S3-compatible storage retriever implementation.

This module provides file storage operations against any S3-compatible
backend (ODF/NooBaa, AWS S3, MinIO, etc.) using boto3 with
asyncio.to_thread() for async integration.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any

import boto3
import structlog
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError
from pydantic import SecretStr

from nexus.files.exceptions import FileContentNotFoundError, FileError
from nexus.files.retrievers.base import BaseRetriever

logger = structlog.stdlib.get_logger(__name__)

_MULTIPART_THRESHOLD = 5 * 1024 * 1024  # 5 MB
_S3_ERRORS = (ClientError, EndpointConnectionError, NoCredentialsError)


class S3FileRetriever(BaseRetriever):
    """S3-compatible storage retriever for file operations.

    Uses boto3 with asyncio.to_thread() for non-blocking S3 calls.
    Works with any S3-compatible endpoint: ODF/NooBaa, AWS S3, MinIO, etc.
    """

    def __init__(  # noqa: D107
        self,
        endpoint_url: str | None,
        bucket_name: str,
        region_name: str = "us-east-1",
        aws_access_key_id: SecretStr | None = None,
        aws_secret_access_key: SecretStr | None = None,
    ) -> None:
        self._bucket_name = bucket_name
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region_name,
            aws_access_key_id=aws_access_key_id.get_secret_value() if aws_access_key_id else None,
            aws_secret_access_key=aws_secret_access_key.get_secret_value() if aws_secret_access_key else None,
            config=Config(
                connect_timeout=5,
                read_timeout=30,
                retries={"max_attempts": 3, "mode": "adaptive"},
                max_pool_connections=50,
            ),
        )

    async def save_file(
        self,
        file_content: bytes,
        file_path: str,
    ) -> str:
        """Save file content to S3-compatible storage.

        Uses multipart upload for files exceeding 5 MB threshold.

        Returns:
            The S3 key (same as file_path input) — used as the storage
            identifier in FileMetadata.file_path.

        """
        try:
            if len(file_content) > _MULTIPART_THRESHOLD:
                await self._multipart_upload(file_path, file_content)
            else:
                await asyncio.to_thread(
                    self._client.put_object,
                    Bucket=self._bucket_name,
                    Key=file_path,
                    Body=file_content,
                )

            logger.debug(
                "File saved to S3",
                key=file_path,
                bucket=self._bucket_name,
                size_bytes=len(file_content),
            )
            return file_path

        except _S3_ERRORS as e:
            logger.exception("Failed to save file to S3", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e

    async def _multipart_upload(self, key: str, content: bytes) -> None:
        mpu = await asyncio.to_thread(
            self._client.create_multipart_upload,
            Bucket=self._bucket_name,
            Key=key,
        )
        upload_id = mpu["UploadId"]

        parts: list[dict[str, Any]] = []
        try:
            for i, offset in enumerate(range(0, len(content), _MULTIPART_THRESHOLD), 1):
                chunk = content[offset : offset + _MULTIPART_THRESHOLD]
                part = await asyncio.to_thread(
                    self._client.upload_part,
                    Bucket=self._bucket_name,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=i,
                    Body=chunk,
                )
                parts.append({"PartNumber": i, "ETag": part["ETag"]})

            await asyncio.to_thread(
                self._client.complete_multipart_upload,
                Bucket=self._bucket_name,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},  # type: ignore[typeddict-item]
            )
        except _S3_ERRORS:
            try:
                await asyncio.to_thread(
                    self._client.abort_multipart_upload,
                    Bucket=self._bucket_name,
                    Key=key,
                    UploadId=upload_id,
                )
            except _S3_ERRORS:
                logger.warning("Failed to abort multipart upload", key=key, upload_id=upload_id, exc_info=True)
            raise

    def _download(self, file_path: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket_name, Key=file_path)
        try:
            return response["Body"].read()
        finally:
            response["Body"].close()

    async def load_file(self, file_path: str) -> bytes:
        """Load file content from S3-compatible storage."""
        try:
            content = await asyncio.to_thread(self._download, file_path)

            logger.debug(
                "File loaded from S3",
                key=file_path,
                size_bytes=len(content),
            )
            return content

        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchKey":
                logger.warning("File not found in S3", key=file_path)
                msg = f"File not found: {file_path}"
                raise FileContentNotFoundError(msg) from e
            logger.exception("Failed to load file from S3", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e
        except (EndpointConnectionError, NoCredentialsError) as e:
            logger.exception("S3 connection failed", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e

    async def file_exists(self, file_path: str) -> bool:
        """Check if file exists in S3-compatible storage."""
        try:
            await asyncio.to_thread(
                self._client.head_object,
                Bucket=self._bucket_name,
                Key=file_path,
            )
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            logger.exception("Error checking file existence in S3", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e
        except (EndpointConnectionError, NoCredentialsError) as e:
            logger.exception("S3 connection failed during existence check", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e

    async def get_file_metadata(self, file_path: str) -> dict[str, Any]:
        """Get file metadata from S3-compatible storage."""
        try:
            head = await asyncio.to_thread(
                self._client.head_object,
                Bucket=self._bucket_name,
                Key=file_path,
            )

            last_modified = head.get("LastModified", datetime.now(tz=UTC))
            metadata: dict[str, Any] = {
                "size": head["ContentLength"],
                "modified": last_modified.isoformat() if isinstance(last_modified, datetime) else str(last_modified),
                "path": file_path,
                "exists": True,
                "etag": head.get("ETag", ""),
                "content_type": head.get("ContentType", ""),
            }

            logger.debug(
                "File metadata retrieved from S3",
                key=file_path,
                size_bytes=metadata["size"],
            )
            return metadata

        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                msg = f"File not found: {file_path}"
                raise FileContentNotFoundError(msg) from e
            logger.exception("Failed to get file metadata from S3", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e
        except (EndpointConnectionError, NoCredentialsError) as e:
            logger.exception("S3 connection failed", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e

    async def delete_file(self, file_path: str) -> bool:
        """Delete file from S3-compatible storage."""
        try:
            await asyncio.to_thread(
                self._client.delete_object,
                Bucket=self._bucket_name,
                Key=file_path,
            )
            logger.debug("File deleted from S3", key=file_path)
            return True
        except _S3_ERRORS as e:
            logger.exception("Failed to delete file from S3", key=file_path)
            msg = f"S3 storage unavailable: {e}"
            raise FileError(msg) from e

    async def health_check(self) -> bool:
        """Check if S3 bucket is reachable."""
        try:
            await asyncio.to_thread(
                self._client.head_bucket,
                Bucket=self._bucket_name,
            )
            return True
        except _S3_ERRORS:
            logger.warning(
                "S3 health check failed",
                bucket=self._bucket_name,
                exc_info=True,
            )
            return False
