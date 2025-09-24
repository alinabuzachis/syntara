"""Tests for the FastAPI application."""

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

client = TestClient(app)


def test_root_endpoint():
    """Test the root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Hello, World!"
    assert data["version"] == "0.1.0"
    assert data["status"] == "running"
    assert "timestamp" in data


def test_health_check():
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "nexus-ng-api"
    assert "timestamp" in data


def test_app_info():
    """Test the app info endpoint."""
    response = client.get("/info")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Nexus-NG API"
    assert data["version"] == "0.1.0"
    assert "api" in data["modules"]
    assert "utils" in data["modules"]
    assert len(data["endpoints"]) >= 3


def test_docs_endpoint():
    """Test that the docs endpoint is accessible."""
    response = client.get("/docs")
    assert response.status_code == 200


def test_redoc_endpoint():
    """Test that the redoc endpoint is accessible."""
    response = client.get("/redoc")
    assert response.status_code == 200
