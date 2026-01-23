"""Shared fixtures for file upload integration tests."""

from pathlib import Path

import pytest

from tests.fixtures import get_fixtures_dir


@pytest.fixture
def fixtures_dir() -> Path:
    """Provide fixtures directory path."""
    return get_fixtures_dir()


@pytest.fixture
def sample_pdf_path(fixtures_dir: Path) -> Path:
    """Provide path to sample PDF file."""
    return fixtures_dir / "sample.pdf"


@pytest.fixture
def sample_docx_path(fixtures_dir: Path) -> Path:
    """Provide path to sample DOCX file."""
    return fixtures_dir / "sample.docx"


@pytest.fixture
def sample_txt_path(fixtures_dir: Path) -> Path:
    """Provide path to sample text file."""
    return fixtures_dir / "sample.txt"


@pytest.fixture
def sample_md_path(fixtures_dir: Path) -> Path:
    """Provide path to sample markdown file."""
    return fixtures_dir / "sample.md"


@pytest.fixture
def sample_image_path(fixtures_dir: Path) -> Path:
    """Provide path to sample image file."""
    return fixtures_dir / "image.png"
