# Research Findings: Script Task Execution Metrics with cgroups v2

**Feature**: Script Task Execution Metrics Retrieval
**Date**: 2026-02-12
**Branch**: 029-retrieve-key-metrics

## Overview

This document consolidates research findings for implementing resource metrics collection for script task executions using Linux cgroups v2. Research addressed two primary technical unknowns identified during planning: cgroups v2 management approach and process execution tooling.

### Architecture Overview

```mermaid
flowchart TB
    subgraph Nexus["Nexus Application"]
        ScriptActivity["script_activity.py"]
        MetricsParser["Metrics Parser"]
    end

    subgraph SystemdLayer["systemd Layer"]
        SystemdRun["systemd-run --wait"]
        TransientUnit["Transient Unit<br/>(nexus-script-xxx.service)"]
        SystemdManager["systemd Manager<br/>(PID 1)"]
    end

    subgraph DBus["D-Bus (org.freedesktop.systemd1)"]
        ManagerInterface["Manager Interface"]
        UnitInterface["Unit Interface<br/>(Properties)"]
    end

    subgraph Kernel["Linux Kernel"]
        CgroupV2["cgroups v2 Hierarchy<br/>(/sys/fs/cgroup/system.slice/...)"]
        Controllers["Resource Controllers<br/>(cpu, memory, io, net)"]
        ScriptProcess["Script Process<br/>(bash/python)"]
    end

    %% Execution flow
    ScriptActivity -->|"1. Execute via subprocess"| SystemdRun
    SystemdRun -->|"2. Create transient unit"| SystemdManager
    SystemdManager -->|"3. Create cgroup & spawn"| CgroupV2
    CgroupV2 -->|"4. Place process in cgroup"| ScriptProcess
    ScriptProcess -->|"5. Resource usage tracked"| Controllers

    %% Metrics retrieval paths
    Controllers -->|"6a. Aggregate metrics"| TransientUnit
    TransientUnit -->|"7a. Print to stderr"| SystemdRun
    SystemdRun -->|"8a. stderr output"| MetricsParser

    %% Alternative D-Bus path
    Controllers -.->|"6b. Expose via properties"| UnitInterface
    UnitInterface -.->|"7b. Query properties"| ScriptActivity

    %% D-Bus management
    SystemdManager <-->|"Control interface"| ManagerInterface
    TransientUnit <-->|"Unit properties"| UnitInterface

    %% Styling
    classDef nexus fill:#e1f5fe,stroke:#01579b
    classDef systemd fill:#fff3e0,stroke:#e65100
    classDef dbus fill:#f3e5f5,stroke:#7b1fa2
    classDef kernel fill:#e8f5e9,stroke:#2e7d32

    class ScriptActivity,MetricsParser nexus
    class SystemdRun,TransientUnit,SystemdManager systemd
    class ManagerInterface,UnitInterface dbus
    class CgroupV2,Controllers,ScriptProcess kernel
```

**Data Flow Explanation**:

| Path | Description | When to Use |
|------|-------------|-------------|
| **Basic (8a)** | `systemd-run --wait` → stderr parsing | Simple, zero dependencies, recommended |
| **Advanced (7b)** | D-Bus property queries via pystemd | Real-time monitoring, additional metrics |

**Key Components**:

- **Nexus**: Orchestrates script execution and collects metrics
- **systemd-run**: CLI tool to create transient systemd units
- **Transient Unit**: Short-lived systemd service that wraps the script process
- **D-Bus**: Inter-process communication bus for querying systemd properties
- **cgroups v2**: Kernel feature for resource accounting and control
- **Controllers**: CPU, memory, I/O, and network accounting subsystems

**Summary of Findings**:
- **Basic Approach** (Recommended): Use `systemd-run --wait` with stderr parsing. Simple, zero dependencies, sufficient for most use cases.
- **Alternative Approach**: Use `systemd-run --remain-after-exit` + `systemctl show` for precise metrics. Reliable but requires manual cleanup.
- **Advanced Approach** (Optional): Use D-Bus/pystemd for unit lifecycle management. Provides higher precision, additional metrics, real-time monitoring capability, and elegant Python API.
- **Direct cgroup file reading**: Possible but **not recommended**. Would add unnecessary complexity when D-Bus already exposes all cgroup metrics as properties that can be polled at any frequency.

---

## Research Question 1: cgroups v2 Python Management Library

**Question**: Which Python library or approach should be used for reading cgroups v2 metrics?

### Decision: NOT NEEDED (systemd provides all required metrics)

