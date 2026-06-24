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
from temporalio.exceptions import ApplicationError

from nexus.core.exceptions import SafeValueError
from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityName,
    ScriptExecutorParameters,
    ScriptOutput,
)

from .common import ActivityExecutionError

SAFE_ENV_ALLOWLIST: frozenset[str] = frozenset(
    {
        "HOME",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "LOGNAME",
        "PATH",
        "SHELL",
        "TEMP",
        "TERM",
        "TMP",
        "TMPDIR",
        "TZ",
        "USER",
    }
)


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
            await asyncio.wait_for(process.wait(), timeout=constants.SCRIPT_CLEANUP_TERMINATE_TIMEOUT)
            activity.logger.debug("Process terminated gracefully")
        except TimeoutError:
            activity.logger.warning("Process didn't terminate gracefully, force killing")
            try:
                process.kill()
                await asyncio.wait_for(process.wait(), timeout=constants.SCRIPT_CLEANUP_KILL_TIMEOUT)
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
        raise SafeValueError(msg)

    # Limit environment variable size to prevent resource exhaustion
    # Note: Systems have limits on total env size (all vars combined), typically 128-256KB
    # We limit individual vars to prevent resource exhaustion and leave room for system variables
    if len(str_value) > constants.MAX_ENV_VAR_LENGTH:
        msg = f"Environment variable value exceeds maximum length ({constants.MAX_ENV_VAR_LENGTH} bytes)"
        raise SafeValueError(msg)

    return str_value


def _prepare_script_env(inputs: dict[str, Any], environment: dict[str, str] | None = None) -> dict[str, str]:
    """Prepare environment variables for script execution.

    Args:
        inputs: Input parameters to pass as environment variables (with INPUT_ prefix)
        environment: Optional additional environment variables from config.environment

    Returns:
        Environment dict with custom variables and INPUT_<key> variables

    """
    env = {k: v for k, v in os.environ.items() if k in SAFE_ENV_ALLOWLIST}

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

    except (ScriptExecutionError, RuntimeError, SafeValueError):
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


@activity.defn(name=ActivityName.SCRIPT)
async def execute_script_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
) -> dict[str, Any]:
    """Execute a script for V2 workflows (unified bash/python activity).

    This activity handles both bash and python scripts based on the 'language'
    field in config, delegating to the appropriate helper function.

    Returns normalized structure with output portion (no control needed for executor nodes).
    Output mapping is applied internally before returning to avoid storing suppressed fields in Temporal.

    Args:
        input_config: Script configuration (already template-resolved in V2)
                      Expected keys: 'code', 'language' (optional, defaults to 'python'),
                      'environment' (optional), 'timeout' (optional)
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields

    Returns:
        {
            "output": {
                "status": "completed",
                "return_code": 0,
                "stdout": "...",
                "stderr": "...",
                "stdout_json": {...}  // Only for Python scripts with JSON output
            }
        }

    """
    try:
        # Validate config via Pydantic model
        try:
            config = ScriptExecutorParameters.model_validate(input_config)
        except Exception:  # noqa: BLE001
            msg = "Script activity configuration validation failed"
            raise ApplicationError(msg, type="ConfigError", non_retryable=True) from None

        # Read values from the validated model
        language = config.language.value
        code = config.code
        environment = dict(config.environment)

        timeout = int(input_config.get(constants.ENGINE_TIMEOUT_SECONDS_KEY, 300))

        # Inject TEMPORAL_ATTEMPT for retry-aware scripts
        attempt_number = activity.info().attempt
        environment["TEMPORAL_ATTEMPT"] = str(attempt_number)

        # V2 configs are already resolved by the resolver, so we pass empty inputs
        inputs: dict[str, Any] = {}

        # Build command based on language
        command = ["bash", "-c", code] if language == "bash" else [sys.executable, "-c", code]

        # Execute script
        result = await _execute_script_common(command, inputs, environment, timeout)

        # For Python scripts, try to parse stdout as JSON
        if language == "python" and result["stdout"].strip():
            # First, try parsing entire stdout as JSON
            try:
                result["output"] = json.loads(result["stdout"])
            except json.JSONDecodeError:
                # Fallback: try parsing the last non-empty line as JSON
                # This allows debug prints before the final JSON output
                lines = [line for line in result["stdout"].strip().split("\n") if line.strip()]
                if lines:
                    with contextlib.suppress(json.JSONDecodeError):
                        result["output"] = json.loads(lines[-1])

        output = ScriptOutput(
            return_code=result["return_code"],
            stdout=result["stdout"],
            stderr=result["stderr"],
            stdout_json=result.get("output"),
        )
        return {"output": output.dump(output_config)}

    except ApplicationError:
        raise
    except ScriptExecutionError as e:
        output = ScriptOutput(return_code=e.exit_code, stdout=e.stdout, stderr=e.stderr)
        raise ApplicationError(
            str(e), {"output": output.dump(output_config)}, type="ScriptExecutionError", non_retryable=True
        ) from None
    except Exception as e:  # noqa: BLE001
        output = ScriptOutput()
        msg = "Script activity failed unexpectedly"
        raise ApplicationError(
            msg, {"output": output.dump(output_config)}, type=type(e).__name__, non_retryable=True
        ) from None
