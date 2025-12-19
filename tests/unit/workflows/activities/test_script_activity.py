"""Unit tests for bash and Python script activity executors."""

import pytest

from nexus.workflows.workflow_engine.activities.script_activity import (
    ScriptExecutionError,
    execute_bash_script,
    execute_python_script,
)
from nexus.workflows.workflow_engine.models import ScriptExecutorConfig, ScriptLanguage


class TestBashScriptExecution:
    """Test basic bash script execution functionality."""

    @pytest.mark.asyncio
    async def test_simple_echo(self) -> None:
        """Test simple echo command."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Hello, World!"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Hello, World!" in result["stdout"]
        assert result["stderr"] == ""

    @pytest.mark.asyncio
    async def test_multiline_script(self) -> None:
        """Test multiline bash script."""
        script = """
echo "Line 1"
echo "Line 2"
echo "Line 3"
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Line 1" in result["stdout"]
        assert "Line 2" in result["stdout"]
        assert "Line 3" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_variables(self) -> None:
        """Test script with environment variables."""
        script = """
        NAME="Workflow"
        echo "Hello, $NAME!"
        """
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Hello, Workflow!" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_commands(self) -> None:
        """Test script with actual bash commands."""
        script = """
        date_output=$(date +%Y-%m-%d)
        echo "Date: $date_output"
        """
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Date:" in result["stdout"]


class TestScriptInputParameters:
    """Test script input parameter handling."""

    @pytest.mark.asyncio
    async def test_single_input_parameter(self) -> None:
        """Test script with single input parameter."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Hello, $INPUT_NAME!"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"name": "Alice"})

        assert result["return_code"] == 0
        assert "Hello, Alice!" in result["stdout"]

    @pytest.mark.asyncio
    async def test_multiple_input_parameters(self) -> None:
        """Test script with multiple input parameters."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "User: $INPUT_NAME, Age: $INPUT_AGE"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"name": "Bob", "age": "30"})

        assert result["return_code"] == 0
        assert "User: Bob" in result["stdout"]
        assert "Age: 30" in result["stdout"]

    @pytest.mark.asyncio
    async def test_empty_inputs(self) -> None:
        """Test script with no inputs."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "No inputs"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "No inputs" in result["stdout"]

    @pytest.mark.asyncio
    async def test_numeric_input(self) -> None:
        """Test script with numeric input."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Number: $INPUT_COUNT"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"count": "42"})

        assert result["return_code"] == 0
        assert "Number: 42" in result["stdout"]

    @pytest.mark.asyncio
    async def test_special_characters_in_input(self) -> None:
        """Test script with special characters in input."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Message: $INPUT_MSG"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"msg": "Hello-World_123"})

        assert result["return_code"] == 0
        assert "Hello-World_123" in result["stdout"]


class TestScriptEnvironmentVariables:
    """Test custom environment variables from config.environment."""

    @pytest.mark.asyncio
    async def test_bash_custom_env_variable(self) -> None:
        """Test bash script with custom environment variable."""
        config = ScriptExecutorConfig(
            language=ScriptLanguage.BASH, code='echo "API Key: $API_KEY"', environment={"API_KEY": "secret123"}
        )
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "API Key: secret123" in result["stdout"]

    @pytest.mark.asyncio
    async def test_bash_multiple_env_variables(self) -> None:
        """Test bash script with multiple custom environment variables."""
        script = """
echo "Database: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
"""
        config = ScriptExecutorConfig(
            language=ScriptLanguage.BASH,
            code=script,
            environment={"DB_HOST": "localhost", "DB_PORT": "5432", "DB_USER": "admin"},
        )
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Database: localhost:5432" in result["stdout"]
        assert "User: admin" in result["stdout"]

    @pytest.mark.asyncio
    async def test_bash_env_and_inputs_together(self) -> None:
        """Test bash script with both custom env variables and INPUT_ variables."""
        script = """
echo "Config: $API_URL"
echo "Name: $INPUT_NAME"
"""
        config = ScriptExecutorConfig(
            language=ScriptLanguage.BASH, code=script, environment={"API_URL": "https://api.example.com"}
        )
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"name": "Alice"})

        assert result["return_code"] == 0
        assert "Config: https://api.example.com" in result["stdout"]
        assert "Name: Alice" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_custom_env_variable(self) -> None:
        """Test Python script with custom environment variable."""
        script = """
