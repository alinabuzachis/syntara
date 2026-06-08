"""Tests for node_settings_resolver pure functions."""

from nexus.settings.catalog import SETTINGS_CATALOG
from nexus.workflows.workflow_engine.graph import ActivityNode
from nexus.workflows.workflow_engine.node_settings_resolver import resolve_retry_policy


def _catalog_defaults() -> dict[str, object]:
    return {e.key: e.default_value for e in SETTINGS_CATALOG if e.key.startswith("workflow_engine.")}


def test_resolve_retry_policy_inline_fallbacks_match_catalog_defaults() -> None:
    """Inline fallbacks in resolve_retry_policy must stay in sync with catalog defaults.

    resolve_retry_policy is called with an empty runtime_settings dict (simulating a
    total cache miss) and again with the full catalog defaults. Both calls must produce
    an identical RetryPolicy, proving the hardcoded fallbacks are exact mirrors of the
    catalog entries. If a catalog default is changed without updating the inline
    fallback (or vice versa), this test fails.
    """
    node = ActivityNode(node_id="n", node_type="script", config={})

    result_inline = resolve_retry_policy(node, {})
    result_catalog = resolve_retry_policy(node, _catalog_defaults())

    assert result_inline == result_catalog, (
        "Inline fallbacks in resolve_retry_policy diverged from catalog defaults. "
        "Update the hardcoded fallback values in node_settings_resolver.py to match "
        "the default_value entries in settings/catalog.py."
    )
