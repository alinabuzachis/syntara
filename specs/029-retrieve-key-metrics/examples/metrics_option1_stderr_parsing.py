#!/usr/bin/env python3
"""
Option 1: Metrics collection via systemd-run --wait stderr parsing.

Basic Approach - parses human-readable metrics from systemd-run stderr output.

Usage:
    python scripts/metrics_option1_stderr_parsing.py            # User session (default)
    python scripts/metrics_option1_stderr_parsing.py --system   # System session (requires root)
"""

import argparse
import asyncio
import re
import sys


def parse_size(value: str, unit: str) -> int:
    """Convert size string to bytes (e.g., '3.6M' -> 3774873)."""
    multipliers = {"": 1, "K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4}
    return int(float(value) * multipliers.get(unit, 1))


def parse_systemd_metrics(stderr_output: str) -> dict[str, int | str]:
    """Parse systemd-run --wait metrics output.

    Returns flattened dict with systemd property names for consistency.

    Example input:
              Finished with result: success
    Main processes terminated with: code=exited, status=0/SUCCESS
                   Service runtime: 882ms
                 CPU time consumed: 22ms
                       Memory peak: 3.6M (swap: 0B)
                        IP Traffic: received 87.6K, sent 4.2K
                          IO Bytes: read 104K, written 50K
    """
    metrics: dict[str, int | str] = {}

    # Service runtime (duration) - custom property, not from systemd
    if match := re.search(r"Service runtime:\s*([\d.]+)(ms|s|min|h)", stderr_output):
        value, unit = match.groups()
        if unit == "ms":
            metrics["DurationMs"] = int(float(value))
        elif unit == "s":
            metrics["DurationMs"] = int(float(value) * 1000)
        elif unit == "min":
            metrics["DurationMs"] = int(float(value) * 60 * 1000)
        elif unit == "h":
            metrics["DurationMs"] = int(float(value) * 3600 * 1000)

    # CPU time consumed -> CPUUsageNSec (convert ms to ns)
    if match := re.search(r"CPU time consumed:\s*([\d.]+)(ms|s|min)", stderr_output):
        value, unit = match.groups()
        if unit == "ms":
            metrics["CPUUsageNSec"] = int(float(value) * 1_000_000)
        elif unit == "s":
            metrics["CPUUsageNSec"] = int(float(value) * 1_000_000_000)
        elif unit == "min":
            metrics["CPUUsageNSec"] = int(float(value) * 60 * 1_000_000_000)

    # Memory peak -> MemoryPeak
    if match := re.search(r"Memory peak:\s*([\d.]+)([KMGT]?)B?", stderr_output):
        value, unit = match.groups()
        metrics["MemoryPeak"] = parse_size(value, unit)

    # Network traffic -> IPIngressBytes, IPEgressBytes
    if match := re.search(r"received ([\d.]+)([KMGT]?)B?,\s*sent ([\d.]+)([KMGT]?)B?", stderr_output):
        recv_val, recv_unit, sent_val, sent_unit = match.groups()
        metrics["IPIngressBytes"] = parse_size(recv_val, recv_unit)
        metrics["IPEgressBytes"] = parse_size(sent_val, sent_unit)

    # I/O (only appears if IOAccounting enabled AND I/O occurred)
    # -> IOReadBytes, IOWriteBytes
    if match := re.search(r"IO Bytes:.*?read ([\d.]+)([KMGT]?)B?", stderr_output):
        read_val, read_unit = match.groups()
        metrics["IOReadBytes"] = parse_size(read_val, read_unit)

    if match := re.search(r"written ([\d.]+)([KMGT]?)B?", stderr_output):
        write_val, write_unit = match.groups()
        metrics["IOWriteBytes"] = parse_size(write_val, write_unit)

    # Finished result
    if match := re.search(r"Finished with result:\s*(\w+)", stderr_output):
        metrics["Result"] = match.group(1)

    # Exit status
    if match := re.search(r"status=(\d+)/", stderr_output):
        metrics["ExitStatus"] = int(match.group(1))

    return metrics


def extract_script_stderr(combined_output: str) -> str:
    """Separate script stderr from systemd metrics output.

    systemd-run --wait output appears after script completes.
    Lines starting with significant whitespace are systemd metrics.
    """
    lines = combined_output.split("\n")
    script_lines = []
    systemd_markers = [
        "Finished with result:",
        "Main processes terminated",
        "Service runtime:",
        "CPU time consumed:",
        "Memory peak:",
        "IP Traffic:",
        "IO Bytes:",
    ]

    for line in lines:
        # Skip lines that are systemd metrics (heavily indented or contain markers)
        if any(marker in line for marker in systemd_markers):
            continue
        # Skip empty lines that are part of systemd output formatting
        if line.startswith("        "):  # 8+ spaces = systemd formatting
            continue
        script_lines.append(line)

    return "\n".join(script_lines).strip()


async def execute_with_metrics(
    command: list[str],
    timeout: int = 120,
    user_mode: bool = False,
) -> dict[str, bytes | int | dict[str, int | str] | str]:
    """Execute script via systemd-run and parse metrics from stderr."""
    systemd_cmd = [
        "systemd-run",
        "--wait",  # Wait and print metrics to stderr
        "--pipe",  # Connect stdout/stderr of the command to the calling process
        # Note: Don't use --quiet as it suppresses metrics output
        "--property=CPUAccounting=yes",
        "--property=MemoryAccounting=yes",
        "--property=IOAccounting=yes",
        "--property=IPAccounting=yes",
    ]

    if user_mode:
        systemd_cmd.append("--user")

    systemd_cmd.extend(
        [
            "--",  # End of systemd-run options
            *command,
        ]
    )

    print(f"Executing: {' '.join(systemd_cmd)}")
    print("-" * 60)

    process = await asyncio.create_subprocess_exec(
        *systemd_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout,
        )

        stderr_str = stderr.decode("utf-8", errors="replace")

        # Parse metrics from stderr
        metrics = parse_systemd_metrics(stderr_str)

        # Separate script stderr from systemd metrics output
        script_stderr = extract_script_stderr(stderr_str)

        return {
            "stdout": stdout,
            "stderr": stderr,
            "script_stderr": script_stderr,
            "returncode": process.returncode or 0,
            "metrics": metrics,
        }
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise


async def main() -> None:
    """Run curl command and display results with metrics."""
    parser = argparse.ArgumentParser(description="Execute a command with systemd-run and collect metrics")
    parser.add_argument(
        "--system",
        action="store_true",
        help="Use the system systemd session instead of the user session (requires root)",
    )
    args = parser.parse_args()

    command = [
        "curl",
        "-v",
        "-o",
        "/tmp/a",
        "https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.19.xz",
    ]

    print("=" * 60)
    print("Option 1: systemd-run --wait stderr parsing")
    if args.system:
        print("Mode: system session (--system)")
    else:
        print("Mode: user session (default)")
    print("=" * 60)
    print()

    try:
        result = await execute_with_metrics(command, timeout=120, user_mode=not args.system)

        print()
        print("=" * 60)
        print("STDOUT:")
        print("=" * 60)
        stdout = result["stdout"]
        if isinstance(stdout, bytes):
            print(stdout.decode("utf-8", errors="replace") or "(empty)")
        else:
            print(stdout or "(empty)")

        print()
        print("=" * 60)
        print("STDERR (script output only):")
        print("=" * 60)
        print(result["script_stderr"] or "(empty)")

        print()
        print("=" * 60)
        print("STDERR (raw, including systemd metrics):")
        print("=" * 60)
        stderr = result["stderr"]
        if isinstance(stderr, bytes):
            print(stderr.decode("utf-8", errors="replace") or "(empty)")
        else:
            print(stderr or "(empty)")

        print()
        print("=" * 60)
        print("METRICS (parsed from systemd-run output):")
        print("=" * 60)
        metrics = result["metrics"]
        if isinstance(metrics, dict):
            for key, value in sorted(metrics.items()):
                if key == "DurationMs":
                    print(f"  {key}: {value} ms ({value / 1000:.2f} seconds)")
                elif key == "CPUUsageNSec":
                    cpu_ms = value / 1_000_000 if isinstance(value, int) else 0
                    print(f"  {key}: {value} ns ({cpu_ms:.2f} ms)")
                elif key in ("MemoryPeak", "IPIngressBytes", "IPEgressBytes", "IOReadBytes", "IOWriteBytes"):
                    if isinstance(value, int):
                        if value >= 1024 * 1024:
                            print(f"  {key}: {value} bytes ({value / 1024 / 1024:.2f} MB)")
                        elif value >= 1024:
                            print(f"  {key}: {value} bytes ({value / 1024:.2f} KB)")
                        else:
                            print(f"  {key}: {value} bytes")
                    else:
                        print(f"  {key}: {value}")
                else:
                    print(f"  {key}: {value}")

        print()
        print("=" * 60)
        print(f"Return code: {result['returncode']}")
        print("=" * 60)

    except asyncio.TimeoutError:
        print("ERROR: Command timed out", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print("ERROR: systemd-run not found. Is systemd installed?", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
