"""Run pybuild-deps compile with a setup.cfg parser workaround.

pybuild-deps splits setup.cfg setup_requires on commas, which breaks valid
PEP 508 specifiers such as "setuptools>=61,<4.0" into invalid fragments like
"<4.0".
"""

from __future__ import annotations

import inspect
import os
from configparser import ConfigParser
from pathlib import Path
from typing import Any

from pybuild_deps import finder, parsers, source
from pybuild_deps.__main__ import cli


def _clear_find_build_deps_cache() -> None:
    """Drop cached build-dep lookups produced before the setup.cfg parser fix."""
    cache_file = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "pybuild-deps" / "find-build-deps"
    for path in (
        cache_file,
        Path(f"{cache_file}.db"),
        Path(f"{cache_file}.dat"),
        Path(f"{cache_file}.dir"),
    ):
        path.unlink(missing_ok=True)


def _parse_setup_cfg(content: str) -> list[str]:
    config = ConfigParser()
    config.read_string(content)
    try:
        build_requirements = config["options"]["setup_requires"]
    except KeyError:
        return []
    return [req.strip() for req in build_requirements.strip().splitlines() if req.strip()]


def _patch_downloader_signature() -> None:
    """Bridge pybuild-deps to newer pip Downloader constructor signatures."""
    try:
        params = inspect.signature(source.Downloader.__init__).parameters
    except (TypeError, ValueError):
        return

    if "resume_retries" not in params:
        return

    downloader_cls = source.Downloader

    def _compat_downloader(session: Any, progress_bar: Any) -> Any:
        return downloader_cls(session, progress_bar, resume_retries=0)

    source.Downloader = _compat_downloader


parsers.parse_setup_cfg = _parse_setup_cfg
finder.parse_setup_cfg = _parse_setup_cfg

if __name__ == "__main__":
    _clear_find_build_deps_cache()
    _patch_downloader_signature()
    cli(prog_name="pybuild-deps")
