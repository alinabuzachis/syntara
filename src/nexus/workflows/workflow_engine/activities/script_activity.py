"""Script activity executors for bash and Python.

This module provides functionality to execute bash and Python scripts as workflow activities.
Scripts run in isolated subprocesses with timeout and error handling.
"""

import asyncio
import contextlib
import json
import os
import subprocess
import sys
from typing import Any

from temporalio import activity

from nexus.workflows.workflow_engine import settings
from nexus.workflows.workflow_engine.models import ScriptExecutorConfig

from .common import ActivityExecutionError


class ScriptExecutionError(ActivityExecutionError):
    """Raised when script execution fails."""

    exit_code: int
    stdout: str
    stderr: str

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
    """Clean up subprocess by ensuring it has terminated.

    Args:
        process: The subprocess to clean up

    """
    if process.returncode is None:
        # Process still running, terminate it gracefully
        try:
            process.terminate()
            await asyncio.wait_for(process.wait(), timeout=settings.SCRIPT_CLEANUP_TERMINATE_TIMEOUT)
            activity.logger.debug("Process terminated gracefully")
        except TimeoutError:
            activity.logger.warning("Process didn't terminate gracefully, force killing")
            try:
                process.kill()
                await asyncio.wait_for(process.wait(), timeout=settings.SCRIPT_CLEANUP_KILL_TIMEOUT)
                activity.logger.info("Process force killed successfully")
            except TimeoutError:
                activity.logger.error("Process didn't die after kill signal, may be zombie")
            except ProcessLookupError:
                activity.logger.debug("Process already terminated after kill attempt")
        except ProcessLookupError:
            activity.logger.debug("Process already terminated before cleanup")

    # Close all streams to prevent event loop warnings
    # This ensures transport cleanup happens before event loop closes
    if process.stdin and not process.stdin.is_closing():
        process.stdin.close()
        with contextlib.suppress(Exception):
            await process.stdin.wait_closed()

    # Close the subprocess transport to prevent delayed cleanup warnings
    # We need to access _transport directly because Python's asyncio doesn't provide
    # a public API to close subprocess transports. Without this, the transport's __del__
    # method attempts cleanup after the event loop closes, causing "Event loop is closed"
    # warnings. This is a known asyncio limitation when subprocesses outlive the event loop.
    if hasattr(process, "_transport") and process._transport is not None:  # noqa: SLF001
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
    # Convert dicts and lists to JSON for proper serialization
    # Python's str() uses single quotes and Python-specific syntax (True/False/None)
    # which is not valid JSON. json.dumps() produces valid JSON with double quotes.
    str_value = json.dumps(value) if isinstance(value, dict | list) else str(value)

    # Check for null bytes (not allowed in environment variables)
    if "\0" in str_value:
        msg = "Environment variable values cannot contain null bytes"
        raise ValueError(msg)

    # Limit environment variable size to prevent resource exhaustion
    # Note: Systems have limits on total env size (all vars combined), typically 128-256KB
    # We limit individual vars to prevent resource exhaustion and leave room for system variables
    if len(str_value) > settings.MAX_ENV_VAR_LENGTH:
        msg = f"Environment variable value exceeds maximum length ({settings.MAX_ENV_VAR_LENGTH} bytes)"
        raise ValueError(msg)

    return str_value


def _prepare_script_env(inputs: dict[str, Any], environment: dict[str, str] | None = None) -> dict[str, str]:
    """Prepare environment variables for script execution.

    Args:
        inputs: Input parameters to pass as environment variables (with INPUT_ prefix)
        environment: Optional additional environment variables from config.environment

    Returns:
        Environment dict with custom variables and INPUT_<key> variables

    """
    env = os.environ.copy()

    # Add custom environment variables from config.environment
    if environment:
        for key, value in environment.items():
            env[key] = _sanitize_env_value(value)

    # Add input parameters with INPUT_ prefix
    # Skip None values to avoid serializing them as "None" strings
    if inputs:
        for key, value in inputs.items():
            if value is not None:
                env[f"INPUT_{key.upper()}"] = _sanitize_env_value(value)

    return env


def _process_script_result(
    returncode: int | None,
    stdout_bytes: bytes | None,
    stderr_bytes: bytes | None,
) -> dict[str, Any]:
    """Process script execution result.

    Args:
        returncode: Process return code
        stdout_bytes: Standard output bytes
        stderr_bytes: Standard error bytes

    Returns:
        Result dict with stdout, stderr, and return_code

    Raises:
        RuntimeError: If returncode is None
        ScriptExecutionError: If script exited with non-zero code

    """
    stdout = stdout_bytes.decode("utf-8") if stdout_bytes else ""
    stderr = stderr_bytes.decode("utf-8") if stderr_bytes else ""

    # returncode should never be None after communicate()
    if returncode is None:
        msg = "Process returncode is None after communicate()"
        raise RuntimeError(msg)

    # Check for script errors
    if returncode != 0:
        _raise_script_error(returncode, stdout, stderr)

    return {
        "stdout": stdout,
        "stderr": stderr,
        "return_code": returncode,
    }


