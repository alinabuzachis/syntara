#!/usr/bin/env python3
"""
Option 2: Metrics collection via D-Bus/pystemd direct control.

Advanced Approach - uses pystemd library for precise metrics via D-Bus.
No subprocess calls - pure D-Bus for both metrics and journal access.

Requirements:
    pip install pystemd systemd-python
    # Also requires libsystemd-dev system package

Usage:
    python scripts/metrics_option2_dbus_pystemd.py            # User session (default)
    python scripts/metrics_option2_dbus_pystemd.py --system   # System session (requires root)
"""

import argparse
import asyncio
import sys
import time
import uuid

try:
    from pystemd.dbuslib import DBus
    from pystemd.systemd1 import Manager, Unit
except ImportError:
    print("ERROR: pystemd is not installed.", file=sys.stderr)
    print("Install with: pip install pystemd", file=sys.stderr)
    print("You may also need: sudo dnf install systemd-devel (Fedora/RHEL)", file=sys.stderr)
    print("                   sudo apt install libsystemd-dev (Debian/Ubuntu)", file=sys.stderr)
    sys.exit(1)

try:
    from systemd import journal
except ImportError:
    print("ERROR: systemd-python is not installed.", file=sys.stderr)
    print("Install with: pip install systemd-python", file=sys.stderr)
    sys.exit(1)


def escape_unit_name(name: str) -> str:
    """Escape a string for use in a systemd unit name (D-Bus path)."""
    # Replace characters that need escaping in D-Bus paths
    result = ""
    for char in name:
        if char == "-":
            result += "_2d"
        elif char == ".":
            result += "_2e"
        elif char == "_":
            result += "_5f"
        elif char.isalnum():
            result += char
        else:
            result += f"_{ord(char):02x}"
    return result


