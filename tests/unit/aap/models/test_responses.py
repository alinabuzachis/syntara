"""Tests for AAP response models, especially summary_fields extraction."""

import pytest
from pydantic import ValidationError

from nexus.aap.models.responses import (
    AAP_SUMMARY_FIELDS_KEY,
    AAPJobTemplateDetail,
    AAPLabel,
    AAPSummaryField,
)


class TestAAPJobTemplateDetailSummaryFieldsExtraction:
    """Test the extract_summary_fields validator in AAPJobTemplateDetail."""

    def test_extracts_all_defaults_from_valid_summary_fields(self):
        """Should extract inventory, execution_environment, and credentials from summary_fields."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "inventory": {"id": 1, "name": "Default Inventory"},
                "execution_environment": {"id": 2, "name": "Default EE"},
                "credentials": [
                    {"id": 3, "name": "SSH Credential"},
                    {"id": 4, "name": "AWS Credential"},
                ],
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is not None
        assert template.default_inventory.id == 1
        assert template.default_inventory.name == "Default Inventory"

        assert template.default_execution_environment is not None
        assert template.default_execution_environment.id == 2
        assert template.default_execution_environment.name == "Default EE"

        assert len(template.default_credentials) == 2
        assert template.default_credentials[0].id == 3
        assert template.default_credentials[0].name == "SSH Credential"
        assert template.default_credentials[1].id == 4
        assert template.default_credentials[1].name == "AWS Credential"

    def test_extracts_partial_defaults_from_summary_fields(self):
        """Should extract only the defaults that are present in summary_fields."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "inventory": {"id": 1, "name": "Default Inventory"},
                # execution_environment and credentials missing
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is not None
        assert template.default_inventory.id == 1
        assert template.default_inventory.name == "Default Inventory"

        assert template.default_execution_environment is None
        assert template.default_credentials == []

    def test_handles_empty_summary_fields_dict(self):
        """Should handle empty summary_fields gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {},
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is None
        assert template.default_execution_environment is None
        assert template.default_credentials == []

    def test_handles_missing_summary_fields_key(self):
        """Should handle missing summary_fields key gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            # No summary_fields at all
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is None
        assert template.default_execution_environment is None
        assert template.default_credentials == []

    def test_handles_non_dict_summary_fields(self):
        """Should handle non-dict summary_fields gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: "invalid",  # Not a dict
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is None
        assert template.default_execution_environment is None
        assert template.default_credentials == []

    def test_skips_invalid_inventory_missing_id(self):
        """Should skip inventory if it's missing required 'id' field."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "inventory": {"name": "Default Inventory"},  # Missing 'id'
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is None

    def test_skips_invalid_inventory_missing_name(self):
        """Should skip inventory if it's missing required 'name' field."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "inventory": {"id": 1},  # Missing 'name'
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is None

    def test_skips_invalid_inventory_not_dict(self):
        """Should skip inventory if it's not a dict."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "inventory": "invalid",  # Not a dict
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_inventory is None

    def test_skips_invalid_execution_environment_missing_id(self):
        """Should skip execution_environment if it's missing required 'id' field."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "execution_environment": {"name": "Default EE"},  # Missing 'id'
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_execution_environment is None

    def test_skips_invalid_execution_environment_missing_name(self):
        """Should skip execution_environment if it's missing required 'name' field."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "execution_environment": {"id": 2},  # Missing 'name'
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_execution_environment is None

    def test_skips_invalid_execution_environment_not_dict(self):
        """Should skip execution_environment if it's not a dict."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "execution_environment": "invalid",  # Not a dict
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_execution_environment is None

    def test_logs_error_for_invalid_credentials_and_returns_empty_list(self, caplog):
        """Should log ERROR and return empty list when credentials contain invalid items."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "credentials": [
                    {"id": 3, "name": "SSH Credential"},  # Valid
                    {"name": "Missing ID"},  # Invalid - missing id
                    {"id": 5},  # Invalid - missing name
                    "invalid",  # Invalid - not a dict
                    {"id": 6, "name": "AWS Credential"},  # Valid
                ],
            },
        }

        template = AAPJobTemplateDetail(**data)

        # Should return empty list when ANY credential is invalid (strict validation)
        assert template.default_credentials == []

        # Should log ERROR (not just WARNING) for invalid credentials
        error_logs = [record for record in caplog.records if record.levelname == "ERROR"]
        assert len(error_logs) >= 1
        assert "Invalid credentials from AAP" in str(error_logs)

    def test_accepts_all_valid_credentials(self):
        """Should accept and extract all credentials when all are valid."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "credentials": [
                    {"id": 3, "name": "SSH Credential"},
                    {"id": 6, "name": "AWS Credential"},
                ],
            },
        }

        template = AAPJobTemplateDetail(**data)

        # Should extract all valid credentials
        assert len(template.default_credentials) == 2
        assert template.default_credentials[0].id == 3
        assert template.default_credentials[0].name == "SSH Credential"
        assert template.default_credentials[1].id == 6
        assert template.default_credentials[1].name == "AWS Credential"

    def test_handles_non_list_credentials(self):
        """Should handle non-list credentials gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "credentials": "invalid",  # Not a list
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_credentials == []

    def test_handles_empty_credentials_list(self):
        """Should handle empty credentials list gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "credentials": [],
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_credentials == []

    def test_does_not_override_existing_default_inventory(self):
        """Should not override default_inventory if already set."""
        data = {
            "id": 123,
            "name": "Deploy App",
            "default_inventory": {"id": 99, "name": "Explicit Inventory"},
            AAP_SUMMARY_FIELDS_KEY: {
                "inventory": {"id": 1, "name": "Summary Inventory"},
            },
        }

        template = AAPJobTemplateDetail(**data)

        # Should keep the explicit value, not the summary_fields value
        assert template.default_inventory is not None
        assert template.default_inventory.id == 99
        assert template.default_inventory.name == "Explicit Inventory"

    def test_does_not_override_existing_default_execution_environment(self):
        """Should not override default_execution_environment if already set."""
        data = {
            "id": 123,
            "name": "Deploy App",
            "default_execution_environment": {"id": 99, "name": "Explicit EE"},
            AAP_SUMMARY_FIELDS_KEY: {
                "execution_environment": {"id": 2, "name": "Summary EE"},
            },
        }

        template = AAPJobTemplateDetail(**data)

        # Should keep the explicit value, not the summary_fields value
        assert template.default_execution_environment is not None
        assert template.default_execution_environment.id == 99
        assert template.default_execution_environment.name == "Explicit EE"

    def test_does_not_override_existing_default_credentials(self):
        """Should not override default_credentials if already set."""
        data = {
            "id": 123,
            "name": "Deploy App",
            "default_credentials": [{"id": 99, "name": "Explicit Credential"}],
            AAP_SUMMARY_FIELDS_KEY: {
                "credentials": [{"id": 3, "name": "Summary Credential"}],
            },
        }

        template = AAPJobTemplateDetail(**data)

        # Should keep the explicit value, not the summary_fields value
        assert len(template.default_credentials) == 1
        assert template.default_credentials[0].id == 99
        assert template.default_credentials[0].name == "Explicit Credential"

    def test_handles_non_dict_input(self):
        """Should return non-dict input unchanged (validator safety check)."""
        # This tests the validator's defensive check at the beginning
        # The validator checks isinstance(data, dict) and returns data unchanged if not
        # We can test this by passing a non-dict directly to the validator
        from nexus.aap.models.responses import AAPJobTemplateDetail

        # Call the validator directly with non-dict data
        result = AAPJobTemplateDetail.extract_summary_fields("not a dict")
        assert result == "not a dict"

    def test_accepts_scalar_default_values(self):
        """Should accept scalar default values from AAP job template."""
        data = {
            "id": 123,
            "name": "Deploy App",
            "job_type": "run",
            "verbosity": 2,
            "forks": 5,
            "limit": "webservers",
            "job_tags": "deploy,config",
            "skip_tags": "slow",
            "diff_mode": True,
            "job_slice_count": 4,
            "timeout": 3600,
            "extra_vars": '{"key": "value"}',
        }

        template = AAPJobTemplateDetail(**data)

        assert template.job_type == "run"
        assert template.verbosity == 2
        assert template.forks == 5
        assert template.limit == "webservers"
        assert template.job_tags == "deploy,config"
        assert template.skip_tags == "slow"
        assert template.diff_mode is True
        assert template.job_slice_count == 4
        assert template.timeout == 3600
        assert template.extra_vars == '{"key": "value"}'

    def test_scalar_defaults_are_optional(self):
        """Should allow scalar default values to be None."""
        data = {
            "id": 123,
            "name": "Deploy App",
            # All scalar defaults omitted
        }

        template = AAPJobTemplateDetail(**data)

        assert template.job_type is None
        assert template.verbosity is None
        assert template.forks is None
        assert template.limit is None
        assert template.job_tags is None
        assert template.skip_tags is None
        assert template.diff_mode is None
        assert template.job_slice_count is None
        assert template.timeout is None
        assert template.extra_vars is None
        assert template.default_labels == []

    def test_rejects_invalid_job_type(self):
        """Should reject job_type values other than 'run' or 'check'."""
        data = {
            "id": 123,
            "name": "Deploy App",
            "job_type": "destroy",  # Invalid value
        }

        with pytest.raises(ValidationError) as exc_info:
            AAPJobTemplateDetail(**data)

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("job_type",) for error in errors)

    def test_accepts_valid_job_types(self):
        """Should accept 'run' and 'check' as valid job_type values."""
        for job_type in ["run", "check"]:
            template = AAPJobTemplateDetail(id=123, name="Deploy App", job_type=job_type)
            assert template.job_type == job_type

    def test_rejects_verbosity_out_of_range(self):
        """Should reject verbosity values outside 0-5 range."""
        for invalid_verbosity in [-1, 6, 999]:
            data = {"id": 123, "name": "Deploy App", "verbosity": invalid_verbosity}
            with pytest.raises(ValidationError) as exc_info:
                AAPJobTemplateDetail(**data)
            errors = exc_info.value.errors()
            assert any(error["loc"] == ("verbosity",) for error in errors)

    def test_accepts_valid_verbosity_range(self):
        """Should accept verbosity values 0-5."""
        for verbosity in range(6):  # 0-5
            template = AAPJobTemplateDetail(id=123, name="Deploy App", verbosity=verbosity)
            assert template.verbosity == verbosity

    def test_rejects_negative_forks(self):
        """Should reject negative forks value."""
        data = {"id": 123, "name": "Deploy App", "forks": -5}

        with pytest.raises(ValidationError) as exc_info:
            AAPJobTemplateDetail(**data)

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("forks",) for error in errors)

    def test_rejects_negative_job_slice_count(self):
        """Should reject negative job_slice_count value."""
        data = {"id": 123, "name": "Deploy App", "job_slice_count": -1}

        with pytest.raises(ValidationError) as exc_info:
            AAPJobTemplateDetail(**data)

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("job_slice_count",) for error in errors)

    def test_rejects_negative_timeout(self):
        """Should reject negative timeout value."""
        data = {"id": 123, "name": "Deploy App", "timeout": -100}

        with pytest.raises(ValidationError) as exc_info:
            AAPJobTemplateDetail(**data)

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("timeout",) for error in errors)

    def test_extracts_labels_from_summary_fields(self):
        """Should extract labels from summary_fields.labels.results as list of AAPSummaryField."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "labels": {
                    "count": 2,
                    "results": [
                        {"id": 1, "name": "label1"},
                        {"id": 2, "name": "label2"},
                    ],
                },
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert len(template.default_labels) == 2
        assert template.default_labels[0].id == 1
        assert template.default_labels[0].name == "label1"
        assert template.default_labels[1].id == 2
        assert template.default_labels[1].name == "label2"

    def test_handles_empty_labels_results(self):
        """Should handle empty labels results gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {
                "labels": {
                    "count": 0,
                    "results": [],
                },
            },
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_labels == []

    def test_handles_missing_labels_in_summary_fields(self):
        """Should handle missing labels in summary_fields gracefully."""
        data = {
            "id": 123,
            "name": "Deploy App",
            AAP_SUMMARY_FIELDS_KEY: {},
        }

        template = AAPJobTemplateDetail(**data)

        assert template.default_labels == []


class TestAAPSummaryField:
    """Test the AAPSummaryField model."""

    def test_creates_summary_field_with_valid_data(self):
        """Should create AAPSummaryField with id and name."""
        field = AAPSummaryField(id=1, name="Test Field")

        assert field.id == 1
        assert field.name == "Test Field"

    def test_requires_id_field(self):
        """Should require 'id' field."""
        with pytest.raises(ValidationError) as exc_info:
            AAPSummaryField(name="Test Field")

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("id",) for error in errors)

    def test_requires_name_field(self):
        """Should require 'name' field."""
        with pytest.raises(ValidationError) as exc_info:
            AAPSummaryField(id=1)

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("name",) for error in errors)


class TestAAPLabel:
    """Test the AAPLabel model."""

    def test_creates_label_with_valid_data(self):
        """Should create AAPLabel with id, name, and organization."""
        label = AAPLabel(id=1, name="production", organization=10)

        assert label.id == 1
        assert label.name == "production"
        assert label.organization == 10

    def test_creates_label_without_organization(self):
        """Should create AAPLabel with id and name, organization is optional."""
        label = AAPLabel(id=2, name="staging")

        assert label.id == 2
        assert label.name == "staging"
        assert label.organization is None

    def test_requires_id_field(self):
        """Should require 'id' field."""
        with pytest.raises(ValidationError) as exc_info:
            AAPLabel(name="production")

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("id",) for error in errors)

    def test_requires_name_field(self):
        """Should require 'name' field."""
        with pytest.raises(ValidationError) as exc_info:
            AAPLabel(id=1)

        errors = exc_info.value.errors()
        assert any(error["loc"] == ("name",) for error in errors)
