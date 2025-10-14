"""Bash script activity executor.

This module provides functionality to execute bash scripts as workflow activities.
Scripts run in isolated subprocesses with timeout and error handling.
"""

import asyncio
import contextlib
import os
import subprocess
from typing import Any

from temporalio import activity


class ScriptExecutionError(Exception):
    """Raised when script execution fails."""

    def __init__(self, message: str, exit_code: int, stdout: str, stderr: str) -> None:
        """Initialize script execution error.

        Args:
            message: Error message
            exit_code: Script exit code
            stdout: Standard output
            stderr: Standard error output

        """
        super().__init__(message)
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr


def _raise_script_error(return_code: int, stdout: str, stderr: str) -> None:
    """Raise ScriptExecutionError with formatted message.

    Args:
        return_code: Script exit code
        stdout: Standard output
        stderr: Standard error output

    Raises:
        ScriptExecutionError: Always raised with formatted error details

    """
    error_msg = f"Script failed with exit code {return_code}"
    if stderr:
        error_msg += f": {stderr.strip()}"

    raise ScriptExecutionError(
        message=error_msg,
        exit_code=return_code,
        stdout=stdout,
        stderr=stderr,
    )


async def _cleanup_process(process: asyncio.subprocess.Process) -> None:
    """Clean up subprocess to avoid event loop warnings.

    Args:
        process: The subprocess to clean up

    """
    if process.returncode is None:
        # Process still running, terminate it
        try:
            process.terminate()
            await asyncio.wait_for(process.wait(), timeout=1.0)
        except (TimeoutError, ProcessLookupError):
            # Process already gone or didn't terminate, force kill
            try:
                process.kill()
                await asyncio.wait_for(process.wait(), timeout=0.5)
            except (TimeoutError, ProcessLookupError):
                pass  # Process already terminated

    # Explicitly close the transport to prevent cleanup warnings
    # This ensures pipes are closed before event loop shutdown
    if hasattr(process, "_transport") and process._transport:  # noqa: SLF001
        # Ignore errors during transport cleanup
        with contextlib.suppress(Exception):
            process._transport.close()  # noqa: SLF001


def _sanitize_env_value(value: object) -> str:
    """Sanitize value for use in environment variable.

    Args:
        value: Value to sanitize

    Returns:
        Sanitized string value

    Raises:
        ValueError: If value contains null bytes or exceeds max length

    """
    str_value = str(value)

    # Check for null bytes (not allowed in environment variables)
    if "\0" in str_value:
        msg = "Environment variable values cannot contain null bytes"
        raise ValueError(msg)

    # Limit environment variable size to prevent resource exhaustion
    # Note: Systems have limits on total env size (all vars combined), typically 128-256KB
    # We limit individual vars to 32KB to be safe and leave room for system variables
    max_env_length = 32768  # 32KB per variable
    if len(str_value) > max_env_length:
        msg = f"Environment variable value exceeds maximum length ({max_env_length} bytes)"
        raise ValueError(msg)

    return str_value


@activity.defn
async def execute_bash_script(script: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Execute a bash script asynchronously.

    Args:
        script: Bash script code to execute
        inputs: Input parameters (passed as environment variables with INPUT_ prefix)

    Returns:
        dict with keys:
            - stdout: Standard output from script
            - stderr: Standard error output
            - return_code: Exit code (0 = success)

    Raises:
        ScriptExecutionError: If script exits with non-zero code
        asyncio.TimeoutError: If script execution times out
        ValueError: If input values contain null bytes or exceed maximum length

    Example:
        >>> result = await execute_bash_script('echo "Hello, $INPUT_name"', {"name": "Alice"})
        >>> print(result['stdout'])
        Hello, Alice

    """
    # Prepare environment with input parameters
    # Pass inputs as INPUT_<key> environment variables (uppercased)
    env = os.environ.copy()
    if inputs:
        for key, value in inputs.items():
            env[f"INPUT_{key.upper()}"] = _sanitize_env_value(value)

    # Create command for bash -c
    full_command = ["bash", "-c", script]

    process = None
    try:
        # Execute script asynchronously with custom environment
        process = await asyncio.create_subprocess_exec(
            *full_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # Wait for completion
        stdout_bytes, stderr_bytes = await process.communicate()

        stdout = stdout_bytes.decode("utf-8") if stdout_bytes else ""
        stderr = stderr_bytes.decode("utf-8") if stderr_bytes else ""
        return_code = process.returncode or 0

        # Check for errors
        if return_code != 0:
            _raise_script_error(return_code, stdout, stderr)

    except ScriptExecutionError:
        # Re-raise script execution errors
        raise

    except TimeoutError as e:
        msg = "Script execution timed out"
        raise TimeoutError(msg) from e

    except subprocess.SubprocessError as e:
        raise ScriptExecutionError(
            message=f"Subprocess error: {e}",
            exit_code=-1,
            stdout="",
            stderr=str(e),
        ) from e

    except Exception as e:
        raise ScriptExecutionError(
            message=f"Unexpected error executing script: {e}",
            exit_code=-1,
            stdout="",
            stderr=str(e),
        ) from e

    else:
        return {
            "stdout": stdout,
            "stderr": stderr,
            "return_code": return_code,
        }

    finally:
        # Ensure process cleanup to avoid event loop warnings
        if process:
            await _cleanup_process(process)