async def execute_with_metrics_dbus(
    command: list[str],
    timeout: int = 120,
    user_mode: bool = False,
) -> dict:
    """Execute script via pure D-Bus/pystemd StartTransientUnit.

    This approach:
    1. Creates a transient unit via D-Bus StartTransientUnit()
    2. Polls D-Bus for completion
    3. Reads stdout/stderr from the journal
    4. Collects precise metrics from D-Bus
    5. Cleans up the unit
    """
    # Generate unique unit name
    unit_id = uuid.uuid4().hex[:8]
    unit_name = f"nexus-script-{unit_id}.service"

    print(f"Unit name: {unit_name}")
    print("-" * 60)

    # Connect to D-Bus
    bus = DBus(user_mode=user_mode)
    bus.open()

    manager = Manager(bus=bus)
    manager.load()

    start_time = time.time()

    # Build ExecStart property
    # Format: [(binary, [argv], ignore_failure), ...]
    exec_start = [
        (
            command[0].encode(),  # Binary path
            [c.encode() for c in command],  # Full argv including binary
            False,  # Don't ignore failures
        )
    ]

    # Create and start transient unit via D-Bus
    # Use journal for stdout/stderr (avoids file permission issues)
    properties = {
        b"Description": f"Nexus script execution: {' '.join(command)}".encode(),
        b"Type": b"oneshot",
        b"ExecStart": exec_start,
        b"StandardOutput": b"journal",
        b"StandardError": b"journal",
        b"CPUAccounting": True,
        b"MemoryAccounting": True,
        b"IOAccounting": True,
        b"IPAccounting": True,
        b"RemainAfterExit": True,  # Keep unit for metrics query
    }

    manager.Manager.StartTransientUnit(
        unit_name.encode(),
        b"fail",  # mode: fail if unit already exists
        properties,
    )

    # Poll until the unit completes
    unit = Unit(unit_name.encode(), bus=bus)

    while True:
        unit.load()

        active_state = unit.Unit.ActiveState
        if isinstance(active_state, bytes):
            active_state = active_state.decode()

        sub_state = getattr(unit.Unit, "SubState", b"unknown")
        if isinstance(sub_state, bytes):
            sub_state = sub_state.decode()

        # For oneshot with RemainAfterExit, check for "active/exited"
        if active_state == "inactive" or active_state == "failed":
            break
        if active_state == "active" and sub_state == "exited":
            break

        # Check timeout
        elapsed = time.time() - start_time
        if elapsed > timeout:
            # Stop the unit on timeout
            try:
                manager.Manager.StopUnit(unit_name.encode(), b"fail")
            except Exception:
                pass
            raise TimeoutError(f"Command timed out after {timeout}s")

        # Poll every 100ms
        await asyncio.sleep(0.1)

    duration_ms = int((time.time() - start_time) * 1000)

    # Read stdout/stderr from the journal via D-Bus (no subprocess)
    stdout_lines = []
    stderr_lines = []

    # Open journal reader with appropriate flags for user/system mode
    if user_mode:
        j = journal.Reader(journal.CURRENT_USER)
        # For user session units, use _SYSTEMD_USER_UNIT field
        j.add_match(_SYSTEMD_USER_UNIT=unit_name)
    else:
        j = journal.Reader(journal.SYSTEM)
        # For system units, use _SYSTEMD_UNIT field
        j.add_match(_SYSTEMD_UNIT=unit_name)

    # Seek to the start time of our execution (slightly before)
    j.seek_realtime(start_time - 1)

    # Read all journal entries for this unit
    for entry in j:
        message = entry.get("MESSAGE", "")
        if isinstance(message, bytes):
            message = message.decode("utf-8", errors="replace")

        # Skip empty messages
        if not message:
            continue

        # Check PRIORITY to separate stdout (6=INFO) from stderr (3=ERR, 4=WARNING)
        # Default to stdout (priority 6) if not set
        priority = entry.get("PRIORITY")
        if isinstance(priority, bytes):
            priority = int(priority.decode())
        elif isinstance(priority, str):
            priority = int(priority)
        elif priority is None:
            priority = 6

        if priority <= 4:  # ERR or WARNING -> stderr
            stderr_lines.append(message)
        else:  # INFO or higher -> stdout
            stdout_lines.append(message)

    j.close()

    stdout = "\n".join(stdout_lines).encode("utf-8")
    stderr = "\n".join(stderr_lines).encode("utf-8") if stderr_lines else b""

    try:
        # Reload unit to get final metrics
        unit.load()

        # Collect metrics with systemd property names (flattened structure)
        metrics: dict[str, int] = {}

        # UINT64_MAX means "not set" in systemd
        UINT64_MAX = 18446744073709551615

        def is_valid_metric(value: int | None) -> bool:
            """Check if metric value is valid (not None, not 0, not UINT64_MAX)."""
            return value is not None and value > 0 and value != UINT64_MAX

        # Duration - already calculated above
        metrics["DurationMs"] = duration_ms

        # CPU metrics
        if hasattr(unit.Service, "CPUUsageNSec"):
            cpu_nsec = unit.Service.CPUUsageNSec
            if is_valid_metric(cpu_nsec):
                metrics["CPUUsageNSec"] = cpu_nsec

        # Memory metrics
        if hasattr(unit.Service, "MemoryPeak"):
            mem_peak = unit.Service.MemoryPeak
            if is_valid_metric(mem_peak):
                metrics["MemoryPeak"] = mem_peak

        if hasattr(unit.Service, "MemoryCurrent"):
            mem_current = unit.Service.MemoryCurrent
            if is_valid_metric(mem_current):
                metrics["MemoryCurrent"] = mem_current

        # Network metrics
        if hasattr(unit.Service, "IPIngressBytes"):
            ip_in = unit.Service.IPIngressBytes
            if is_valid_metric(ip_in):
                metrics["IPIngressBytes"] = ip_in

        if hasattr(unit.Service, "IPEgressBytes"):
            ip_out = unit.Service.IPEgressBytes
            if is_valid_metric(ip_out):
                metrics["IPEgressBytes"] = ip_out

        if hasattr(unit.Service, "IPIngressPackets"):
            ip_in_pkts = unit.Service.IPIngressPackets
            if is_valid_metric(ip_in_pkts):
                metrics["IPIngressPackets"] = ip_in_pkts

        if hasattr(unit.Service, "IPEgressPackets"):
            ip_out_pkts = unit.Service.IPEgressPackets
            if is_valid_metric(ip_out_pkts):
                metrics["IPEgressPackets"] = ip_out_pkts

        # I/O metrics
        if hasattr(unit.Service, "IOReadBytes"):
            io_read = unit.Service.IOReadBytes
            if is_valid_metric(io_read):
                metrics["IOReadBytes"] = io_read

        if hasattr(unit.Service, "IOWriteBytes"):
            io_write = unit.Service.IOWriteBytes
            if is_valid_metric(io_write):
                metrics["IOWriteBytes"] = io_write

        if hasattr(unit.Service, "IOReadOperations"):
            io_read_ops = unit.Service.IOReadOperations
            if is_valid_metric(io_read_ops):
                metrics["IOReadOperations"] = io_read_ops

        if hasattr(unit.Service, "IOWriteOperations"):
            io_write_ops = unit.Service.IOWriteOperations
            if is_valid_metric(io_write_ops):
                metrics["IOWriteOperations"] = io_write_ops

        # Get exit status from the unit
        exit_status = 0
        if hasattr(unit.Service, "ExecMainStatus"):
            exit_status = unit.Service.ExecMainStatus or 0

        return {
            "stdout": stdout,
            "stderr": stderr,
            "returncode": exit_status,
            "metrics": metrics,
            "unit_name": unit_name,
        }

    finally:
        # Cleanup: stop the unit to remove it
        try:
            manager.Manager.StopUnit(unit_name.encode(), b"fail")
        except Exception as e:
            print(f"Warning: Failed to stop unit {unit_name}: {e}", file=sys.stderr)

        # Close the D-Bus connection
        try:
            bus.close()
        except Exception:
            pass