import os
api_key = os.getenv('API_KEY', 'default')
print(f"API Key: {api_key}")
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script, environment={"API_KEY": "secret123"})
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "API Key: secret123" in result["stdout"]

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
        config = ScriptExecutorConfig(
            language=ScriptLanguage.PYTHON,
            code=script,
            environment={"DB_HOST": "localhost", "DB_PORT": "5432", "DB_USER": "admin"},
        )
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["output"]["db_host"] == "localhost"
        assert result["output"]["db_port"] == "5432"
        assert result["output"]["db_user"] == "admin"

    @pytest.mark.asyncio
    async def test_python_env_and_inputs_together(self) -> None:
        """Test Python script with both custom env variables and INPUT_ variables."""
        script = """
import os
import json
data = {
    'api_url': os.getenv('API_URL'),
    'user_name': os.getenv('INPUT_NAME')
}
print(json.dumps(data))
"""
        config = ScriptExecutorConfig(
            language=ScriptLanguage.PYTHON, code=script, environment={"API_URL": "https://api.example.com"}
        )
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={"name": "Alice"})

        assert result["return_code"] == 0
        assert result["output"]["api_url"] == "https://api.example.com"
        assert result["output"]["user_name"] == "Alice"


class TestScriptOutputParsing:
    """Test script output parsing and capture."""

    @pytest.mark.asyncio
    async def test_stdout_capture(self) -> None:
        """Test that stdout is properly captured."""
        script = """
echo "Output line 1"
echo "Output line 2"
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert "Output line 1" in result["stdout"]
        assert "Output line 2" in result["stdout"]

    @pytest.mark.asyncio
    async def test_stderr_capture(self) -> None:
        """Test that stderr is properly captured."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Error message" >&2')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Error message" in result["stderr"]

    @pytest.mark.asyncio
    async def test_json_output(self) -> None:
        """Test script that outputs JSON."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo \'{"status": "success", "count": 42}\'')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert '{"status": "success"' in result["stdout"]
        assert '"count": 42' in result["stdout"]

    @pytest.mark.asyncio
    async def test_empty_output(self) -> None:
        """Test script with no output."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code="# Just a comment, no output")
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""
        assert result["stderr"] == ""


class TestScriptErrorHandling:
    """Test error handling in script execution."""

    @pytest.mark.asyncio
    async def test_non_zero_exit_code(self) -> None:
        """Test script that exits with non-zero code."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code="exit 1")

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        error = exc_info.value
        assert error.exit_code == 1
        assert "exit code 1" in str(error)

    @pytest.mark.asyncio
    async def test_command_not_found(self) -> None:
        """Test script with invalid command."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code="nonexistentcommand12345")

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        error = exc_info.value
        assert error.exit_code != 0

    @pytest.mark.asyncio
    async def test_syntax_error(self) -> None:
        """Test script with bash syntax error."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='if [ true ]; then\necho "incomplete"')

        with pytest.raises(ScriptExecutionError):
            await execute_bash_script(config.model_dump(by_alias=True), inputs={})

    @pytest.mark.asyncio
    async def test_error_with_stderr(self) -> None:
        """Test that stderr is captured on error."""
        script = """
echo "Error details" >&2
exit 1
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        error = exc_info.value
        assert "Error details" in error.stderr
        assert error.exit_code == 1


class TestScriptAdvancedFeatures:
    """Test advanced script execution features."""

    @pytest.mark.asyncio
    async def test_script_with_pipes(self) -> None:
        """Test script using pipes."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "hello world" | tr "a-z" "A-Z"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "HELLO WORLD" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_conditionals(self) -> None:
        """Test script with if/else."""
        script = """
if [ "$INPUT_ARG" = "test" ]; then
    echo "Condition true"
else
    echo "Condition false"
fi
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"arg": "test"})

        assert result["return_code"] == 0
        assert "Condition true" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_loop(self) -> None:
        """Test script with loop."""
        script = """
for i in 1 2 3; do
    echo "Item: $i"
done
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Item: 1" in result["stdout"]
        assert "Item: 2" in result["stdout"]
        assert "Item: 3" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_arithmetic(self) -> None:
        """Test script with arithmetic operations."""
        script = """
