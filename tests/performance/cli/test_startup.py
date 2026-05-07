"""CLI startup performance regression coverage."""

from __future__ import annotations

import os
import re
import statistics
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.performance

_REPO_ROOT = Path(__file__).resolve().parents[3]
_WARMUP_RUNS = 2
_MEASURED_RUNS = 5

# Cached `ao --help` startup has been measured around ~0.19s after the
# optimization work. Before the final endpoint-discovery simplification it was
# around ~0.306s, so reaching that older range should fail this test.
_EXPECTED_MEDIAN_TOTAL_S = 0.25
_REGRESSION_TOTAL_S = 0.30

_BENCHMARK_TOTAL_RE = re.compile(
    r"^\[ao benchmark\] total_s=(?P<total>\d+\.\d+)",
    re.MULTILINE,
)


def _measure_help_startup() -> float:
    """Run `ao --help` once and return the internal benchmark total."""
    completed = subprocess.run(  # noqa: S603 - this test intentionally benchmarks the real CLI process
        [sys.executable, "-m", "aap_orchestrator_cli", "--help"],
        cwd=_REPO_ROOT,
        env=os.environ | {"AO_BENCHMARK": "1"},
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )

    match = _BENCHMARK_TOTAL_RE.search(completed.stderr)
    if not match:
        msg = f"Expected AO_BENCHMARK output in stderr, got:\n{completed.stderr}"
        raise AssertionError(msg)

    return float(match.group("total"))


def test_cli_help_startup_stays_within_perf_budget() -> None:
    """Cached `ao --help` startup should stay near the optimized budget."""
    for _ in range(_WARMUP_RUNS):
        _measure_help_startup()

    samples = [_measure_help_startup() for _ in range(_MEASURED_RUNS)]
    sample_str = ", ".join(f"{sample:.3f}s" for sample in samples)
    median_total = statistics.median(samples)
    max_total = max(samples)

    assert median_total < _EXPECTED_MEDIAN_TOTAL_S, (
        f"`ao --help` median startup was {median_total:.3f}s, exceeding the expected "
        f"post-optimization budget of {_EXPECTED_MEDIAN_TOTAL_S:.3f}s "
        f"(samples: {sample_str})"
    )
    assert max_total < _REGRESSION_TOTAL_S, (
        f"`ao --help` startup regressed to {max_total:.3f}s, reaching the older "
        f"pre-optimization range of {_REGRESSION_TOTAL_S:.3f}s "
        f"(samples: {sample_str})"
    )