async def _execute_script_common(
    command: list[str],
    inputs: dict[str, Any],
    environment: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    """Execute a script with common subprocess handling logic (DRY).

    This function contains the shared logic for executing both bash and python scripts.

    Args:
        command: Command to execute (e.g., ["bash", "-c", script] or ["python", "-c", script])
        inputs: Input parameters (passed as environment variables with INPUT_ prefix)
        environment: Optional environment variables from config.environment
        timeout_seconds: Optional timeout in seconds (uses default if not provided)

    Returns:
        dict with keys:
            - stdout: Standard output from script
            - stderr: Standard error output
            - return_code: Exit code (0 = success)

    Raises:
        ScriptExecutionError: If script exits with non-zero code
        TimeoutError: If script execution times out
        ValueError: If input values contain null bytes or exceed maximum length

    """
    env = _prepare_script_env(inputs, environment)
    process = None

    try:
        # Execute script asynchronously with custom environment
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # Wait for completion with timeout and process result
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout_seconds,
        )
        return _process_script_result(process.returncode, stdout_bytes, stderr_bytes)

    except (ScriptExecutionError, RuntimeError):
        # Re-raise these errors as-is
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

    finally:
        # Ensure process cleanup to avoid event loop warnings
        if process:
            await _cleanup_process(process)


@activity.defn
async def execute_bash_script(config: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    """Execute a bash script asynchronously.

    Args:
        config: Script executor configuration dict (validated to ScriptExecutorConfig)
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
        >>> config = {"language": "bash", "code": 'echo "Hello, $INPUT_NAME"'}
        >>> result = await execute_bash_script(config, {"name": "Alice"})
        >>> print(result['stdout'])
        Hello, Alice

    """
    # Validate config using Pydantic V2's model_validate (no deprecation warnings)
    script_config = ScriptExecutorConfig.model_validate(config)

    # Inject Temporal activity attempt number for retry-aware scripts
    # This allows scripts to use $TEMPORAL_ATTEMPT to advance random seeds
    enhanced_inputs = inputs.copy()
    try:
        enhanced_inputs["temporal_attempt"] = activity.info().attempt
    except RuntimeError:
        # Not in activity context (e.g., unit tests), default to attempt 1
        enhanced_inputs["temporal_attempt"] = 1

    # Use common script execution logic
    full_command = ["bash", "-c", script_config.code]
    return await _execute_script_common(
        full_command,
        enhanced_inputs,
        script_config.environment,
        timeout_seconds=float(script_config.timeout_seconds),
    )


@activity.defn
async def execute_python_script(config: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    r"""Execute a Python script asynchronously.

    Args:
        config: Script executor configuration dict (validated to ScriptExecutorConfig)
        inputs: Input parameters (passed as environment variables with INPUT_ prefix)

    Returns:
        dict with keys:
            - stdout: Standard output from script (always present)
            - stderr: Standard error output (always present)
            - return_code: Exit code (0 = success, always present)
            - output: Parsed JSON object (only present if stdout contains valid JSON)

        The 'output' key is populated using smart JSON parsing:
            1. First attempts to parse entire stdout as JSON
            2. If that fails, attempts to parse the last non-empty line as JSON
            3. If that fails, 'output' key is not set (access via $.stdout instead)

        This allows debug prints before JSON output:
            print("Debug: processing...")  # Goes to stdout, ignored by JSON parser
            print(json.dumps({"result": "success"}))  # Parsed as $.output

        For debug-only output, use stderr:
            print("Debug info", file=sys.stderr)  # Access via $.stderr

    Raises:
        ScriptExecutionError: If script exits with non-zero code
        asyncio.TimeoutError: If script execution times out
        ValueError: If input values contain null bytes or exceed maximum length

    Example:
        >>> # Pure JSON output
        >>> config = {"language": "python", "code": 'import json; print(json.dumps({"hello": "world"}))'}
        >>> result = await execute_python_script(config, {})
        >>> print(result['output'])
        {'hello': 'world'}

        >>> # Debug output + JSON on last line
        >>> config = {
        ...     "language": "python",
        ...     "code": 'import json\\nprint("Processing...")\\nprint(json.dumps({"status": "done"}))'
        ... }
        >>> result = await execute_python_script(config, {})
        >>> print(result['output'])
        {'status': 'done'}

        >>> # With custom environment variables
        >>> config = {
        ...     "language": "python",
        ...     "code": 'import os; print(os.getenv("API_KEY"))',
        ...     "environment": {"API_KEY": "secret123"}
        ... }
        >>> result = await execute_python_script(config, {})
        >>> print(result['stdout'])
        secret123

    """
    # Validate config using Pydantic V2's model_validate (no deprecation warnings)
    script_config = ScriptExecutorConfig.model_validate(config)

    # Use common script execution logic
    # Use sys.executable to ensure we use the same Python interpreter that's running the workflow
    full_command = [sys.executable, "-c", script_config.code]
    result = await _execute_script_common(
        full_command,
        inputs,
        script_config.environment,
        timeout_seconds=float(script_config.timeout_seconds),
    )

    # Try to parse stdout as JSON for structured output
    # This allows Python scripts to return structured data
    if result["stdout"].strip():
        # First, try parsing entire stdout as JSON
        try:
            result["output"] = json.loads(result["stdout"])
            activity.logger.debug("Parsed entire stdout as JSON")
        except json.JSONDecodeError:
            # Fallback: try parsing the last non-empty line as JSON
            # This allows debug prints before the final JSON output
            lines = [line for line in result["stdout"].strip().split("\n") if line.strip()]
            if lines:
                try:
                    result["output"] = json.loads(lines[-1])
                    if len(lines) > 1:
                        activity.logger.debug(
                            "Parsed JSON from last line of stdout (lines 1-%d contained non-JSON output)",
                            len(lines) - 1,
                        )
                except json.JSONDecodeError:
                    # Not JSON output - that's fine, user can access via $.stdout
                    activity.logger.debug(
                        "stdout is not JSON - access output via $.stdout or $.stderr in output mappings"
                    )

    return result