a=$INPUT_NUM1
b=$INPUT_NUM2
result=$((a + b))
echo "Result: $result"
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"num1": "10", "num2": "5"})

        assert result["return_code"] == 0
        assert "Result: 15" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_file_operations(self) -> None:
        """Test script that creates and reads temporary file."""
        script = """
tmpfile=$(mktemp)
echo "test content" > "$tmpfile"
cat "$tmpfile"
rm "$tmpfile"
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "test content" in result["stdout"]

    @pytest.mark.asyncio
    async def test_long_running_script(self) -> None:
        """Test script that takes some time to complete."""
        script = """
sleep 1
echo "Completed"
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Completed" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_subshell(self) -> None:
        """Test script using subshell."""
        script = """
output=$(echo "subshell output")
echo "From subshell: $output"
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "From subshell: subshell output" in result["stdout"]


class TestInputValidation:
    """Test input parameter validation and sanitization."""

    @pytest.mark.asyncio
    async def test_input_with_null_byte(self) -> None:
        """Test that null bytes in input values are rejected."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Test"')

        with pytest.raises(ValueError, match="null bytes"):
            await execute_bash_script(config.model_dump(by_alias=True), inputs={"bad": "value\0with_null"})

    @pytest.mark.asyncio
    async def test_input_exceeds_max_length(self) -> None:
        """Test that excessively long input values are rejected."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Test"')
        # Create a string larger than 32KB
        large_value = "x" * 40000

        with pytest.raises(ValueError, match="maximum length"):
            await execute_bash_script(config.model_dump(by_alias=True), inputs={"large": large_value})

    @pytest.mark.asyncio
    async def test_input_at_max_length(self) -> None:
        """Test that input at max length is accepted."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Length: ${#INPUT_DATA}"')
        # Create a string exactly at 32KB
        max_value = "x" * 32768

        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"data": max_value})
        assert result["return_code"] == 0

    @pytest.mark.asyncio
    async def test_input_with_newlines(self) -> None:
        """Test that newlines in input values are preserved."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "$INPUT_TEXT"')

        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"text": "line1\nline2\nline3"})
        assert result["return_code"] == 0
        assert "line1" in result["stdout"]
        assert "line2" in result["stdout"]
        assert "line3" in result["stdout"]

    @pytest.mark.asyncio
    async def test_input_with_special_chars(self) -> None:
        """Test that special characters in input are handled safely."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "$INPUT_MSG"')

        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={"msg": "$HOME;ls;pwd"})
        assert result["return_code"] == 0
        # The string should be treated literally, not executed
        assert "$HOME;ls;pwd" in result["stdout"]


class TestScriptEdgeCases:
    """Test edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_empty_script(self) -> None:
        """Test script with no output (minimal valid script)."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=":")
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""

    @pytest.mark.asyncio
    async def test_script_with_only_whitespace(self) -> None:
        """Test script with only whitespace."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code="   \n\n   ")
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"].strip() == ""

    @pytest.mark.asyncio
    async def test_script_with_only_comments(self) -> None:
        """Test script with only comments."""
        script = """
# This is a comment
# Another comment
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""

    @pytest.mark.asyncio
    async def test_very_long_output(self) -> None:
        """Test script with very long output."""
        script = """
for i in {1..100}; do
    echo "Line $i"
done
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Line 1" in result["stdout"]
        assert "Line 100" in result["stdout"]

    @pytest.mark.asyncio
    async def test_unicode_in_output(self) -> None:
        """Test script with unicode characters."""
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code='echo "Hello 世界 🌍"')
        result = await execute_bash_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "世界" in result["stdout"]
        assert "🌍" in result["stdout"]


class TestPythonScriptExecution:
    """Test Python script execution functionality."""

    @pytest.mark.asyncio
    async def test_simple_python_print(self) -> None:
        """Test simple Python print statement."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code='print("Hello from Python!")')
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Hello from Python!" in result["stdout"]
        assert result["stderr"] == ""

    @pytest.mark.asyncio
    async def test_python_json_output(self) -> None:
        """Test Python script with JSON output."""
        script = """
import json
data = {"message": "Hello", "value": 42}
print(json.dumps(data))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["message"] == "Hello"
        assert result["output"]["value"] == 42

    @pytest.mark.asyncio
    async def test_python_multiline_script(self) -> None:
        """Test multiline Python script."""
        script = """
for i in range(3):
    print(f"Line {i}")
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "Line 0" in result["stdout"]
        assert "Line 1" in result["stdout"]
        assert "Line 2" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_calculation(self) -> None:
        """Test Python script with calculation."""
        script = """
result = 10 + 20
print(result)
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "30" in result["stdout"]


class TestPythonScriptInputParameters:
    """Test Python script input parameter handling."""

    @pytest.mark.asyncio
    async def test_python_single_input_parameter(self) -> None:
        """Test Python script with single input parameter."""
        script = """
