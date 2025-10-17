"""Unit tests for bash script activity executor."""

import pytest

from nexus.api.workflows.activities.script_activity import (
    ScriptExecutionError,
    execute_bash_script,
)


class TestBashScriptExecution:
    """Test basic bash script execution functionality."""

    @pytest.mark.asyncio
    async def test_simple_echo(self) -> None:
        """Test simple echo command."""
        result = await execute_bash_script(script='echo "Hello, World!"', inputs={})

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
        result = await execute_bash_script(script=script, inputs={})

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
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "Hello, Workflow!" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_commands(self) -> None:
        """Test script with actual bash commands."""
        script = """
        date_output=$(date +%Y-%m-%d)
        echo "Date: $date_output"
        """
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "Date:" in result["stdout"]


class TestScriptInputParameters:
    """Test script input parameter handling."""

    @pytest.mark.asyncio
    async def test_single_input_parameter(self) -> None:
        """Test script with single input parameter."""
        script = 'echo "Hello, $INPUT_NAME!"'
        result = await execute_bash_script(script=script, inputs={"name": "Alice"})

        assert result["return_code"] == 0
        assert "Hello, Alice!" in result["stdout"]

    @pytest.mark.asyncio
    async def test_multiple_input_parameters(self) -> None:
        """Test script with multiple input parameters."""
        script = 'echo "User: $INPUT_NAME, Age: $INPUT_AGE"'
        result = await execute_bash_script(script=script, inputs={"name": "Bob", "age": "30"})

        assert result["return_code"] == 0
        assert "User: Bob" in result["stdout"]
        assert "Age: 30" in result["stdout"]

    @pytest.mark.asyncio
    async def test_empty_inputs(self) -> None:
        """Test script with no inputs."""
        script = 'echo "No inputs"'
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "No inputs" in result["stdout"]

    @pytest.mark.asyncio
    async def test_numeric_input(self) -> None:
        """Test script with numeric input."""
        script = 'echo "Number: $INPUT_COUNT"'
        result = await execute_bash_script(script=script, inputs={"count": "42"})

        assert result["return_code"] == 0
        assert "Number: 42" in result["stdout"]

    @pytest.mark.asyncio
    async def test_special_characters_in_input(self) -> None:
        """Test script with special characters in input."""
        script = 'echo "Message: $INPUT_MSG"'
        result = await execute_bash_script(script=script, inputs={"msg": "Hello-World_123"})

        assert result["return_code"] == 0
        assert "Hello-World_123" in result["stdout"]


class TestScriptOutputParsing:
    """Test script output parsing and capture."""

    @pytest.mark.asyncio
    async def test_stdout_capture(self) -> None:
        """Test that stdout is properly captured."""
        script = """
echo "Output line 1"
echo "Output line 2"
"""
        result = await execute_bash_script(script=script, inputs={})

        assert "Output line 1" in result["stdout"]
        assert "Output line 2" in result["stdout"]

    @pytest.mark.asyncio
    async def test_stderr_capture(self) -> None:
        """Test that stderr is properly captured."""
        script = 'echo "Error message" >&2'
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "Error message" in result["stderr"]

    @pytest.mark.asyncio
    async def test_json_output(self) -> None:
        """Test script that outputs JSON."""
        script = 'echo \'{"status": "success", "count": 42}\''
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert '{"status": "success"' in result["stdout"]
        assert '"count": 42' in result["stdout"]

    @pytest.mark.asyncio
    async def test_empty_output(self) -> None:
        """Test script with no output."""
        script = "# Just a comment, no output"
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""
        assert result["stderr"] == ""


class TestScriptErrorHandling:
    """Test error handling in script execution."""

    @pytest.mark.asyncio
    async def test_non_zero_exit_code(self) -> None:
        """Test script that exits with non-zero code."""
        script = "exit 1"

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_bash_script(script=script, inputs={})

        error = exc_info.value
        assert error.exit_code == 1
        assert "exit code 1" in str(error)

    @pytest.mark.asyncio
    async def test_command_not_found(self) -> None:
        """Test script with invalid command."""
        script = "nonexistentcommand12345"

        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_bash_script(script=script, inputs={})

        error = exc_info.value
        assert error.exit_code != 0

    @pytest.mark.asyncio
    async def test_syntax_error(self) -> None:
        """Test script with bash syntax error."""
        script = 'if [ true ]; then\necho "incomplete"'  # Missing fi

        with pytest.raises(ScriptExecutionError):
            await execute_bash_script(script=script, inputs={})

    @pytest.mark.asyncio
    async def test_error_with_stderr(self) -> None:
        """Test that stderr is captured on error."""
        script = """
echo "Error details" >&2
exit 1
"""
        with pytest.raises(ScriptExecutionError) as exc_info:
            await execute_bash_script(script=script, inputs={})

        error = exc_info.value
        assert "Error details" in error.stderr
        assert error.exit_code == 1