async def main() -> None:
    """Run curl command and display results with metrics."""
    parser = argparse.ArgumentParser(
        description="Execute a command with pystemd/D-Bus and collect metrics"
    )
    parser.add_argument(
        "--system",
        action="store_true",
        help="Use the system systemd session instead of the user session (requires root)",
    )
    args = parser.parse_args()

    command = [
        "/usr/bin/curl",  # Full path required for systemd ExecStart
        "-v",
        "-o",
        "/tmp/a",
        "https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.19.xz",
    ]

    print("=" * 60)
    print("Option 2: D-Bus/pystemd direct control")
    if args.system:
        print("Mode: system session (--system)")
    else:
        print("Mode: user session (default)")
    print("=" * 60)
    print()
    print(f"Executing: {' '.join(command)}")

    try:
        result = await execute_with_metrics_dbus(command, timeout=120, user_mode=not args.system)

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
        print("STDERR:")
        print("=" * 60)
        stderr = result["stderr"]
        if isinstance(stderr, bytes):
            print(stderr.decode("utf-8", errors="replace") or "(empty)")
        else:
            print(stderr or "(empty)")

        print()
        print("=" * 60)
        print("METRICS (from D-Bus properties - precise values):")
        print("=" * 60)
        metrics = result["metrics"]
        if isinstance(metrics, dict):
            for key, value in sorted(metrics.items()):
                if key == "DurationMs":
                    print(f"  {key}: {value} ms ({value / 1000:.2f} seconds)")
                elif key == "CPUUsageNSec":
                    cpu_ms = value / 1_000_000 if isinstance(value, int) else 0
                    cpu_s = value / 1_000_000_000 if isinstance(value, int) else 0
                    print(f"  {key}: {value} ns ({cpu_ms:.2f} ms / {cpu_s:.4f} s)")
                elif key in ("MemoryPeak", "MemoryCurrent", "IPIngressBytes", "IPEgressBytes", "IOReadBytes", "IOWriteBytes"):
                    if isinstance(value, int):
                        if value >= 1024 * 1024:
                            print(f"  {key}: {value} bytes ({value / 1024 / 1024:.2f} MB)")
                        elif value >= 1024:
                            print(f"  {key}: {value} bytes ({value / 1024:.2f} KB)")
                        else:
                            print(f"  {key}: {value} bytes")
                    else:
                        print(f"  {key}: {value}")
                elif key in ("IPIngressPackets", "IPEgressPackets", "IOReadOperations", "IOWriteOperations"):
                    print(f"  {key}: {value} (count)")
                else:
                    print(f"  {key}: {value}")

        print()
        print("=" * 60)
        print(f"Return code: {result['returncode']}")
        print(f"Unit name: {result['unit_name']}")
        print("=" * 60)

    except TimeoutError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except PermissionError:
        print("ERROR: Permission denied. You may need to run with appropriate privileges.", file=sys.stderr)
        print("Try running as root or ensure your user has access to systemd user session.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    asyncio.run(main())