import os
name = os.getenv('INPUT_NAME', 'default')
print(f"Hello, {name}!")
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={"name": "Alice"})

        assert result["return_code"] == 0
        assert "Hello, Alice!" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_multiple_input_parameters(self) -> None:
        """Test Python script with multiple input parameters."""
        script = """
import os
name = os.getenv('INPUT_NAME', 'default')
age = os.getenv('INPUT_AGE', '0')
print(f"User: {name}, Age: {age}")
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={"name": "Bob", "age": "30"})

        assert result["return_code"] == 0
        assert "User: Bob" in result["stdout"]
        assert "Age: 30" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_numeric_input(self) -> None:
        """Test Python script with numeric input and calculation."""
        script = """
import os
import json
value1 = int(os.getenv('INPUT_VALUE1', '0'))
value2 = int(os.getenv('INPUT_VALUE2', '0'))
result = value1 + value2
print(json.dumps({"result": result}))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={"value1": "10", "value2": "20"})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["result"] == 30

    @pytest.mark.asyncio
    async def test_python_list_input_json_serialization(self) -> None:
        """Test Python script with list input - verifies JSON serialization."""
        script = """
import os
import json
posts_json = os.getenv('INPUT_POSTS', '[]')
posts = json.loads(posts_json)
post_count = len(posts)
print(json.dumps({"count": post_count, "first_title": posts[0]["title"] if posts else None}))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        posts_data = [{"id": 1, "title": "Post 1"}, {"id": 2, "title": "Post 2"}]
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={"posts": posts_data})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["count"] == 2
        assert result["output"]["first_title"] == "Post 1"

    @pytest.mark.asyncio
    async def test_python_dict_input_json_serialization(self) -> None:
        """Test Python script with dict input - verifies JSON serialization."""
        script = """
import os
import json
user_json = os.getenv('INPUT_USER', '{}')
user = json.loads(user_json)
print(json.dumps({"name": user.get("name"), "email": user.get("email")}))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        user_data = {"name": "Alice", "email": "alice@example.com", "age": 30}
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={"user": user_data})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["name"] == "Alice"
        assert result["output"]["email"] == "alice@example.com"


class TestPythonScriptErrorHandling:
    """Test Python script error handling."""

    @pytest.mark.asyncio
    async def test_python_syntax_error(self) -> None:
        """Test Python script with syntax error."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code='print("Missing closing quote')

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert exc_info.value.exit_code != 0
        assert "SyntaxError" in exc_info.value.stderr or "invalid syntax" in exc_info.value.stderr

    @pytest.mark.asyncio
    async def test_python_runtime_error(self) -> None:
        """Test Python script with runtime error."""
        script = """
x = 10
y = 0
result = x / y  # Division by zero
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert exc_info.value.exit_code != 0
        assert "ZeroDivisionError" in exc_info.value.stderr or "division by zero" in exc_info.value.stderr

    @pytest.mark.asyncio
    async def test_python_import_error(self) -> None:
        """Test Python script with import error."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code="import nonexistent_module")

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert exc_info.value.exit_code != 0
        assert "ModuleNotFoundError" in exc_info.value.stderr or "No module named" in exc_info.value.stderr

    @pytest.mark.asyncio
    async def test_python_exception_raised(self) -> None:
        """Test Python script that raises exception."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code='raise Exception("Test error")')

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert exc_info.value.exit_code != 0
        assert "Test error" in exc_info.value.stderr or "Exception" in exc_info.value.stderr


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
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["status"] == "success"
        assert result["output"]["items"] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_python_invalid_json_output(self) -> None:
        """Test Python script with non-JSON output."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code='print("This is not JSON")')

        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "This is not JSON" in result["stdout"]
        # Should not have parsed output, just raw stdout
        assert "output" not in result or not isinstance(result.get("output"), dict)

    @pytest.mark.asyncio
    async def test_python_empty_output(self) -> None:
        """Test Python script with no output."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code="pass")

        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""

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
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["user"]["name"] == "Test User"
        assert result["output"]["user"]["details"]["age"] == 30

    @pytest.mark.asyncio
    async def test_python_debug_output_with_json_last_line(self) -> None:
        """Test Python script with debug prints before JSON on last line.

        This validates the smart JSON parsing feature that parses the last
        line as JSON when the entire stdout is not valid JSON.
        """
        script = """
import json

# Debug output that would normally break JSON parsing
print("Debug: Starting processing...")
print("Debug: Loading data...")
print("Debug: Processing item 1")

# Final JSON output on last line
result = {"status": "success", "items_processed": 3, "result": "complete"}
print(json.dumps(result))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0

        # Should have parsed JSON from last line
        assert "output" in result
        assert result["output"]["status"] == "success"
        assert result["output"]["items_processed"] == 3
        assert result["output"]["result"] == "complete"

        # Full stdout should include debug lines
        assert "Debug: Starting processing..." in result["stdout"]
        assert "Debug: Loading data..." in result["stdout"]
        assert "Debug: Processing item 1" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_multiple_json_lines_parses_last(self) -> None:
        """Test that when multiple lines contain JSON, the last one is parsed."""
        script = """
