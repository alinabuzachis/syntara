"""Lightweight CLI benchmarking helpers enabled by ``APP_CLI_BENCHMARK=1``."""

from __future__ import annotations

import atexit
import json
import os
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Iterator


@dataclass
class PhaseStats:
    """Aggregated timing stats for a named benchmark phase."""

    total_s: float = 0.0
    count: int = 0
    min_s: float = field(default_factory=lambda: float("inf"))
    max_s: float = 0.0

    def add(self, duration_s: float) -> None:
        """Accumulate one completed phase duration."""
        self.total_s += duration_s
        self.count += 1
        self.min_s = min(self.min_s, duration_s)
        self.max_s = max(self.max_s, duration_s)

    @property
    def avg_s(self) -> float:
        """Return the average duration for this phase."""
        return self.total_s / self.count if self.count else 0.0


@dataclass
class BenchmarkSession:
    """Per-process benchmark accumulator."""

    enabled: bool
    start_s: float = field(default_factory=time.perf_counter)
    phases: dict[str, PhaseStats] = field(default_factory=dict)
    metadata: dict[str, str] = field(default_factory=dict)
    emitted: bool = False

    def note(self, key: str, value: Any) -> None:
        """Record metadata to include in the emitted summary."""
        if not self.enabled or value is None:
            return
        self.metadata[key] = str(value)

    def record(self, name: str, duration_s: float) -> None:
        """Record elapsed time for a named phase."""
        if not self.enabled:
            return
        self.phases.setdefault(name, PhaseStats()).add(duration_s)

    @contextmanager
    def phase(self, name: str) -> Iterator[None]:
        """Measure a named phase and add it to the session."""
        if not self.enabled:
            yield
            return

        start_s = time.perf_counter()
        try:
            yield
        finally:
            self.record(name, time.perf_counter() - start_s)

    def render_lines(self, *, now_s: float | None = None) -> list[str]:
        """Render the current benchmark summary as log lines."""
        if not self.enabled:
            return []

        total_s = (time.perf_counter() if now_s is None else now_s) - self.start_s
        metadata_str = " ".join(f"{key}={json.dumps(value)}" for key, value in self.metadata.items())
        header = f"[orchestrator benchmark] total_s={total_s:.6f}"
        if metadata_str:
            header = f"{header} {metadata_str}"

        lines = [header]
        for name, stats in self.phases.items():
            lines.append(
                "[orchestrator benchmark] "
                f"phase={name} total_s={stats.total_s:.6f} count={stats.count} "
                f"avg_s={stats.avg_s:.6f} min_s={stats.min_s:.6f} max_s={stats.max_s:.6f}"
            )
        return lines

    def emit(self, *, now_s: float | None = None) -> None:
        """Write the benchmark summary to stderr once."""
        if not self.enabled or self.emitted:
            return

        self.emitted = True
        for line in self.render_lines(now_s=now_s):
            sys.stderr.write(f"{line}\n")


_SESSION = BenchmarkSession(enabled=os.environ.get("APP_CLI_BENCHMARK") == "1")


def enabled() -> bool:
    """Return whether CLI benchmarking is enabled."""
    return _SESSION.enabled


def note(key: str, value: Any) -> None:
    """Record descriptive metadata to include in the benchmark summary."""
    _SESSION.note(key, value)


def record(name: str, duration_s: float) -> None:
    """Record a completed benchmark phase."""
    _SESSION.record(name, duration_s)


@contextmanager
def phase(name: str) -> Iterator[None]:
    """Time a named phase when benchmarking is enabled."""
    with _SESSION.phase(name):
        yield


def emit_summary(*, now_s: float | None = None) -> None:
    """Print the benchmark summary to stderr."""
    _SESSION.emit(now_s=now_s)


if _SESSION.enabled:
    atexit.register(emit_summary)
