"""Unit tests for script activity executor (V2 unified bash/python)."""

import sys
from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest

from nexus.workflows.workflow_engine.activities.script_activity import (
    execute_script_activity,
)

ACTIVITY_INFO_PATH = "nexus.workflows.workflow_engine.activities.script_activity.activity.info"


@pytest.fixture(autouse=True)
def _mock_activity_context() -> Generator[MagicMock, None, None]:
    """Auto-mock activity.info() so tests can run outside a Temporal worker.

    Sets attempt=1 by default; individual tests can override via
    ``mock_activity_info`` fixture.
    """
    mock_info = MagicMock()
    mock_info.attempt = 1
    with patch(ACTIVITY_INFO_PATH, return_value=mock_info) as m:
        yield m


@pytest.fixture
def mock_activity_info(_mock_activity_context: MagicMock) -> MagicMock:
    """Expose the mock so tests can customise attempt number etc."""
    return _mock_activity_context


class TestBashScriptExecution:
    """Test basic bash script execution functionality."""

    @pytest.mark.asyncio
    async def test_simple_echo(self) -> None:
        """Test simple echo command."""
        input_config = {"language": "bash", "code": 'echo "Hello, World!"'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Hello, World!" in output["stdout"]
        assert output["stderr"] == ""

    @pytest.mark.asyncio
    async def test_multiline_script(self) -> None:
        """Test multiline bash script."""
        script = """
echo "Line 1"
echo "Line 2"
echo "Line 3"
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Line 1" in output["stdout"]
        assert "Line 2" in output["stdout"]
        assert "Line 3" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_variables(self) -> None:
        """Test script with bash variables."""
        script = """
        NAME="Workflow"
        echo "Hello, $NAME!"
        """
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Hello, Workflow!" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_commands(self) -> None:
        """Test script with actual bash commands."""
        script = """
        date_output=$(date +%Y-%m-%d)
        echo "Date: $date_output"
        """
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Date:" in output["stdout"]


class TestScriptEnvironmentVariables:
    """Test custom environment variables from config.environment."""

    @pytest.mark.asyncio
    async def test_bash_custom_env_variable(self) -> None:
        """Test bash script with custom environment variable."""
        input_config = {
            "language": "bash",
            "code": 'echo "API Key: $API_KEY"',
            "environment": {"API_KEY": "secret123"},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "API Key: secret123" in output["stdout"]

    @pytest.mark.asyncio
    async def test_bash_multiple_env_variables(self) -> None:
        """Test bash script with multiple custom environment variables."""
        script = """
echo "Database: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
"""
        input_config = {
            "language": "bash",
            "code": script,
            "environment": {"DB_HOST": "localhost", "DB_PORT": "5432", "DB_USER": "admin"},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Database: localhost:5432" in output["stdout"]
        assert "User: admin" in output["stdout"]

    @pytest.mark.asyncio
    async def test_python_custom_env_variable(self) -> None:
        """Test Python script with custom environment variable."""
        script = """
import os
api_key = os.getenv('API_KEY', 'default')
print(f"API Key: {api_key}")
"""
        input_config = {
            "language": "python",
            "code": script,
            "environment": {"API_KEY": "secret123"},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "API Key: secret123" in output["stdout"]

    @pytest.mark.asyncio
    async def test_python_multiple_env_variables(self) -> None:
        """Test Python script with multiple custom environment variables."""
        script = """
import os
import json
config = {
    'db_host': os.getenv('DB_HOST'),
    'db_port': os.getenv('DB_PORT'),
    'db_user': os.getenv('DB_USER')
}
print(json.dumps(config))
"""
        input_config = {
            "language": "python",
            "code": script,
            "environment": {"DB_HOST": "localhost", "DB_PORT": "5432", "DB_USER": "admin"},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout_json"]["db_host"] == "localhost"
        assert output["stdout_json"]["db_port"] == "5432"
        assert output["stdout_json"]["db_user"] == "admin"


class TestScriptOutputParsing:
    """Test script output parsing and capture."""

    @pytest.mark.asyncio
    async def test_stdout_capture(self) -> None:
        """Test that stdout is properly captured."""
        script = """
echo "Output line 1"
echo "Output line 2"
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert "Output line 1" in output["stdout"]
        assert "Output line 2" in output["stdout"]

    @pytest.mark.asyncio
    async def test_stderr_capture(self) -> None:
        """Test that stderr is properly captured."""
        input_config = {"language": "bash", "code": 'echo "Error message" >&2'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Error message" in output["stderr"]

    @pytest.mark.asyncio
    async def test_json_output(self) -> None:
        """Test script that outputs JSON."""
        input_config = {"language": "bash", "code": 'echo \'{"status": "success", "count": 42}\''}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert '{"status": "success"' in output["stdout"]
        assert '"count": 42' in output["stdout"]

    @pytest.mark.asyncio
    async def test_empty_output(self) -> None:
        """Test script with no output."""
        input_config = {"language": "bash", "code": "# Just a comment, no output"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout"] == ""
        assert output["stderr"] == ""


class TestScriptErrorHandling:
    """Test error handling in script execution."""

    @pytest.mark.asyncio
    async def test_non_zero_exit_code(self) -> None:
        """Test script that exits with non-zero code."""
        input_config = {"language": "bash", "code": "exit 1"}

        # V2 returns error result instead of raising
        result = await execute_script_activity(input_config, None)
        output = result["output"]
        assert output["status"] == "failed"
        assert "exit code 1" in output["error"]["message"]

    @pytest.mark.asyncio
    async def test_command_not_found(self) -> None:
        """Test script with invalid command."""
        input_config = {"language": "bash", "code": "nonexistentcommand12345"}

        result = await execute_script_activity(input_config, None)
        output = result["output"]
        assert output["status"] == "failed"

    @pytest.mark.asyncio
    async def test_syntax_error(self) -> None:
        """Test script with bash syntax error."""
        input_config = {"language": "bash", "code": 'if [ true ]; then\necho "incomplete"'}

        result = await execute_script_activity(input_config, None)
        output = result["output"]
        assert output["status"] == "failed"


class TestScriptAdvancedFeatures:
    """Test advanced script execution features."""

    @pytest.mark.asyncio
    async def test_script_with_pipes(self) -> None:
        """Test script using pipes."""
        input_config = {"language": "bash", "code": 'echo "hello world" | tr "a-z" "A-Z"'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "HELLO WORLD" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_conditionals(self) -> None:
        """Test script with if/else."""
        script = """
ARG="test"
if [ "$ARG" = "test" ]; then
    echo "Condition true"
else
    echo "Condition false"
fi
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Condition true" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_loop(self) -> None:
        """Test script with loop."""
        script = """
for i in 1 2 3; do
    echo "Item: $i"
done
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Item: 1" in output["stdout"]
        assert "Item: 2" in output["stdout"]
        assert "Item: 3" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_arithmetic(self) -> None:
        """Test script with arithmetic operations."""
        script = """
a=10
b=5
result=$((a + b))
echo "Result: $result"
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Result: 15" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_file_operations(self) -> None:
        """Test script that creates and reads temporary file."""
        script = """
tmpfile=$(mktemp)
echo "test content" > "$tmpfile"
cat "$tmpfile"
rm "$tmpfile"
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "test content" in output["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_subshell(self) -> None:
        """Test script using subshell."""
        script = """
output=$(echo "subshell output")
echo "From subshell: $output"
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "From subshell: subshell output" in output["stdout"]


class TestScriptEdgeCases:
    """Test edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_empty_script(self) -> None:
        """Test script with no output (minimal valid script)."""
        input_config = {"language": "bash", "code": ":"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout"] == ""

    @pytest.mark.asyncio
    async def test_script_with_only_whitespace(self) -> None:
        """Test script with only whitespace."""
        input_config = {"language": "bash", "code": "   \n\n   "}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout"].strip() == ""

    @pytest.mark.asyncio
    async def test_script_with_only_comments(self) -> None:
        """Test script with only comments."""
        script = """
# This is a comment
# Another comment
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout"] == ""

    @pytest.mark.asyncio
    async def test_very_long_output(self) -> None:
        """Test script with very long output."""
        script = """
for i in {1..100}; do
    echo "Line $i"
done
"""
        input_config = {"language": "bash", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Line 1" in output["stdout"]
        assert "Line 100" in output["stdout"]

    @pytest.mark.asyncio
    async def test_unicode_in_output(self) -> None:
        """Test script with unicode characters."""
        input_config = {"language": "bash", "code": 'echo "Hello 世界"'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "世界" in output["stdout"]

    @pytest.mark.asyncio
    async def test_unsupported_language_returns_config_error(self) -> None:
        """Test that unsupported language is caught by Pydantic validation."""
        input_config = {"language": "ruby", "code": "puts 'hello'"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"
        assert "Invalid configuration" in output["error"]["message"]


class TestPythonScriptExecution:
    """Test Python script execution functionality."""

    @pytest.mark.asyncio
    async def test_simple_python_print(self) -> None:
        """Test simple Python print statement."""
        input_config = {"language": "python", "code": 'print("Hello from Python!")'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Hello from Python!" in output["stdout"]
        assert output["stderr"] == ""

    @pytest.mark.asyncio
    async def test_python_json_output(self) -> None:
        """Test Python script with JSON output."""
        script = """
import json
data = {"message": "Hello", "value": 42}
print(json.dumps(data))
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "stdout_json" in output
        assert output["stdout_json"]["message"] == "Hello"
        assert output["stdout_json"]["value"] == 42

    @pytest.mark.asyncio
    async def test_python_multiline_script(self) -> None:
        """Test multiline Python script."""
        script = """
for i in range(3):
    print(f"Line {i}")
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "Line 0" in output["stdout"]
        assert "Line 1" in output["stdout"]
        assert "Line 2" in output["stdout"]

    @pytest.mark.asyncio
    async def test_python_calculation(self) -> None:
        """Test Python script with calculation."""
        script = """
result = 10 + 20
print(result)
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "30" in output["stdout"]


class TestPythonScriptErrorHandling:
    """Test Python script error handling."""

    @pytest.mark.asyncio
    async def test_python_syntax_error(self) -> None:
        """Test Python script with syntax error."""
        input_config = {"language": "python", "code": 'print("Missing closing quote'}

        result = await execute_script_activity(input_config, None)
        output = result["output"]
        assert output["status"] == "failed"
        assert "ScriptExecutionError" in output["error"]["type"]

    @pytest.mark.asyncio
    async def test_python_runtime_error(self) -> None:
        """Test Python script with runtime error."""
        script = """
x = 10
y = 0
result = x / y  # Division by zero
"""
        input_config = {"language": "python", "code": script}

        result = await execute_script_activity(input_config, None)
        output = result["output"]
        assert output["status"] == "failed"

    @pytest.mark.asyncio
    async def test_python_import_error(self) -> None:
        """Test Python script with import error."""
        input_config = {"language": "python", "code": "import nonexistent_module"}

        result = await execute_script_activity(input_config, None)
        output = result["output"]
        assert output["status"] == "failed"


class TestPythonScriptOutputParsing:
    """Test Python script JSON output parsing."""

    @pytest.mark.asyncio
    async def test_python_valid_json_output(self) -> None:
        """Test Python script with valid JSON output."""
        script = """
import json
data = {"status": "success", "items": [1, 2, 3]}
print(json.dumps(data))
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "stdout_json" in output
        assert output["stdout_json"]["status"] == "success"
        assert output["stdout_json"]["items"] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_python_invalid_json_output(self) -> None:
        """Test Python script with non-JSON output."""
        input_config = {"language": "python", "code": 'print("This is not JSON")'}

        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "This is not JSON" in output["stdout"]
        assert "stdout_json" not in output

    @pytest.mark.asyncio
    async def test_python_debug_output_with_json_last_line(self) -> None:
        """Test Python script with debug prints before JSON on last line."""
        script = """
import json

print("Debug: Starting processing...")
print("Debug: Loading data...")

result = {"status": "success", "items_processed": 3, "result": "complete"}
print(json.dumps(result))
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0

        # Should have parsed JSON from last line
        assert "stdout_json" in output
        assert output["stdout_json"]["status"] == "success"
        assert output["stdout_json"]["items_processed"] == 3

        # Full stdout should include debug lines
        assert "Debug: Starting processing..." in output["stdout"]

    @pytest.mark.asyncio
    async def test_python_empty_output(self) -> None:
        """Test Python script with no output."""
        input_config = {"language": "python", "code": "pass"}

        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout"] == ""

    @pytest.mark.asyncio
    async def test_python_nested_json_output(self) -> None:
        """Test Python script with nested JSON structures."""
        script = """
import json
data = {
    "user": {
        "name": "Test User",
        "details": {
            "age": 30,
            "city": "Boston"
        }
    }
}
print(json.dumps(data))
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "stdout_json" in output
        assert output["stdout_json"]["user"]["name"] == "Test User"
        assert output["stdout_json"]["user"]["details"]["age"] == 30


# ────────────────────────────────────────────────────────────────────
# Task 4.1 — Tests for Pydantic validation, sys.executable, TEMPORAL_ATTEMPT
# ────────────────────────────────────────────────────────────────────


class TestPydanticConfigValidation:
    """Test that ScriptExecutorConfig.model_validate() is enforced."""

    @pytest.mark.asyncio
    async def test_empty_code_returns_config_error(self) -> None:
        """Empty code string violates min_length=1 and returns a failed result."""
        input_config = {"language": "bash", "code": ""}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"
        assert "Invalid configuration" in output["error"]["message"]

    @pytest.mark.asyncio
    async def test_negative_timeout_returns_config_error(self) -> None:
        """Negative timeout violates ge=1 constraint."""
        input_config = {"language": "bash", "code": "echo hi", "timeout": -1}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"
        assert "Invalid configuration" in output["error"]["message"]

    @pytest.mark.asyncio
    async def test_zero_timeout_returns_config_error(self) -> None:
        """Zero timeout violates ge=1 constraint."""
        input_config = {"language": "bash", "code": "echo hi", "timeout": 0}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"

    @pytest.mark.asyncio
    async def test_timeout_exceeding_3600_returns_config_error(self) -> None:
        """Timeout > 3600 violates le=3600 constraint."""
        input_config = {"language": "bash", "code": "echo hi", "timeout": 7200}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"

    @pytest.mark.asyncio
    async def test_invalid_language_returns_config_error(self) -> None:
        """Non-enum language value is rejected by Pydantic."""
        input_config = {"language": "ruby", "code": "puts 'hello'"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"
        assert "Invalid configuration" in output["error"]["message"]

    @pytest.mark.asyncio
    async def test_missing_code_field_returns_config_error(self) -> None:
        """Missing required 'code' field is rejected by Pydantic."""
        input_config = {"language": "bash"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"

    @pytest.mark.asyncio
    async def test_missing_language_field_returns_config_error(self) -> None:
        """Missing required 'language' field is rejected by Pydantic."""
        input_config = {"code": "echo hello"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"

    @pytest.mark.asyncio
    async def test_non_string_environment_values_returns_config_error(self) -> None:
        """Environment with non-string values is rejected by Pydantic."""
        input_config = {
            "language": "bash",
            "code": "echo hi",
            "environment": {"KEY": 123},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"

    @pytest.mark.asyncio
    async def test_valid_config_at_boundary_timeout_1(self) -> None:
        """Timeout=1 is the minimum valid value."""
        input_config = {"language": "bash", "code": "echo ok", "timeout": 1}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "completed"
        assert output["return_code"] == 0

    @pytest.mark.asyncio
    async def test_valid_config_at_boundary_timeout_3600(self) -> None:
        """Timeout=3600 is the maximum valid value."""
        input_config = {"language": "bash", "code": "echo ok", "timeout": 3600}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["status"] == "completed"
        assert output["return_code"] == 0

    @pytest.mark.asyncio
    async def test_completely_empty_config_returns_config_error(self) -> None:
        """Empty dict is rejected by Pydantic (missing required fields)."""
        result = await execute_script_activity({}, None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConfigError"


class TestSysExecutableForPython:
    """Test that Python scripts use sys.executable instead of hardcoded 'python'."""

    @pytest.mark.asyncio
    async def test_python_script_uses_sys_executable(self) -> None:
        """Python script subprocess should use the same interpreter as the host process."""
        script = """
import sys
print(sys.executable)
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        # The subprocess should report the same executable as the host
        assert sys.executable in output["stdout"]

    @pytest.mark.asyncio
    async def test_bash_script_does_not_use_sys_executable(self) -> None:
        """Bash scripts should still use 'bash', not sys.executable."""
        input_config = {"language": "bash", "code": "echo $0"}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "bash" in output["stdout"]


class TestTemporalAttemptInjection:
    """Test that TEMPORAL_ATTEMPT env var is injected for retry-aware scripts."""

    @pytest.mark.asyncio
    async def test_bash_receives_temporal_attempt(self) -> None:
        """Bash scripts should see TEMPORAL_ATTEMPT in their environment."""
        input_config = {"language": "bash", "code": 'echo "attempt=$TEMPORAL_ATTEMPT"'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "attempt=1" in output["stdout"]

    @pytest.mark.asyncio
    async def test_python_receives_temporal_attempt(self) -> None:
        """Python scripts should see TEMPORAL_ATTEMPT in their environment."""
        script = """
import os
attempt = os.getenv('TEMPORAL_ATTEMPT')
print(f"attempt={attempt}")
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "attempt=1" in output["stdout"]

    @pytest.mark.asyncio
    async def test_temporal_attempt_reflects_mock_attempt_number(self, mock_activity_info: MagicMock) -> None:
        """TEMPORAL_ATTEMPT should reflect the actual attempt number from activity info."""
        mock_activity_info.return_value.attempt = 3

        input_config = {"language": "bash", "code": 'echo "attempt=$TEMPORAL_ATTEMPT"'}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "attempt=3" in output["stdout"]

    @pytest.mark.asyncio
    async def test_temporal_attempt_is_string(self) -> None:
        """TEMPORAL_ATTEMPT should be a string representation of the attempt number."""
        script = """
import os
val = os.getenv('TEMPORAL_ATTEMPT')
print(type(val).__name__)
print(val)
"""
        input_config = {"language": "python", "code": script}
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "str" in output["stdout"]
        assert "1" in output["stdout"]

    @pytest.mark.asyncio
    async def test_temporal_attempt_coexists_with_custom_env(self) -> None:
        """TEMPORAL_ATTEMPT should be present alongside user-provided env vars."""
        script = """
import os
import json
data = {
    'attempt': os.getenv('TEMPORAL_ATTEMPT'),
    'custom': os.getenv('MY_VAR'),
}
print(json.dumps(data))
"""
        input_config = {
            "language": "python",
            "code": script,
            "environment": {"MY_VAR": "hello"},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert output["stdout_json"]["attempt"] == "1"
        assert output["stdout_json"]["custom"] == "hello"

    @pytest.mark.asyncio
    async def test_temporal_attempt_with_empty_environment(self) -> None:
        """TEMPORAL_ATTEMPT should be injected even when no user env vars are set."""
        input_config = {
            "language": "bash",
            "code": 'echo "attempt=$TEMPORAL_ATTEMPT"',
            "environment": {},
        }
        result = await execute_script_activity(input_config, None)

        output = result["output"]
        assert output["return_code"] == 0
        assert "attempt=1" in output["stdout"]