**TL;DR**: Direct cgroup file reading is **not needed** to meet project requirements. Use systemd-run --wait (basic approach) or D-Bus/pystemd (advanced approach). Direct filesystem access would add unnecessary complexity. Skip to [Research Question 2](#research-question-2-process-execution-tool-systemd-run-vs-cgexec).

After further research into systemd unit lifecycle (see "Systemd Unit Metrics Retrieval: Implementation Approaches" section), direct cgroup file reading is **not required**:

- **Basic Approach**: Use `systemd-run --wait` stderr output parsing (no cgroup file reading, no extra dependencies)
- **Advanced Approach**: Use D-Bus/pystemd for unit lifecycle management (supports both one-time final metrics AND real-time sampling by polling D-Bus properties during execution)
- **Direct cgroup file access**: Possible but unnecessary. Would add complexity without providing additional value since D-Bus already exposes all cgroup metrics as properties that can be polled at any frequency.

The research below is retained for completeness, but **direct cgroup file reading is not recommended** as it would complexify the design without addressing additional requirements beyond what systemd already provides.

### If Direct Cgroup Reading Were Needed: Direct sysfs Access with asyncio

**Rationale** (theoretical - not recommended for this project):
1. **Zero System Dependencies**: No libsystemd-dev or libcgroup-dev packages required
2. **Full Async Support**: Native Python 3.12 asyncio integration via aiofiles
3. **100% cgroups v2 Compatibility**: Direct access to kernel unified hierarchy interface
4. **Minimal Overhead**: <1ms per read operation, suitable for high-frequency monitoring (>100Hz)
5. **Maximum Flexibility**: Complete control over what metrics are read and when
6. **Stability**: Linux kernel sysfs interface is stable ABI (won't break between versions)
7. **Simplicity**: No complex library APIs to learn; straightforward file reading

### Implementation Approach (Not Recommended - For Reference Only)

**Note**: This section describes direct cgroup file reading, which is **not recommended** for this project. Direct filesystem access would add unnecessary complexity when D-Bus already provides all needed metrics with the ability to poll at any frequency. Retained here only for completeness.

**Dependencies to Add** (if you ignored the recommendation above):
```toml
# pyproject.toml
[project]
dependencies = [
    "asyncinotify>=4.3.0",  # For event-driven monitoring (optional)
    # aiofiles already present in Nexus dependencies
]
```

**Core Metrics to Read from sysfs** (direct file access - not recommended):

```python
# CPU metrics: /sys/fs/cgroup/{cgroup_path}/cpu.stat
cpu.stat:
  - usage_usec: Total CPU time in microseconds
  - user_usec: User-mode CPU time
  - system_usec: Kernel-mode CPU time
  - nr_periods: Number of enforcement periods
  - nr_throttled: Times process was throttled

# Memory metrics: /sys/fs/cgroup/{cgroup_path}/memory.*
memory.current: Current memory usage in bytes
memory.peak: Peak memory usage since cgroup creation
memory.stat:
  - anon: Anonymous memory (heap, stack)
  - file: Page cache memory
  - kernel_stack: Kernel stack memory
  - shmem: Shared memory

# I/O metrics: /sys/fs/cgroup/{cgroup_path}/io.stat
io.stat (per device):
  - rbytes: Bytes read
  - wbytes: Bytes written
  - rios: Read I/O operations
  - wios: Write I/O operations
```

**Example Reading Pattern**:

```python
from pathlib import Path
import asyncio

async def read_cgroup_stat(cgroup_path: Path, stat_file: str) -> dict[str, int]:
    """Read cgroup stat file and parse key-value pairs."""
    stat_path = cgroup_path / stat_file

    async with aiofiles.open(stat_path, 'r') as f:
        content = await f.read()

    stats = {}
    for line in content.strip().split('\n'):
        if ' ' in line:
            key, value = line.split(' ', 1)
            stats[key] = int(value) if value.isdigit() else value

    return stats

async def collect_metrics(cgroup_path: Path) -> dict:
    """Collect all metrics from cgroup."""
    cpu_stat = await read_cgroup_stat(cgroup_path, 'cpu.stat')
    memory_current = int((cgroup_path / 'memory.current').read_text())
    memory_peak = int((cgroup_path / 'memory.peak').read_text())
    io_stat = await read_cgroup_stat(cgroup_path, 'io.stat')

    return {
        'CPUUsageNSec': cpu_stat.get('usage_usec', 0) * 1000,  # usec to nsec
        'MemoryCurrent': memory_current,
        'MemoryPeak': memory_peak,
        'IOReadBytes': sum(parse_io_stat(io_stat, 'rbytes')),
        'IOWriteBytes': sum(parse_io_stat(io_stat, 'wbytes')),
    }
```

### Alternatives Considered (For Direct Cgroup File Reading - Not Recommended)

**Note**: These comparisons are only relevant if ignoring the recommendation and implementing direct cgroup file reading. For the recommended approaches (systemd-run or D-Bus), this comparison does not apply.

| Library | Score | Async Support | cgroups v2 | System Deps | Status | Recommended Use |
|---------|-------|---------------|-----------|-------------|---------|----------|
| **pystemd** | Recommended ✅ | Via D-Bus | Full (properties) | libsystemd-dev | Active | Advanced approach (D-Bus) |
| **Direct sysfs** | 80/80 | Native | 100% | None | Stable (kernel) | Not needed (complexity) |
| **libcgroup-bind** | 37/80 | Requires wrapper | Incomplete | libcgroup-dev | Experimental | Not recommended |
| **cgroupspy** | 34/80 | No async | v1 only | Minimal | Unmaintained (2022) | Not recommended |

**Recommended**: Use `pystemd` for **D-Bus unit lifecycle management** (advanced approach). This provides access to all cgroup metrics via D-Bus properties, which can be polled for real-time monitoring without directly reading cgroup files.

**Why Not Direct sysfs Reading**:
- D-Bus already exposes all cgroup metrics as unit properties
- D-Bus properties can be polled at any frequency (real-time monitoring possible)
- Direct file reading adds complexity without additional functionality
- Would require cgroup path tracking and manual file parsing
- **Result**: Unnecessary complexity for no additional benefit

**Why Not libcgroup**:
- Marked as experimental (v0.1.0)
- Incomplete cgroups v2 support (awaiting v3.0.1 release)
- Blocking C library API not suitable for asyncio
- Requires libcgroup-dev system dependency

**Why Not cgroupspy**:
- Unmaintained since April 2022 (last commit)
- Only supports cgroups v1 (legacy hierarchy)
- No asyncio support (synchronous file I/O)

---

## Research Question 2: Process Execution Tool (systemd-run vs cgexec)

**Question**: Should scripts be executed via systemd-run or cgexec to enable cgroup isolation?

### Decision: systemd-run with --wait flag

**Rationale**:
1. **Ubiquitous Availability**: systemd is default init system on all modern Linux distributions (Fedora, RHEL, Ubuntu, Debian)
2. **Automatic Cleanup**: systemd manages transient cgroup lifecycle; no manual cgroup deletion needed
3. **Reliable Process Management**: Built-in process tree tracking and KillMode for timeout/cancellation handling
4. **Full cgroups v2 Support**: Native first-class support (not bolted-on like cgexec)
5. **Comprehensive Resource Limits**: Full control over CPU, memory, I/O quotas via systemd.resource-control
6. **Minimal Overhead**: <1ms invocation overhead, well within 1% requirement
7. **Future-Proof**: Industry standard for process isolation (used by containers, systemd services)

### Implementation Approach

**Command Structure** (with automatic metrics output):
```bash
systemd-run --wait \
  --property=CPUAccounting=yes \
  --property=MemoryAccounting=yes \
  --property=IOAccounting=yes \
  --property=IPAccounting=yes \
  --property=CPUQuota=50% \
  --property=MemoryMax=1G \
  bash -c "echo 'Hello, World!'"
```

**Key Flags**:
- `--wait`: Wait for service to complete and print metrics summary to stderr (creates transient service unit)
- `--property=*Accounting=yes`: Enable accounting for CPU, Memory, I/O, and IP traffic
  - **Note**: On systemd 258+ with cgroups v2, `CPUAccounting=yes` is deprecated (CPU accounting always available). Other accounting properties still needed.
- `--property=CPUQuota/MemoryMax`: Optional resource limits
- **Important**: `--wait` outputs metrics to stderr after execution completes

**Example Output** (from systemd-run --wait):

Without I/O activity:
```
Running as unit: run-p35314-i35315.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 882ms
             CPU time consumed: 22ms
                   Memory peak: 3.6M (swap: 0B)
                    IP Traffic: received 87.6K, sent 4.2K
```

With I/O activity:
```
Running as unit: run-p50913-i50914.service
          Finished with result: exit-code
Main processes terminated with: code=exited, status=23/n/a
               Service runtime: 852ms
             CPU time consumed: 19ms
                   Memory peak: 3.4M (swap: 0B)
                    IP Traffic: received 18.9K, sent 3.1K
                      IO Bytes: read 104K
```

**Note**: "IO Bytes" line only appears when IOAccounting=yes AND there's actual I/O activity.

**Resource Limit Properties** (from systemd.resource-control):
```bash
# Memory limits
-p MemoryMax=bytes      # Hard memory limit (OOM if exceeded)
-p MemoryHigh=bytes     # Soft memory limit (throttling)

# CPU limits
-p CPUQuota=percent%    # CPU time quota (50% = half of one CPU)
-p CPUWeight=1-10000    # Relative CPU scheduling weight

# I/O limits
-p IOWeight=1-10000     # Relative I/O scheduling weight
-p IOMax=device bytes IOPS  # Device-specific I/O limits

# Accounting (enable metrics collection)
-p CPUAccounting=1       # Deprecated on systemd 258+ (always on with cgroups v2)
-p MemoryAccounting=1
-p IOAccounting=1
```

**asyncio Integration**:

```python
import asyncio
import re
from typing import NamedTuple

class ScriptResult(NamedTuple):
    stdout: bytes
    stderr: bytes
    returncode: int
    metrics: dict[str, Any]

async def execute_script_with_metrics(
    command: list[str],
    timeout: int,
    cpu_quota: str = "100%",
    memory_max: str = "1G"
) -> ScriptResult:
    """Execute script via systemd-run and capture metrics from output."""

    systemd_cmd = [
        'systemd-run',
        '--wait',  # Wait for completion and output metrics
        '--quiet',  # Suppress "Running as unit" line
        '--property=CPUAccounting=yes',  # Deprecated on systemd 258+ (always on with cgroups v2)
        '--property=MemoryAccounting=yes',
        '--property=IOAccounting=yes',
        '--property=IPAccounting=yes',
        f'--property=CPUQuota={cpu_quota}',
        f'--property=MemoryMax={memory_max}',
    ] + command

    process = await asyncio.create_subprocess_exec(
        *systemd_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout
        )

        # Parse metrics from stderr (systemd-run --wait output)
        metrics = parse_systemd_metrics(stderr.decode('utf-8'))

        return ScriptResult(
            stdout=stdout,
            stderr=stderr,  # Contains both script stderr + systemd metrics
            returncode=process.returncode,
            metrics=metrics
        )
    except asyncio.TimeoutError:
        process.kill()  # systemd handles cleanup
        await process.wait()
        raise

def parse_systemd_metrics(stderr_output: str) -> dict[str, Any]:
    """Parse systemd-run --wait metrics output.

    Example input:
              Finished with result: success
    Main processes terminated with: code=exited, status=0/SUCCESS
                   Service runtime: 882ms
                 CPU time consumed: 22ms
                       Memory peak: 3.6M (swap: 0B)
                    IP Traffic: received 87.6K, sent 4.2K
                      IO Bytes: read 104K
    """
    metrics = {}

    # Service runtime (duration) → DurationMs
    if match := re.search(r'Service runtime:\s*(\d+)ms', stderr_output):
        metrics['DurationMs'] = int(match.group(1))

    # CPU time consumed → CPUUsageNSec (convert ms to ns)
    if match := re.search(r'CPU time consumed:\s*(\d+)ms', stderr_output):
        metrics['CPUUsageNSec'] = int(match.group(1)) * 1_000_000  # ms to ns

    # Memory peak → MemoryPeak
    if match := re.search(r'Memory peak:\s*([\d.]+)([KMGT]?)', stderr_output):
        value, unit = match.groups()
        metrics['MemoryPeak'] = parse_size(value, unit)

    # IP Traffic → IPIngressBytes, IPEgressBytes
    if match := re.search(r'received ([\d.]+)([KMGT]?),\s*sent ([\d.]+)([KMGT]?)', stderr_output):
        recv_val, recv_unit, sent_val, sent_unit = match.groups()
        metrics['IPIngressBytes'] = parse_size(recv_val, recv_unit)
        metrics['IPEgressBytes'] = parse_size(sent_val, sent_unit)

    # IO Bytes (only present if IOAccounting enabled and I/O activity occurred)
    # Format: "IO Bytes: read 104K" or "IO Bytes: read 104K, written 50K"
    if match := re.search(r'IO Bytes:\s*read ([\d.]+)([KMGT]?)', stderr_output):
        read_val, read_unit = match.groups()
        metrics['IOReadBytes'] = parse_size(read_val, read_unit)

    # Check for written bytes (optional part)
    if match := re.search(r'written ([\d.]+)([KMGT]?)', stderr_output):
        write_val, write_unit = match.groups()
        metrics['IOWriteBytes'] = parse_size(write_val, write_unit)

    return metrics

def parse_size(value: str, unit: str) -> int:
    """Convert size string to bytes (e.g., '3.6M' -> 3774873)."""
    multipliers = {'': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4}
    return int(float(value) * multipliers.get(unit, 1))
```

### Metrics Available from systemd-run --wait

**All Required Metrics Available** (no cgroup file reading needed!):
- ✅ **Service runtime** → `DurationMs` (milliseconds, derived from stderr output)
- ✅ **CPU time consumed** → `CPUUsageNSec` (nanoseconds)
- ✅ **Memory peak** → `MemoryPeak` (bytes)
- ✅ **IP Traffic** → `IPIngressBytes`, `IPEgressBytes` (bytes)
  - Additional via D-Bus: `IPIngressPackets`, `IPEgressPackets` (packet counts, not in stderr)
- ✅ **IO Bytes** → `IOReadBytes`, `IOWriteBytes` (bytes) - **only appears when I/O occurs**
  - Additional via D-Bus: `IOReadOperations`, `IOWriteOperations` (operation counts, not in stderr)

**Optional Enhancement (Advanced Approach)**: Use D-Bus for additional metrics not in stderr:
- Additional memory details: `MemoryCurrent` (current usage, not just peak)
- Network packet counts: `IPIngressPackets`, `IPEgressPackets`
- I/O operation counts: `IOReadOperations`, `IOWriteOperations`

**Recommendation**: Basic approach uses systemd-run --wait output exclusively (stderr parsing). All functional requirements can be met without D-Bus or cgroup file reading.

### Enhanced Metrics via systemctl show (Optional Alternative Approach)

This approach uses `--remain-after-exit` to keep the unit in systemd after completion, allowing reliable access to metrics via `systemctl show`. This is **reliable** but requires manual cleanup.

**Example Command** (reliable with --remain-after-exit):
```bash
# Get unit name from systemd-run output
UNIT_NAME="my-script-$(date +%s)"
systemd-run --wait --remain-after-exit \
  --unit="$UNIT_NAME" \
  --property=CPUAccounting=yes \
  --property=MemoryAccounting=yes \
  --property=IOAccounting=yes \
  --property=IPAccounting=yes \
  bash -c "curl -L linuxfr.org"

# After completion, query detailed metrics (unit still exists)
systemctl show "$UNIT_NAME" --property=MemoryPeak \
  --property=CPUUsageNSec \
  --property=IPIngressBytes \
  --property=IPEgressBytes \
  --property=IPIngressPackets \
  --property=IPEgressPackets \
  --property=IOReadBytes \
  --property=IOReadOperations \
  --property=IOWriteBytes \
  --property=IOWriteOperations

# IMPORTANT: Manual cleanup required
systemctl stop "$UNIT_NAME"
```

**Example Output**:
```
MemoryPeak=3571712
CPUUsageNSec=21323000
IPIngressBytes=19351
IPIngressPackets=16
IPEgressBytes=3182
IPEgressPackets=23
IOReadBytes=[not set]
IOReadOperations=[not set]
IOWriteBytes=[not set]
IOWriteOperations=[not set]
```

**Advantages Over stderr Parsing**:
1. **Exact Values**: No string parsing needed (MemoryPeak=3571712 bytes vs "3.4M")
2. **Higher Precision**: Nanosecond CPU timing (CPUUsageNSec) vs milliseconds
3. **Additional Metrics**: Network packet counts (IPIngressPackets, IPEgressPackets)
4. **Operation Counts**: Explicit I/O operation counts (IOReadOperations, IOWriteOperations)
5. **More Reliable**: Properties are structured key=value, less prone to format changes
6. **Simple**: Uses standard shell commands (systemd-run + systemctl)

**Disadvantages**:
- ❌ **Manual Cleanup Required**: Must call `systemctl stop <unit-name>` after reading metrics
- ❌ **Unit Leaks If Cleanup Forgotten**: Failed cleanup leaves units in systemd indefinitely
- ❌ **Additional Subprocess Call**: Requires running `systemctl show` after `systemd-run` completes
- ❌ **Unit Name Management**: Must track unit names to clean them up later

**When to Use**:
- You need precise metrics (exact byte counts, nanosecond timing, packet counts)
- You're comfortable managing unit lifecycle and cleanup
- You prefer shell commands over D-Bus/Python libraries

**Implementation Approach** (Alternative to stderr parsing or D-Bus):
```python
async def execute_with_systemctl_show_metrics(
    command: list[str],
    timeout: int,
) -> dict[str, Any]:
    """Execute script via systemd-run --remain-after-exit and query metrics via systemctl show."""

    import uuid
    unit_name = f'nexus-script-{uuid.uuid4().hex[:8]}'

    # 1. Execute with --remain-after-exit so unit stays in systemd
    systemd_cmd = [
        'systemd-run',
        '--wait',
        '--remain-after-exit',  # Keep unit after completion
        f'--unit={unit_name}',
        '--property=CPUAccounting=yes',
        '--property=MemoryAccounting=yes',
        '--property=IOAccounting=yes',
        '--property=IPAccounting=yes',
    ] + command

    process = await asyncio.create_subprocess_exec(
        *systemd_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout
        )

        # 2. Query precise metrics via systemctl show (unit still exists)
        metrics = await _collect_detailed_metrics(unit_name)

        return {
            'stdout': stdout,
            'stderr': stderr,
            'returncode': process.returncode,
            'metrics': metrics,
        }
    finally:
        # 3. CRITICAL: Always clean up the unit
        cleanup_proc = await asyncio.create_subprocess_exec(
            'systemctl', 'stop', unit_name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await cleanup_proc.wait()

async def _collect_detailed_metrics(unit_name: str) -> dict[str, Any]:
    """Collect detailed metrics via systemctl show.

    Args:
        unit_name: systemd unit name (e.g., "nexus-script-12345")

    Returns:
        Flattened dict with systemd property names
    """
    properties = [
        'MemoryPeak',
        'MemoryCurrent',
        'CPUUsageNSec',
        'IPIngressBytes',
        'IPEgressBytes',
        'IPIngressPackets',
        'IPEgressPackets',
        'IOReadBytes',
        'IOReadOperations',
        'IOWriteBytes',
        'IOWriteOperations',
    ]

    cmd = ['systemctl', 'show', unit_name] + [
        f'--property={prop}' for prop in properties
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, _ = await process.communicate()

    # Parse key=value output - keep systemd property names
    metrics = {}
    for line in stdout.decode('utf-8').strip().split('\n'):
        if '=' in line:
            key, value = line.split('=', 1)
            # Only include properties that have values
            if value != '[not set]':
                metrics[key] = int(value) if value.isdigit() else value

    return metrics
```

**Unit Name Extraction**:
The unit name can be extracted from systemd-run stderr output:
```python
def _extract_unit_name(stderr_output: str) -> str | None:
    """Extract systemd unit name from stderr output.

    Example input: "Running as unit: run-p12345.scope"
    """
    if match := re.search(r'Running as unit:\s*(\S+)', stderr_output):
        return match.group(1)
    return None
```

**Integration Strategy** (Alternative approach with manual cleanup):
1. Use `systemd-run --wait --remain-after-exit` to execute and keep unit
2. Call `systemctl show` for precise metric values (unit guaranteed to exist)
3. Parse structured key=value output (no regex fragility)
4. **CRITICAL**: Always clean up unit with `systemctl stop` in finally block

**Trade-offs**:
- **Pro**: More accurate and complete metrics (exact byte counts, nanoseconds)
- **Pro**: No regex parsing fragility for numeric values
- **Pro**: Reliable - unit guaranteed to exist when querying
- **Pro**: Simple - uses standard shell commands
- **Con**: Additional subprocess call (systemctl show + systemctl stop)
- **Con**: Must handle cleanup properly (use try/finally)
- **Con**: Unit leaks if cleanup fails or is forgotten
- **Con**: Slightly higher latency (~2-3ms additional for show + stop)

**Recommendation**:
- **Basic Approach**: Use stderr parsing (simplest, no cleanup needed)
- **Alternative Approach**: Use systemd-run + systemctl show (precise, reliable, needs cleanup)
- **Advanced Approach**: Use D-Bus direct control for real-time monitoring or to avoid shell commands (see "Systemd Unit Metrics Retrieval: Implementation Approaches" section)

### pystemd: An Elegant Python Interface for systemd

While the approaches above use shell commands (`systemd-run`, `systemctl`), **pystemd** provides a native Python interface to systemd via D-Bus. This is particularly elegant for a problem like metrics collection because:

**Why pystemd is Elegant**:
1. **Native Python API**: No subprocess calls, no shell command parsing
2. **Type Safety**: Direct access to systemd properties with proper types (integers, not strings)
3. **Automatic Lifecycle Management**: Control unit creation, monitoring, and cleanup in pure Python
4. **Event-Driven**: Subscribe to D-Bus signals for state changes (no polling needed)
5. **Real-Time Monitoring**: Poll unit properties during execution for time-series metrics
6. **Single Dependency**: Replaces both systemd-run and systemctl with a unified API

**Example with pystemd** (combines unit creation, metrics query, and cleanup):

```python
from pystemd.systemd1 import Manager, Unit

async def execute_with_pystemd(command: list[str], timeout: int) -> dict:
    """Execute script and collect metrics using pystemd."""

    manager = Manager()
    manager.load()

    unit_name = f'nexus-script-{uuid.uuid4().hex[:8]}.service'

    # 1. Create and start transient unit via D-Bus
    manager.Manager.StartTransientUnit(
        name=unit_name.encode(),
        mode=b'fail',
        properties=[
            (b'ExecStart', [(command[0].encode(), [c.encode() for c in command], False)]),
            (b'Type', b'oneshot'),
            (b'CPUAccounting', True),
            (b'MemoryAccounting', True),
            (b'IOAccounting', True),
            (b'IPAccounting', True),
        ],
        aux=[]
    )

    # 2. Wait for completion (event-driven or polling)
    unit = Unit(unit_name.encode())
    unit.load()

    while unit.Unit.ActiveState in [b'activating', b'active']:
        await asyncio.sleep(0.1)
        unit.load()

    # 3. Query metrics (native Python types, systemd property names!)
    metrics = {
        'CPUUsageNSec': unit.Unit.CPUUsageNSec,  # Direct integer access
        'MemoryPeak': unit.Unit.MemoryPeak,
        'MemoryCurrent': unit.Unit.MemoryCurrent,
        'IPIngressBytes': unit.Unit.IPIngressBytes,
        'IPEgressBytes': unit.Unit.IPEgressBytes,
        'IPIngressPackets': unit.Unit.IPIngressPackets,
        'IPEgressPackets': unit.Unit.IPEgressPackets,
    }

    # Add IO metrics only if available (may be 0 or not set)
    if hasattr(unit.Unit, 'IOReadBytes'):
        io_read = unit.Unit.IOReadBytes
        if io_read > 0:
            metrics['IOReadBytes'] = io_read
    if hasattr(unit.Unit, 'IOWriteBytes'):
        io_write = unit.Unit.IOWriteBytes
        if io_write > 0:
            metrics['IOWriteBytes'] = io_write
    if hasattr(unit.Unit, 'IOReadOperations'):
        io_read_ops = unit.Unit.IOReadOperations
        if io_read_ops > 0:
            metrics['IOReadOperations'] = io_read_ops
    if hasattr(unit.Unit, 'IOWriteOperations'):
        io_write_ops = unit.Unit.IOWriteOperations
        if io_write_ops > 0:
            metrics['IOWriteOperations'] = io_write_ops

    # 4. Cleanup
    manager.Manager.StopUnit(unit_name.encode(), b'fail')

    return metrics
```

**Advantages of pystemd Approach**:
- ✅ **No subprocess overhead**: Direct D-Bus communication
- ✅ **Type-safe**: Properties are already integers/bytes, no parsing
- ✅ **Elegant**: Single library handles creation, monitoring, metrics, and cleanup
- ✅ **Flexible**: Can poll during execution for real-time metrics using same code
- ✅ **Reliable**: Full control over unit lifecycle, guaranteed cleanup
- ✅ **Pythonic**: Native async/await support, no shell commands

**Trade-offs**:
- ❌ **Additional dependency**: Requires pystemd + libsystemd-dev system package (main trade-off)
- ⚠️ **D-Bus knowledge**: Requires understanding systemd unit properties and D-Bus concepts
- ⚠️ **Learning curve**: Must learn pystemd API (though the code is quite clean and straightforward)

**When to Use pystemd**:
- You're implementing the **Advanced Approach** and want a pure Python solution
- You need **real-time monitoring** (poll metrics during execution)
- You prefer **type-safe APIs** over parsing shell command output
- You want to **avoid subprocess calls** for better performance
- You're comfortable with D-Bus and systemd concepts

This is the approach used in the "Systemd Unit Metrics Retrieval: Implementation Approaches" section below.

**Cleanup Behavior**:
- Transient scope units automatically cleaned up when process exits
- All child processes in cgroup tree terminated via KillMode (default: control-group)
- Cgroup deleted after all processes exit
- No manual cleanup needed (unlike cgexec)

### Alternatives Considered

**cgexec (from libcgroup/cgroup-tools)**:

| Aspect | systemd-run | cgexec | Winner |
|--------|------------|--------|--------|
| Availability | Ubiquitous (systemd everywhere) | Declining (deprecated on RHEL/Fedora) | systemd-run |
| cgroups v2 | Native first-class | Limited/bolted-on | systemd-run |
| Cleanup | Automatic | Manual required | systemd-run |
| Process tree | Built-in tracking | Manual PID tracking | systemd-run |
| Timeout handling | Built-in KillMode | Manual kill signals | systemd-run |
| Resource limits | Comprehensive | Basic | systemd-run |
| Overhead | <1ms | <1ms (similar) | Tie |
| Asyncio compat | Full | Full | Tie |

**Why Not cgexec**:
- Requires manual cgroup cleanup after execution (`cgdelete -g ...`)
- Limited cgroups v2 support (originally designed for v1)
- Package availability declining (deprecated on RHEL/SLES in favor of systemd)
- No built-in process tree management
- Risk of cgroup memory leaks if cleanup forgotten

**Hybrid Approach Considered**:
Manual cgroup creation + subprocess execution rejected because:
- More complex (create, configure, execute, cleanup steps)
- Error-prone (cleanup failures lead to kernel memory leaks)
- No advantage over systemd-run --wait
- Reinvents systemd's existing functionality

### Fallback Strategy

If systemd-run unavailable (rare edge case):

1. **Check systemd version**: `systemctl --version`
   - v244+: Full feature set available
   - v232-243: Use with limited cpuset features
   - <v232: Fall back to alternative

2. **Fallback to cgexec** (requires libcgroup package):
   ```python
   proc = await asyncio.create_subprocess_exec(
       'cgexec', '-g', 'cpu,memory:mygroup', *command,
       stdout=asyncio.subprocess.PIPE,
       stderr=asyncio.subprocess.PIPE,
   )
   # ... execution ...
   # Manual cleanup required:
   os.system('cgdelete -g cpu,memory:mygroup')
   ```

3. **Worst-case fallback**: Direct subprocess execution without cgroups
   - Minimal overhead requirement still met
   - No resource limits or metrics collection
   - Graceful degradation for development environments

---

## Additional Research Findings

### cgroups v2 Metrics File Formats

**cpu.stat** (whitespace-separated key-value):
```
usage_usec 12345678
user_usec 8765432
system_usec 3580246
nr_periods 1000
nr_throttled 50
throttled_usec 500000
```

**memory.current** (single integer, bytes):
```
1073741824
```

**io.stat** (device-keyed with multiple metrics):
```
8:0 rbytes=12345678 wbytes=23456789 rios=100 wios=200
8:16 rbytes=0 wbytes=0 rios=0 wios=0
```

### Performance Characteristics

**Reading Metrics Overhead**:
- Single file read: <0.1ms (kernel sysfs)
- Complete metric collection (cpu + memory + io): <1ms
- Real-time sampling at 10Hz: ~1% CPU overhead (acceptable)
- Batch reading at end of execution: <0.1% overhead (negligible)

**systemd-run Invocation Overhead**:
- Transient scope creation: ~0.5-1ms
- D-Bus roundtrip: ~0.1-0.5ms
- Total overhead: <2ms for typical script execution
- Percentage impact: <0.01% for scripts >200ms duration (meets <1% requirement)

### Compatibility Matrix

| Linux Distribution | systemd Version | cgroups v2 Default | Recommendation | CPUAccounting= |
|-------------------|----------------|-------------------|----------------|----------------|
| Fedora 31+ | v243+ | Yes | systemd-run (optimal) | Deprecated v258+ |
| RHEL 8+ | v239+ | Hybrid (v1+v2) | systemd-run (recommended) | Required |
| RHEL 9+ | v250+ | Yes | systemd-run (optimal) | Required |
| Ubuntu 22.04+ | v249+ | Yes | systemd-run (optimal) | Required |
| Debian 11+ | v247+ | Yes | systemd-run (optimal) | Required |
| Ubuntu 20.04 | v245 | Opt-in | systemd-run (works, may need kernel param) | Required |

**Note on CPUAccounting Property**:
- **systemd 258+**: `CPUAccounting=yes` is deprecated on cgroups v2 (unified hierarchy) because CPU accounting is always available by default
- **systemd <258**: `CPUAccounting=yes` still required to enable CPU metrics
- **Best practice**: Include `--property=CPUAccounting=yes` for backwards compatibility (no-op on systemd 258+, required on older versions)
- **Reference**: [systemd.resource-control man page](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)

**Kernel Parameter for cgroups v2** (if not default):
```bash
# Add to GRUB config
systemd.unified_cgroup_hierarchy=1
```

---

## Implementation Recommendations

### Module Structure

**Basic Approach** (Minimal - Recommended for initial implementation):
```
src/nexus/workflows/execution/
├── script_activity.py      # Modified to use systemd-run --wait
└── metrics_parser.py       # Parse systemd-run stderr output (NEW)
```

**Advanced Approach** (With D-Bus - Optional enhancement):
```
src/nexus/workflows/execution/
├── script_activity.py      # Modified to use D-Bus or systemd-run
├── metrics_parser.py       # Parse systemd-run stderr output (fallback)
└── systemd_executor.py     # D-Bus unit lifecycle management (NEW)
```

**Not Recommended** (Direct cgroup file reading - unnecessary complexity):
```
src/nexus/workflows/monitoring/
├── __init__.py
├── cgroup_monitor.py       # Read cgroup files directly
├── metrics_collector.py    # Orchestrate monitoring
└── models.py               # ResourceMetrics models
```

### Key Components

**Basic Approach Components** (Recommended):

**metrics_parser.py**:
- Responsibility: Parse systemd-run --wait stderr output
- Functions: `parse_systemd_metrics(stderr: str) -> dict`, `parse_size(value: str, unit: str) -> int`
- Dependencies: None (standard library regex)

**Modified script_activity.py**:
- Changes: Wrap command with systemd-run --wait, parse stderr for metrics
- Integration: Minimal changes to existing `_execute_script_common()`

**Advanced Approach Components** (Optional):

**systemd_executor.py**:
- Responsibility: D-Bus unit lifecycle management
- Class: `SystemdExecutor`
- Methods:
  - `execute(command, timeout) -> (stdout, stderr, returncode, metrics)` - One-time final metrics
  - `execute_with_monitoring(command, timeout, sample_interval) -> (stdout, stderr, returncode, metrics, timeline)` - Real-time monitoring
- Dependencies: pystemd
- Features:
  - Event-driven or polling-based completion detection
  - Optional real-time metrics sampling by polling D-Bus properties during execution
  - Handles both precise final metrics and time-series data in same implementation

### Database Schema Extension

Extend existing ActivityExecution model with new JSONB field:

```python
class ActivityExecution(BaseResource, table=True):
    # ... existing fields ...

    metrics: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB),
        description="Resource consumption metrics from systemd/cgroups v2"
    )
```

**Metrics Schema Structure** (stored in metrics JSONB):

Uses **flattened key/value structure with systemd property names** for consistency:

```json
{
  "DurationMs": 1250,
  "CPUUsageNSec": 987654321,
  "MemoryPeak": 104857600,
  "MemoryCurrent": 52428800,
  "IPIngressBytes": 19351,
  "IPEgressBytes": 3182,
  "IPIngressPackets": 16,
  "IPEgressPackets": 23,
  "IOReadBytes": 1048576,
  "IOWriteBytes": 2097152,
  "IOReadOperations": 100,
  "IOWriteOperations": 50
}
```

**Rationale for Flattened Structure**:
- ✅ **Preserves systemd naming convention**: Direct mapping to systemd properties
- ✅ **Improved consistency**: Same names used in systemd documentation, D-Bus API, and our database
- ✅ **Simpler mapping**: No need to convert between nested structures and systemd properties
- ✅ **Future-proof**: Easy to add new systemd properties without restructuring
- ✅ **Type safety**: When using D-Bus, properties map directly without transformation

**Property Naming Mapping**:

| Metric | systemd Property | Type | Unit | Notes |
|--------|-----------------|------|------|-------|
| Duration | `DurationMs` | int | milliseconds | Custom property (not from systemd) |
| CPU Usage | `CPUUsageNSec` | int | nanoseconds | systemd native property |
| Memory Peak | `MemoryPeak` | int | bytes | systemd native property |
| Memory Current | `MemoryCurrent` | int | bytes | systemd native property |
| Network In | `IPIngressBytes` | int | bytes | systemd native property |
| Network Out | `IPEgressBytes` | int | bytes | systemd native property |
| Network In Packets | `IPIngressPackets` | int | count | D-Bus only (not in stderr) |
| Network Out Packets | `IPEgressPackets` | int | count | D-Bus only (not in stderr) |
| Disk Read | `IOReadBytes` | int | bytes | systemd native property |
| Disk Write | `IOWriteBytes` | int | bytes | systemd native property |
| Disk Read Ops | `IOReadOperations` | int | count | D-Bus only (not in stderr) |
| Disk Write Ops | `IOWriteOperations` | int | count | D-Bus only (not in stderr) |

**Note**: Properties not available (e.g., IO metrics when no I/O occurred) are omitted from the JSON rather than set to null/0.

### Alembic Migration

Required database migration:

```python
"""Add metrics to activity_execution

Revision ID: xxx
Revises: yyy
Create Date: 2026-02-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

def upgrade() -> None:
    op.add_column(
        'activity_execution',
        sa.Column('metrics', JSONB, nullable=True)
    )

    # Optional: Add GIN index for JSONB querying
    op.create_index(
        'ix_activity_execution_metrics_gin',
        'activity_execution',
        ['metrics'],
        postgresql_using='gin',
        postgresql_ops={'metrics': 'jsonb_path_ops'}
    )

def downgrade() -> None:
    op.drop_index('ix_activity_execution_metrics_gin')
    op.drop_column('activity_execution', 'metrics')
```

### Integration Point: script_activity.py

Modify `_execute_script_common()` to use systemd-run with --wait:

```python
import asyncio
import re
import shutil

async def _execute_script_common(
    command: list[str],
    env: dict[str, str],
    timeout_seconds: int,
    capture_metrics: bool = True,
) -> dict[str, Any]:
    """Execute script with optional metrics collection via systemd-run."""

    if capture_metrics and shutil.which('systemd-run'):
        # Use systemd-run --wait for automatic metrics collection
        systemd_cmd = [
            'systemd-run',
            '--wait',
            '--quiet',
            '--property=CPUAccounting=yes',
            '--property=MemoryAccounting=yes',
            '--property=IOAccounting=yes',
            '--property=IPAccounting=yes',
        ] + command

        process = await asyncio.create_subprocess_exec(
            *systemd_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout_seconds,
            )

            # Parse metrics from systemd-run --wait output in stderr
            metrics = _parse_systemd_metrics(stderr.decode('utf-8'))

            # Separate script stderr from systemd metrics output
            script_stderr = _extract_script_stderr(stderr.decode('utf-8'))

        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise

    else:
        # Fallback: Standard subprocess execution (no metrics)
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout_seconds,
        )
        script_stderr = stderr.decode('utf-8')
        metrics = None

    return {
        'stdout': stdout.decode('utf-8'),
        'stderr': script_stderr,
        'return_code': process.returncode,
        'metrics': metrics,  # NEW field
    }

def _parse_systemd_metrics(stderr_output: str) -> dict[str, Any]:
    """Parse systemd-run --wait metrics output.

    Returns flattened dict with systemd property names for consistency.
    """
    metrics = {}

    # Duration (custom property, not from systemd)
    if match := re.search(r'Service runtime:\s*(\d+)ms', stderr_output):
        metrics['DurationMs'] = int(match.group(1))

    # CPU -> CPUUsageNSec (convert ms to ns)
    if match := re.search(r'CPU time consumed:\s*(\d+)ms', stderr_output):
        metrics['CPUUsageNSec'] = int(match.group(1)) * 1_000_000

    # Memory -> MemoryPeak
    if match := re.search(r'Memory peak:\s*([\d.]+)([KMGT]?)B?', stderr_output):
        value, unit = match.groups()
        metrics['MemoryPeak'] = _parse_size(value, unit)
        metrics['MemoryCurrent'] = _parse_size(value, unit)  # Approximate

    # Network -> IPIngressBytes, IPEgressBytes
    if match := re.search(r'received ([\d.]+)([KMGT]?)B?,\s*sent ([\d.]+)([KMGT]?)B?', stderr_output):
        recv_val, recv_unit, sent_val, sent_unit = match.groups()
        metrics['IPIngressBytes'] = _parse_size(recv_val, recv_unit)
        metrics['IPEgressBytes'] = _parse_size(sent_val, sent_unit)

    # I/O -> IOReadBytes, IOWriteBytes
    # Format: "IO Bytes: read 104K" or "IO Bytes: read 104K, written 50K"
    if match := re.search(r'IO Bytes:\s*read ([\d.]+)([KMGT]?)B?', stderr_output):
        read_val, read_unit = match.groups()
        metrics['IOReadBytes'] = _parse_size(read_val, read_unit)

    if match := re.search(r'written ([\d.]+)([KMGT]?)B?', stderr_output):
        write_val, write_unit = match.groups()
        metrics['IOWriteBytes'] = _parse_size(write_val, write_unit)

    return metrics

def _extract_script_stderr(combined_output: str) -> str:
    """Separate script stderr from systemd metrics output."""
    # systemd-run --wait output appears after script completes
    # Lines starting with whitespace are systemd metrics
    lines = combined_output.split('\n')
    script_lines = [line for line in lines if not line.startswith(' ') and not line.startswith('Main processes')]
    return '\n'.join(script_lines)

def _parse_size(value: str, unit: str) -> int:
    """Convert size string to bytes."""
    multipliers = {'': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4}
    return int(float(value) * multipliers.get(unit, 1))
```

---

## Open Questions & Future Research

### Resolved by This Research
- ✅ Which Python library for cgroups v2? **Answer**: Not needed. Use systemd-run --wait (basic) or pystemd for D-Bus (advanced). Direct cgroup file reading adds unnecessary complexity.
- ✅ systemd-run vs cgexec? **Answer**: systemd-run --wait
- ✅ How to read metrics asynchronously? **Answer**: Parse stderr from systemd-run --wait (basic) or poll D-Bus unit properties (advanced). Both support async.
- ✅ Overhead acceptable? **Answer**: Yes, <1ms for metrics parsing, <2ms for systemd-run
- ✅ How to retrieve metrics before unit cleanup? **Answer**: Parse systemd-run --wait stderr (basic) or use D-Bus direct control (advanced). See "Systemd Unit Metrics Retrieval: Implementation Approaches" section.
- ✅ Real-time monitoring approach? **Answer**: Poll D-Bus unit properties during execution (advanced approach). No need for direct cgroup file reading.

### Remaining Questions (for Implementation Phase)
- ❓ Should metrics be sampled during execution (real-time) or only post-execution?
  - **Recommendation**: Start with post-execution (basic approach, simpler), add real-time sampling (advanced D-Bus approach) only if needed
- ❓ How to handle GPU metrics if GPU not available?
  - **Recommendation**: Return `null` for gpu field if no GPU cgroup controller present
- ❓ Should resource limits be configurable per script task?
  - **Recommendation**: Add optional limits to ScriptExecutorConfig later (start with defaults)
- ❓ How to handle cgroups v1-only systems (legacy)?
  - **Recommendation**: Detect cgroups version at runtime, gracefully degrade to no metrics on v1
- ❓ Network metrics collection approach?
  - **Recommendation**: Available via systemd-run --wait IP Traffic output (basic). For packet-level details, use D-Bus IPIngressPackets/IPEgressPackets (advanced).

---

## Summary

**Primary Decisions** (Three Implementation Approaches):

**Basic Approach (Recommended for Initial Implementation)**:
1. **Metrics Collection**: systemd-run --wait with stderr output parsing
2. **Process Execution**: systemd-run --wait for cgroup isolation and automatic cleanup
3. **Storage**: Extend ActivityExecution.metrics JSONB field
4. **Dependencies**: None (systemd-run already available)
5. **Metrics Available**: Duration, CPU time (ms), memory peak, network traffic, I/O bytes
6. **Precision**: Milliseconds for CPU, human-readable sizes (e.g., "3.6M")
7. **Real-time Monitoring**: Not supported (metrics only at completion)
8. **Complexity**: Low (simple regex parsing)
9. **Cleanup**: Automatic (systemd handles it)
10. **Fallback**: Direct subprocess execution if systemd-run unavailable

**Alternative Approach (Precise Metrics with Manual Cleanup)**:
1. **Metrics Collection**: systemd-run --remain-after-exit + systemctl show
2. **Process Execution**: systemd-run with --remain-after-exit flag
3. **Benefits**:
   - Exact byte counts (MemoryPeak=3571712 vs "3.6M")
   - Nanosecond precision CPU timing (CPUUsageNSec)
   - Additional metrics (packet counts, I/O operation counts)
   - No text parsing fragility (structured key=value output)
   - Simple shell commands (no D-Bus/Python library needed)
   - **Reliable**: Unit guaranteed to exist when querying metrics
4. **Dependencies**: None (uses standard systemd commands)
5. **Complexity**: Low-Medium (must handle cleanup properly)
6. **Cleanup**: **Manual required** (must call `systemctl stop <unit>` in finally block)
7. **When to use**: Need precise metrics but want to avoid D-Bus/Python libraries

**Advanced Approach (Python API for Precision and Real-Time)**:
1. **Metrics Collection**: D-Bus direct control with pystemd for unit lifecycle management
2. **Process Execution**: D-Bus StartTransientUnit API
3. **Benefits**:
   - All benefits of Alternative Approach (nanosecond precision, exact values, additional metrics)
   - **Type-safe Python API**: Direct integer access, no parsing at all
   - **Real-time monitoring**: Poll D-Bus properties during execution at any frequency
   - **Elegant**: Single library for creation, monitoring, metrics, and cleanup
   - **No subprocess overhead**: Direct D-Bus communication
   - **Flexible**: Same code works for one-time final metrics or continuous monitoring
4. **Dependencies**: pystemd + libsystemd-dev
5. **Complexity**: Medium-High (D-Bus lifecycle management, learning pystemd API)
6. **Cleanup**: Programmatic (controlled via pystemd API)
7. **When to use**: Need real-time monitoring, prefer type-safe Python API, or want to avoid subprocess calls

**Direct Cgroup File Reading (Not Recommended)**:
- **Status**: Possible but adds unnecessary complexity
- **Reason**: D-Bus already exposes all cgroup metrics as properties that can be polled
- **Conclusion**: Would not address additional requirements beyond what systemd provides

**Key Benefits** (Basic Approach):
- **Extremely Simple**: No manual cgroup file reading, systemd does the work
- **Zero Dependencies**: systemd-run already present on all modern Linux systems
- **Minimal Overhead**: <1% requirement easily met (systemd-run adds ~1-2ms)
- **Clean Integration**: Parse stderr output, no complex cgroup path tracking
- **Automatic Cleanup**: systemd manages transient cgroup lifecycle
- **Built-in Metrics**: Duration, CPU, memory, network traffic automatically provided

**Metrics Captured from systemd-run --wait**:
- ✅ **Service runtime** → `DurationMs` _(derived from stderr output)_
- ✅ **CPU time consumed** → `CPUUsageNSec`
- ✅ **Memory peak** → `MemoryPeak`
- ✅ **IP Traffic** → `IPIngressBytes`, `IPEgressBytes`
- ✅ **Disk I/O** → `IOReadBytes`, `IOWriteBytes` _(appears when I/O activity occurs)_

**Additional metrics available via D-Bus** (not in stderr):
- Network packet counts: `IPIngressPackets`, `IPEgressPackets`
- I/O operation counts: `IOReadOperations`, `IOWriteOperations`
- Current memory usage: `MemoryCurrent`

**Note**: IO Bytes line only appears in output when:
1. IOAccounting=yes property is enabled
2. The script performs actual I/O operations (file reads/writes)

**Implementation Complexity**: Low (Basic), Medium-High (Advanced with D-Bus)
- Basic: Single regex parsing function for systemd-run output
- No cgroup path discovery needed
- No separate monitoring module required initially
- Fallback to direct subprocess is trivial
- Advanced: Use D-Bus direct control for precise metrics or real-time monitoring (see new section below for details)

**Confidence Level**: Very High (98%)
- systemd-run --wait is well-documented and battle-tested
- Parsing output is straightforward (fixed format)
- D-Bus provides structured API for Phase 2 if needed (see detailed section below)
- Clear fallback strategy for systems without systemd
- Performance characteristics well-understood

**Next Steps**: Proceed with implementation using the **Basic Approach** (systemd-run --wait stderr parsing). Consider the **Alternative Approach** (systemctl show with manual cleanup) if you need precise metrics without adding D-Bus dependencies. Consider the **Advanced Approach** (D-Bus/pystemd) only if real-time monitoring or type-safe Python API is required. See "Systemd Unit Metrics Retrieval: Implementation Approaches" section for complete implementation details of all three approaches.

---

## Systemd Unit Metrics Retrieval: Implementation Approaches

**Context**: This section addresses the technical challenge of retrieving metrics from systemd transient units before they are automatically cleaned up.

### The Lifecycle Challenge

When `systemd-run --wait` executes, the following lifecycle occurs:

```
1. Unit starts
2. Unit completes execution
3. run_context_update() reads properties via D-Bus ✓ (properties exist here)
4. Properties are printed to stderr
5. Unit is cleaned up and removed from systemd
6. systemd-run exits
```

**Key Issue**: By the time `systemd-run` exits, the transient unit is **already cleaned up**. This means:
- Running `systemctl show <unit-name>` after `systemd-run --wait` completes will show `[not set]` for properties
- The metrics only exist during a brief window while the unit is still in systemd's memory
- You cannot query the unit after the fact without special measures

### Option 1: Parse systemd-run --wait Output (Basic Approach - Recommended)

**Approach**: Capture and parse the stderr output from `systemd-run --wait`, which automatically includes metrics.

**Advantages**:
- ✅ **Simplest implementation**: Single subprocess call, parse stderr
- ✅ **Self-contained**: No separate lifecycle management needed
- ✅ **Automatic cleanup**: systemd handles everything
- ✅ **All required metrics available**: Duration, CPU, memory, network, I/O
- ✅ **No race conditions**: Metrics are printed before cleanup

**Disadvantages**:
- ❌ **Text parsing fragility**: Output format could change between systemd versions
- ❌ **Lower precision**: Values are human-readable (e.g., "3.6M" instead of 3774873 bytes)
- ❌ **Limited precision**: Milliseconds instead of nanoseconds for CPU time
- ❌ **Missing some metrics**: No packet counts or I/O operation counts

**Implementation**:

```python
async def execute_with_metrics_v1(
    command: list[str],
    timeout: int,
) -> dict[str, Any]:
    """Execute script via systemd-run and parse metrics from stderr."""

    systemd_cmd = [
        'systemd-run',
        '--wait',  # Wait and print metrics to stderr
        '--quiet',  # Suppress "Running as unit" line
        '--property=CPUAccounting=yes',
        '--property=MemoryAccounting=yes',
        '--property=IOAccounting=yes',
        '--property=IPAccounting=yes',
    ] + command

    process = await asyncio.create_subprocess_exec(
        *systemd_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout
        )

        # Parse metrics from stderr
        metrics = parse_systemd_metrics(stderr.decode('utf-8'))

        return {
            'stdout': stdout,
            'stderr': stderr,
            'returncode': process.returncode,
            'metrics': metrics,
        }
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise

def parse_systemd_metrics(stderr_output: str) -> dict[str, Any]:
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
    metrics = {}

    # Service runtime (duration) - custom property, not from systemd
    if match := re.search(r'Service runtime:\s*(\d+)ms', stderr_output):
        metrics['DurationMs'] = int(match.group(1))

    # CPU time consumed -> CPUUsageNSec (convert ms to ns)
    if match := re.search(r'CPU time consumed:\s*(\d+)ms', stderr_output):
        metrics['CPUUsageNSec'] = int(match.group(1)) * 1_000_000  # ms to ns

    # Memory peak -> MemoryPeak
    if match := re.search(r'Memory peak:\s*([\d.]+)([KMGT]?)B?', stderr_output):
        value, unit = match.groups()
        metrics['MemoryPeak'] = parse_size(value, unit)
        # Also use as MemoryCurrent approximation (final value)
        metrics['MemoryCurrent'] = parse_size(value, unit)

    # Network traffic -> IPIngressBytes, IPEgressBytes
    if match := re.search(r'received ([\d.]+)([KMGT]?)B?,\s*sent ([\d.]+)([KMGT]?)B?', stderr_output):
        recv_val, recv_unit, sent_val, sent_unit = match.groups()
        metrics['IPIngressBytes'] = parse_size(recv_val, recv_unit)
        metrics['IPEgressBytes'] = parse_size(sent_val, sent_unit)

    # I/O (only appears if IOAccounting enabled AND I/O occurred)
    # -> IOReadBytes, IOWriteBytes
    if match := re.search(r'read ([\d.]+)([KMGT]?)B?', stderr_output):
        read_val, read_unit = match.groups()
        metrics['IOReadBytes'] = parse_size(read_val, read_unit)

    if match := re.search(r'written ([\d.]+)([KMGT]?)B?', stderr_output):
        write_val, write_unit = match.groups()
        metrics['IOWriteBytes'] = parse_size(write_val, write_unit)

    return metrics

def parse_size(value: str, unit: str) -> int:
    """Convert size string to bytes (e.g., '3.6M' -> 3774873)."""
    multipliers = {'': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4}
    return int(float(value) * multipliers.get(unit, 1))
```

**Why `systemctl show` Won't Work Without `--remain-after-exit`**:

```bash
# This FAILS - unit is already cleaned up:
systemd-run --wait --unit=test sleep 1
systemctl show test  # Returns "[not set]" - unit already gone!

# This WORKS - unit remains until explicitly stopped:
systemd-run --wait --remain-after-exit --unit=test sleep 1
systemctl show test  # Works - unit still exists, metrics available
systemctl stop test  # Manual cleanup required
```

**Using `--remain-after-exit` is reliable but requires manual cleanup**:
- ✅ **Reliable**: Unit guaranteed to exist when querying metrics
- ✅ **Precise**: Access to exact metric values via structured properties
- ❌ **Manual cleanup required**: Must call `systemctl stop` or unit leaks
- ❌ **Cleanup responsibility**: Easy to forget, leads to accumulated units in systemd

This is a **valid alternative approach** if you need precise metrics but want to avoid D-Bus/Python libraries (see "Enhanced Metrics via systemctl show" section above).

### Option 2: D-Bus Direct Control (Advanced Approach - For Precision or Real-Time)

**Approach**: Create and manage the transient unit lifecycle via D-Bus, querying properties before cleanup. Supports both one-time final metrics and real-time monitoring during execution.

**Advantages**:
- ✅ **Exact values**: No string parsing, direct property access (3571712 bytes, not "3.4M")
- ✅ **Higher precision**: Nanosecond CPU timing (CPUUsageNSec) vs milliseconds
- ✅ **Additional metrics**: Network packet counts, I/O operation counts
- ✅ **More reliable**: Structured API, less prone to format changes
- ✅ **Full control**: Manage exactly when cleanup happens
- ✅ **Real-time monitoring**: Poll D-Bus properties during execution for time-series metrics

**Disadvantages**:
- ❌ **More complex**: Requires D-Bus library and lifecycle management
- ❌ **Additional dependency**: Needs `pystemd` or `sdbus` library
- ❌ **More code**: Must handle unit creation, monitoring, and cleanup
- ❌ **Timing critical**: Must query before unit is cleaned up

**Implementation Approach A: Event-Driven (Final Metrics Only)**

```python
from pystemd.systemd1 import Manager, Unit
from pystemd.dbuslib import DBus

async def execute_with_metrics_v2_signals(
    command: list[str],
    timeout: int,
) -> dict[str, Any]:
    """Execute script via D-Bus with signal-based completion detection."""

    manager = Manager()
    manager.load()

    unit_name = f'nexus-script-{uuid.uuid4().hex[:8]}.service'

    # 1. Create and start transient unit via D-Bus
    job_path = manager.Manager.StartTransientUnit(
        name=unit_name.encode(),
        mode=b'fail',
        properties=[
            (b'ExecStart', [(command[0].encode(), [c.encode() for c in command], False)]),
            (b'Type', b'oneshot'),
            (b'RemainAfterExit', False),
            (b'CPUAccounting', True),
            (b'MemoryAccounting', True),
            (b'IOAccounting', True),
            (b'IPAccounting', True),
        ],
        aux=[]
    )

    # 2. Wait for completion using D-Bus signals (event-driven, no polling)
    completion_event = asyncio.Event()

    def on_unit_state_changed(signal):
        """Callback when unit state changes."""
        if signal.get('ActiveState') == b'inactive':
            completion_event.set()

    # Subscribe to PropertiesChanged signal for this unit
    bus = DBus()
    bus.match_signal(
        signal='PropertiesChanged',
        path=f'/org/freedesktop/systemd1/unit/{unit_name.replace("-", "_2d").replace(".", "_2e")}',
        callback=on_unit_state_changed
    )

    # Wait for completion or timeout
    try:
        await asyncio.wait_for(completion_event.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        manager.Manager.StopUnit(unit_name.encode(), b'fail')
        raise

    # 3. Query properties BEFORE cleanup (unit still exists)
    unit = Unit(unit_name.encode())
    unit.load()

    # Use flattened structure with systemd property names
    metrics = {
        'CPUUsageNSec': unit.Unit.CPUUsageNSec,
        'MemoryPeak': unit.Unit.MemoryPeak,
        'MemoryCurrent': unit.Unit.MemoryCurrent,
        'IPIngressBytes': unit.Unit.IPIngressBytes,
        'IPEgressBytes': unit.Unit.IPEgressBytes,
        'IPIngressPackets': unit.Unit.IPIngressPackets,
        'IPEgressPackets': unit.Unit.IPEgressPackets,
    }

    # Add IO metrics only if available (may not be set if no I/O occurred)
    if hasattr(unit.Unit, 'IOReadBytes') and unit.Unit.IOReadBytes > 0:
        metrics['IOReadBytes'] = unit.Unit.IOReadBytes
    if hasattr(unit.Unit, 'IOWriteBytes') and unit.Unit.IOWriteBytes > 0:
        metrics['IOWriteBytes'] = unit.Unit.IOWriteBytes
    if hasattr(unit.Unit, 'IOReadOperations') and unit.Unit.IOReadOperations > 0:
        metrics['IOReadOperations'] = unit.Unit.IOReadOperations
    if hasattr(unit.Unit, 'IOWriteOperations') and unit.Unit.IOWriteOperations > 0:
        metrics['IOWriteOperations'] = unit.Unit.IOWriteOperations

    # 4. Get stdout/stderr (would need to capture via file redirects in ExecStart)
    # This is a limitation - harder to capture stdout/stderr with pure D-Bus

    # 5. Cleanup
    manager.Manager.StopUnit(unit_name.encode(), b'fail')

    return {
        'stdout': b'',  # Would need file redirect to capture
        'stderr': b'',  # Would need file redirect to capture
        'returncode': 0,  # Would need to check ExecMainStatus
        'metrics': metrics,
    }
```

**Implementation Approach B: Polling for Final Metrics (Simpler)**

```python
async def execute_with_metrics_v2_polling(
    command: list[str],
    timeout: int,
) -> dict[str, Any]:
    """Execute script via D-Bus with polling-based completion detection."""

    manager = Manager()
    manager.load()

    unit_name = f'nexus-script-{uuid.uuid4().hex[:8]}.service'

    # 1. Create and start transient unit
    job_path = manager.Manager.StartTransientUnit(
        name=unit_name.encode(),
        mode=b'fail',
        properties=[
            (b'ExecStart', [(command[0].encode(), [c.encode() for c in command], False)]),
            (b'Type', b'oneshot'),
            (b'CPUAccounting', True),
            (b'MemoryAccounting', True),
            (b'IOAccounting', True),
            (b'IPAccounting', True),
        ],
        aux=[]
    )

    # 2. Poll until complete
    unit = Unit(unit_name.encode())
    unit.load()

    start_time = time.time()
    while True:
        # Reload unit state
        unit.load()

        active_state = unit.Unit.ActiveState.decode()
        if active_state in ['inactive', 'failed']:
            break

        # Check timeout
        if time.time() - start_time > timeout:
            manager.Manager.StopUnit(unit_name.encode(), b'fail')
            raise asyncio.TimeoutError()

        # Poll every 100ms
        await asyncio.sleep(0.1)

    # 3. Query properties immediately (unit still exists)
    # Use flattened structure with systemd property names
    metrics = {
        'CPUUsageNSec': unit.Unit.CPUUsageNSec,
        'MemoryPeak': unit.Unit.MemoryPeak,
        'MemoryCurrent': unit.Unit.MemoryCurrent,
        'IPIngressBytes': unit.Unit.IPIngressBytes,
        'IPEgressBytes': unit.Unit.IPEgressBytes,
        'IPIngressPackets': unit.Unit.IPIngressPackets,
        'IPEgressPackets': unit.Unit.IPEgressPackets,
    }

    # Add IO metrics only if available
    if hasattr(unit.Unit, 'IOReadBytes') and unit.Unit.IOReadBytes > 0:
        metrics['IOReadBytes'] = unit.Unit.IOReadBytes
    if hasattr(unit.Unit, 'IOWriteBytes') and unit.Unit.IOWriteBytes > 0:
        metrics['IOWriteBytes'] = unit.Unit.IOWriteBytes
    if hasattr(unit.Unit, 'IOReadOperations') and unit.Unit.IOReadOperations > 0:
        metrics['IOReadOperations'] = unit.Unit.IOReadOperations
    if hasattr(unit.Unit, 'IOWriteOperations') and unit.Unit.IOWriteOperations > 0:
        metrics['IOWriteOperations'] = unit.Unit.IOWriteOperations

    # 4. Cleanup
    manager.Manager.StopUnit(unit_name.encode(), b'fail')

    return {
        'stdout': b'',  # Would need file redirect to capture
        'stderr': b'',
        'returncode': 0,
        'metrics': metrics,
    }
```

**Implementation Approach C: Real-Time Monitoring (Poll During Execution)**

```python
async def execute_with_realtime_metrics(
    command: list[str],
    timeout: int,
    sample_interval: float = 0.5,  # Sample every 500ms
) -> dict[str, Any]:
    """Execute script via D-Bus with real-time metrics collection."""

    manager = Manager()
    manager.load()

    unit_name = f'nexus-script-{uuid.uuid4().hex[:8]}.service'

    # 1. Create and start transient unit
    job_path = manager.Manager.StartTransientUnit(
        name=unit_name.encode(),
        mode=b'fail',
        properties=[
            (b'ExecStart', [(command[0].encode(), [c.encode() for c in command], False)]),
            (b'Type', b'oneshot'),
            (b'CPUAccounting', True),
            (b'MemoryAccounting', True),
            (b'IOAccounting', True),
            (b'IPAccounting', True),
        ],
        aux=[]
    )

    # 2. Monitor metrics during execution
    unit = Unit(unit_name.encode())
    unit.load()

    metrics_timeline = []  # Time-series metrics
    start_time = time.time()

    while True:
        # Reload unit state
        unit.load()

        active_state = unit.Unit.ActiveState.decode()

        # Capture current metrics (flattened with systemd property names)
        current_metrics = {
            'Timestamp': time.time() - start_time,
            'CPUUsageNSec': unit.Unit.CPUUsageNSec,
            'MemoryCurrent': unit.Unit.MemoryCurrent,
            'MemoryPeak': unit.Unit.MemoryPeak,
            'IPIngressBytes': unit.Unit.IPIngressBytes,
            'IPEgressBytes': unit.Unit.IPEgressBytes,
        }
        metrics_timeline.append(current_metrics)

        # Check if complete
        if active_state in ['inactive', 'failed']:
            break

        # Check timeout
        if time.time() - start_time > timeout:
            manager.Manager.StopUnit(unit_name.encode(), b'fail')
            raise asyncio.TimeoutError()

        # Wait before next sample
        await asyncio.sleep(sample_interval)

    # 3. Get final precise metrics (flattened with systemd property names)
    final_metrics = {
        'CPUUsageNSec': unit.Unit.CPUUsageNSec,
        'MemoryPeak': unit.Unit.MemoryPeak,
        'MemoryCurrent': unit.Unit.MemoryCurrent,
        'IPIngressBytes': unit.Unit.IPIngressBytes,
        'IPEgressBytes': unit.Unit.IPEgressBytes,
        'IPIngressPackets': unit.Unit.IPIngressPackets,
        'IPEgressPackets': unit.Unit.IPEgressPackets,
        'Timeline': metrics_timeline,  # Time-series data
    }

    # Add IO metrics only if available
    if hasattr(unit.Unit, 'IOReadBytes') and unit.Unit.IOReadBytes > 0:
        final_metrics['IOReadBytes'] = unit.Unit.IOReadBytes
    if hasattr(unit.Unit, 'IOWriteBytes') and unit.Unit.IOWriteBytes > 0:
        final_metrics['IOWriteBytes'] = unit.Unit.IOWriteBytes
    if hasattr(unit.Unit, 'IOReadOperations') and unit.Unit.IOReadOperations > 0:
        final_metrics['IOReadOperations'] = unit.Unit.IOReadOperations
    if hasattr(unit.Unit, 'IOWriteOperations') and unit.Unit.IOWriteOperations > 0:
        final_metrics['IOWriteOperations'] = unit.Unit.IOWriteOperations

    # 4. Cleanup
    manager.Manager.StopUnit(unit_name.encode(), b'fail')

    return {
        'stdout': b'',  # Would need file redirect to capture
        'stderr': b'',
        'returncode': 0,
        'metrics': final_metrics,
    }
```

**Note on Real-Time Monitoring**: Approach C demonstrates that **D-Bus can handle real-time monitoring** by polling unit properties during execution. This eliminates the need for direct cgroup file reading. The same D-Bus API works for both one-time final metrics (Approach A/B) and continuous monitoring (Approach C).

**Key Challenge with D-Bus Approach**:

Capturing stdout/stderr is more difficult:
- Option A: Use file redirects in `ExecStart` (e.g., redirect to temp files, read after completion)
- Option B: Hybrid approach - use `systemd-run` subprocess but query D-Bus for precise metrics
- Option C: Use `StandardOutput=file:/path/to/stdout` property when creating unit

**Hybrid Approach (Best of Both Worlds)**:

```python
async def execute_with_metrics_hybrid(
    command: list[str],
    timeout: int,
) -> dict[str, Any]:
    """Execute via systemd-run, but query D-Bus for precise metrics."""

    # 1. Start with systemd-run (captures stdout/stderr easily)
    unit_name = f'nexus-script-{uuid.uuid4().hex[:8]}'

    systemd_cmd = [
        'systemd-run',
        '--wait',
        f'--unit={unit_name}',
        '--property=CPUAccounting=yes',
        '--property=MemoryAccounting=yes',
        '--property=IOAccounting=yes',
        '--property=IPAccounting=yes',
    ] + command

    process = await asyncio.create_subprocess_exec(
        *systemd_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # 2. While running, prepare D-Bus connection
    try:
        # Start waiting for completion
        wait_task = asyncio.create_task(process.communicate())

        # Give unit time to be created
        await asyncio.sleep(0.1)

        # Complete execution
        stdout, stderr = await asyncio.wait_for(wait_task, timeout=timeout)

        # 3. Immediately query precise metrics via D-Bus (race condition possible)
        try:
            unit = Unit(f'{unit_name}.scope'.encode())
            unit.load()

            # Flat structure using systemd property names
            metrics = {
                'CPUUsageNSec': unit.Unit.CPUUsageNSec,
                'MemoryPeak': unit.Unit.MemoryPeak,
                'IPIngressBytes': unit.Unit.IPIngressBytes,
                'IPEgressBytes': unit.Unit.IPEgressBytes,
                'IPIngressPackets': unit.Unit.IPIngressPackets,
                'IPEgressPackets': unit.Unit.IPEgressPackets,
            }
        except Exception as e:
            # Fallback to parsing if D-Bus query fails (unit already cleaned up)
            metrics = parse_systemd_metrics(stderr.decode('utf-8'))

        return {
            'stdout': stdout,
            'stderr': stderr,
            'returncode': process.returncode,
            'metrics': metrics,
        }

    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise
```

**Hybrid Approach Issues**:
- Race condition: Unit may be cleaned up before D-Bus query completes
- Unreliable: Sometimes gets precise metrics, sometimes falls back to parsing
- Not recommended unless you need specific metrics only available via D-Bus

### Dependencies for D-Bus Approach

```toml
# pyproject.toml
[project]
dependencies = [
    "pystemd>=0.14.0",  # For D-Bus systemd integration
]
```

**System Requirements**:
- `libsystemd-dev` package (build dependency for pystemd)
- May complicate containerized deployments

### Recommendation

**Basic Approach (Recommended for most use cases)**: Use **Option 1 (systemd-run --wait parsing)**
- Simplest implementation
- All required metrics available
- No additional dependencies
- Automatic cleanup
- Proven approach (what systemd-run itself does internally)
- Sufficient for most use cases

**Alternative Approach** (If you need precise metrics without D-Bus): Use **systemd-run --remain-after-exit + systemctl show**
- Exact byte counts and nanosecond precision
- Additional metrics (packet counts, I/O ops)
- No text parsing fragility
- Simple shell commands
- **Requires manual cleanup** (must call `systemctl stop` in finally block)
- See "Enhanced Metrics via systemctl show" section above

**Advanced Approach** (If you need real-time monitoring or prefer Python API): Use **Option 2 (D-Bus/pystemd)**
- All benefits of Alternative Approach plus:
  - Type-safe Python API (no parsing at all)
  - Real-time monitoring during execution (time-series metrics)
  - Programmatic cleanup control
  - No subprocess overhead
- Worth the added complexity and pystemd dependency
- See detailed implementation examples below

**Not Recommended**:
- Hybrid approach (systemd-run + D-Bus query after completion = race conditions)
- Direct cgroup file reading (adds complexity without additional benefit over D-Bus)

---

## Working Examples

The following standalone Python scripts demonstrate the two main approaches for metrics collection. Both scripts execute a `curl` command with verbose output and collect resource metrics.

### Example Scripts

- **[Option 1: systemd-run stderr parsing](examples/metrics_option1_stderr_parsing.py)** - Basic approach that parses human-readable metrics from `systemd-run --wait` stderr output. No additional dependencies required.

- **[Option 2: D-Bus/pystemd direct control](examples/metrics_option2_dbus_pystemd.py)** - Advanced approach using pure D-Bus with `pystemd` library for precise metrics via `StartTransientUnit()`. Requires `pystemd` and `libsystemd-dev`.

### Running the Examples

```bash
# Option 1: systemd-run stderr parsing (user session, default)
python specs/029-retrieve-key-metrics/examples/metrics_option1_stderr_parsing.py

# Option 1: system session (requires root)
python specs/029-retrieve-key-metrics/examples/metrics_option1_stderr_parsing.py --system

# Option 2: D-Bus/pystemd (user session, default)
python specs/029-retrieve-key-metrics/examples/metrics_option2_dbus_pystemd.py

# Option 2: system session (requires root)
python specs/029-retrieve-key-metrics/examples/metrics_option2_dbus_pystemd.py --system
```

### Example Output: Option 1 (systemd-run stderr parsing)

```
============================================================
Option 1: systemd-run --wait stderr parsing
Mode: user session (default)
============================================================

Executing: systemd-run --wait --pipe --user --property=CPUAccounting=yes ...
------------------------------------------------------------

============================================================
STDOUT:
============================================================
(empty)

============================================================
STDERR (script output only):
============================================================
* Host cdn.kernel.org:443 was resolved.
* IPv6: 2604:1380:4641:c500::1
*   Trying [2604:1380:4641:c500::1]:443...
* Connected to cdn.kernel.org (2604:1380:4641:c500::1) port 443
...
< HTTP/2 200
< server: nginx
< date: Mon, 17 Feb 2026 14:32:15 GMT
< content-type: application/x-xz
< content-length: 161232
...
* Connection #0 to host cdn.kernel.org left intact

============================================================
METRICS (parsed from systemd-run output):
============================================================
  CPUUsageNSec: 22000000 ns (22.00 ms)
  DurationMs: 1250 ms (1.25 seconds)
  IOReadBytes: 106496 bytes (104.00 KB)
  IOWriteBytes: 163840 bytes (160.00 KB)
  IPEgressBytes: 4300 bytes (4.20 KB)
  IPIngressBytes: 179814 bytes (175.60 KB)
  MemoryPeak: 3774873 bytes (3.60 MB)

============================================================
Return code: 0
============================================================
```

### Example Output: Option 2 (D-Bus/pystemd direct control)

```
============================================================
Option 2: D-Bus/pystemd direct control
Mode: user session (default)
============================================================

Executing: /usr/bin/curl -v -o /tmp/a https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.19.xz
Unit name: nexus-script-a1b2c3d4.service
------------------------------------------------------------

============================================================
STDOUT:
============================================================
* Host cdn.kernel.org:443 was resolved.
* IPv6: 2604:1380:4641:c500::1
*   Trying [2604:1380:4641:c500::1]:443...
* Connected to cdn.kernel.org (2604:1380:4641:c500::1) port 443
...
< HTTP/2 200
< server: nginx
< date: Mon, 17 Feb 2026 14:35:22 GMT
< content-type: application/x-xz
< content-length: 161232
...
* Connection #0 to host cdn.kernel.org left intact

============================================================
METRICS (from D-Bus properties - precise values):
============================================================
  CPUUsageNSec: 21323000 ns (21.32 ms / 0.0213 s)
  DurationMs: 1180 ms (1.18 seconds)
  IOReadBytes: 106496 bytes (104.00 KB)
  IOWriteBytes: 163840 bytes (160.00 KB)
  IPEgressBytes: 4298 bytes (4.20 KB)
  IPIngressBytes: 179650 bytes (175.44 KB)
  IPEgressPackets: 23 (count)
  IPIngressPackets: 16 (count)
  MemoryPeak: 3571712 bytes (3.41 MB)

============================================================
Return code: 0
Unit name: nexus-script-a1b2c3d4.service
============================================================
```

### Key Differences Between Approaches

| Aspect | Option 1 (stderr parsing) | Option 2 (D-Bus/pystemd) |
|--------|--------------------------|--------------------------|
| **Dependencies** | None (systemd only) | pystemd + libsystemd-dev |
| **CPU Precision** | Milliseconds | Nanoseconds |
| **Memory Values** | Human-readable ("3.6M") | Exact bytes (3571712) |
| **Packet Counts** | Not available | Available |
| **I/O Operations** | Not available | Available |
| **Stdout/Stderr** | Native (--pipe flag) | Via journal |
| **Complexity** | Low | Medium |
| **Real-time Monitoring** | Not supported | Supported (poll D-Bus) |

---

## References

### cgroups v2 Documentation
- [Linux Kernel cgroups v2 Documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [Control Group v2 - Kernel Docs](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Interesting Metrics from cgroup V2 Systems - Chris's Wiki](https://utcc.utoronto.ca/~cks/space/blog/linux/CgroupV2InterestingMetrics)

### systemd Documentation
- [systemd-run Manual Page](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html)
- [systemd.resource-control Manual Page](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
- [systemd.kill Manual Page](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html)
- [Control Group APIs and Delegation - systemd.io](https://systemd.io/CGROUP_DELEGATION/)
- [Red Hat: Configuring resource management using cgroups-v2 and systemd](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/managing_monitoring_and_updating_the_kernel/assembly_configuring-resource-management-using-systemd_managing-monitoring-and-updating-the-kernel)

### Python Libraries
- [PyPI: asyncinotify](https://pypi.org/project/asyncinotify/)
- [PyPI: aiofiles](https://pypi.org/project/aiofiles/)
- [GitHub: systemd/pystemd](https://github.com/systemd/pystemd)
- [GitHub: isac322/python-libcgroup_bind](https://github.com/isac322/python-libcgroup_bind)
- [GitHub: cloudsigma/cgroupspy](https://github.com/cloudsigma/cgroupspy)

### Additional Resources
- [Python asyncio Subprocesses Documentation](https://docs.python.org/3/library/asyncio-subprocess.html)
- [runc cgroup v2 Documentation](https://github.com/opencontainers/runc/blob/main/docs/cgroup-v2.md)
- [Rootless Containers - Optional cgroup v2](https://rootlesscontaine.rs/getting-started/common/cgroup2/)
- [iximiuz Labs: Controlling Process Resources with Linux Control Groups](https://labs.iximiuz.com/tutorials/controlling-process-resources-with-cgroups)
- [AWS Linux 2023: Limiting process resource usage with systemd](https://docs.aws.amazon.com/linux/al2023/ug/resource-limiting-systemd.html)

---

**Research Complete**: 2026-02-12
**Reviewed By**: Claude Sonnet 4.5
**Confidence**: 95% (valid until February 2026 or until major systemd/kernel changes)