import json

# Print multiple JSON objects
print(json.dumps({"step": 1, "status": "in_progress"}))
print(json.dumps({"step": 2, "status": "in_progress"}))
print(json.dumps({"step": 3, "status": "complete"}))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0

        # Should have parsed the LAST JSON line
        assert "output" in result
        assert result["output"]["step"] == 3
        assert result["output"]["status"] == "complete"

    @pytest.mark.asyncio
    async def test_python_mixed_output_no_json_on_last_line(self) -> None:
        """Test script with JSON in middle but text on last line (no parsing)."""
        script = """
import json

print(json.dumps({"data": "this is JSON"}))
print("But this final line is not JSON")
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0

        # Should NOT have parsed output since last line is not JSON
        assert "output" not in result or not isinstance(result.get("output"), dict)

        # But stdout should contain everything
        assert '{"data": "this is JSON"}' in result["stdout"]
        assert "But this final line is not JSON" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_empty_lines_before_json(self) -> None:
        """Test that empty lines are ignored when finding last JSON line."""
        script = """
import json

print("Some debug output")
print("")
print(json.dumps({"result": "success"}))
print("")
print("   ")
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0

        # Should have parsed JSON (ignoring empty lines after it)
        assert "output" in result
        assert result["output"]["result"] == "success"

    @pytest.mark.asyncio
    async def test_python_single_line_json_still_works(self) -> None:
        """Test that pure single-line JSON still works (backwards compatibility)."""
        config = ScriptExecutorConfig(
            language=ScriptLanguage.PYTHON, code='import json; print(json.dumps({"simple": "test"}))'
        )

        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["simple"] == "test"


class TestPythonScriptEdgeCases:
    """Test Python script edge cases."""

    @pytest.mark.asyncio
    async def test_python_unicode_output(self) -> None:
        """Test Python script with unicode characters."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code='print("Hello 世界 🌍")')

        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "世界" in result["stdout"]
        assert "🌍" in result["stdout"]

    @pytest.mark.asyncio
    async def test_python_multiline_json_output(self) -> None:
        """Test Python script with pretty-printed JSON."""
        script = """
import json
data = {"a": 1, "b": 2}
print(json.dumps(data, indent=2))
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "output" in result
        assert result["output"]["a"] == 1
        assert result["output"]["b"] == 2

    @pytest.mark.asyncio
    async def test_python_stderr_output(self) -> None:
        """Test Python script with stderr output."""
        script = """
import sys
print("stdout message")
print("stderr message", file=sys.stderr)
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert "stdout message" in result["stdout"]
        assert "stderr message" in result["stderr"]

    @pytest.mark.asyncio
    async def test_python_empty_script(self) -> None:
        """Test minimal Python script with no output."""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code="pass")
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""

    @pytest.mark.asyncio
    async def test_python_comment_only_script(self) -> None:
        """Test Python script with only comments."""
        script = """
# This is a comment
# Another comment
"""
        config = ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code=script)
        result = await execute_python_script(config.model_dump(by_alias=True), inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""

    @pytest.mark.asyncio
    async def test_script_activity_resolves_timeout_template(self) -> None:
        """Test script activity resolves ${input.timeout} in config."""
        config = {"language": "bash", "code": "echo 'test'", "timeout": "${input.custom_timeout}"}
        inputs = {"custom_timeout": 120}

        result = await execute_bash_script(config, inputs)

        assert result["return_code"] == 0