class TestScriptAdvancedFeatures:
    """Test advanced script execution features."""

    @pytest.mark.asyncio
    async def test_script_with_pipes(self) -> None:
        """Test script using pipes."""
        script = 'echo "hello world" | tr "a-z" "A-Z"'
        result = await execute_bash_script(script=script, inputs={})

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
        result = await execute_bash_script(script=script, inputs={"arg": "test"})

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
        result = await execute_bash_script(script=script, inputs={})

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
        result = await execute_bash_script(script=script, inputs={"num1": "10", "num2": "5"})

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
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "test content" in result["stdout"]

    @pytest.mark.asyncio
    async def test_long_running_script(self) -> None:
        """Test script that takes some time to complete."""
        script = """
sleep 1
echo "Completed"
"""
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "Completed" in result["stdout"]

    @pytest.mark.asyncio
    async def test_script_with_subshell(self) -> None:
        """Test script using subshell."""
        script = """
output=$(echo "subshell output")
echo "From subshell: $output"
"""
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "From subshell: subshell output" in result["stdout"]


class TestInputValidation:
    """Test input parameter validation and sanitization."""

    @pytest.mark.asyncio
    async def test_input_with_null_byte(self) -> None:
        """Test that null bytes in input values are rejected."""
        script = 'echo "Test"'

        with pytest.raises(ValueError, match="null bytes"):
            await execute_bash_script(script=script, inputs={"bad": "value\0with_null"})

    @pytest.mark.asyncio
    async def test_input_exceeds_max_length(self) -> None:
        """Test that excessively long input values are rejected."""
        script = 'echo "Test"'
        # Create a string larger than 32KB
        large_value = "x" * 40000

        with pytest.raises(ValueError, match="maximum length"):
            await execute_bash_script(script=script, inputs={"large": large_value})

    @pytest.mark.asyncio
    async def test_input_at_max_length(self) -> None:
        """Test that input at max length is accepted."""
        script = 'echo "Length: ${#INPUT_DATA}"'
        # Create a string exactly at 32KB
        max_value = "x" * 32768

        result = await execute_bash_script(script=script, inputs={"data": max_value})
        assert result["return_code"] == 0

    @pytest.mark.asyncio
    async def test_input_with_newlines(self) -> None:
        """Test that newlines in input values are preserved."""
        script = 'echo "$INPUT_TEXT"'

        result = await execute_bash_script(script=script, inputs={"text": "line1\nline2\nline3"})
        assert result["return_code"] == 0
        assert "line1" in result["stdout"]
        assert "line2" in result["stdout"]
        assert "line3" in result["stdout"]

    @pytest.mark.asyncio
    async def test_input_with_special_chars(self) -> None:
        """Test that special characters in input are handled safely."""
        script = 'echo "$INPUT_MSG"'

        result = await execute_bash_script(script=script, inputs={"msg": "$HOME;ls;pwd"})
        assert result["return_code"] == 0
        # The string should be treated literally, not executed
        assert "$HOME;ls;pwd" in result["stdout"]


class TestScriptEdgeCases:
    """Test edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_empty_script(self) -> None:
        """Test empty script."""
        result = await execute_bash_script(script="", inputs={})

        assert result["return_code"] == 0
        assert result["stdout"] == ""

    @pytest.mark.asyncio
    async def test_script_with_only_whitespace(self) -> None:
        """Test script with only whitespace."""
        result = await execute_bash_script(script="   \n\n   ", inputs={})

        assert result["return_code"] == 0
        assert result["stdout"].strip() == ""

    @pytest.mark.asyncio
    async def test_script_with_only_comments(self) -> None:
        """Test script with only comments."""
        script = """
# This is a comment
# Another comment
"""
        result = await execute_bash_script(script=script, inputs={})

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
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "Line 1" in result["stdout"]
        assert "Line 100" in result["stdout"]

    @pytest.mark.asyncio
    async def test_unicode_in_output(self) -> None:
        """Test script with unicode characters."""
        script = 'echo "Hello 世界 🌍"'
        result = await execute_bash_script(script=script, inputs={})

        assert result["return_code"] == 0
        assert "世界" in result["stdout"]
        assert "🌍" in result["stdout"]
