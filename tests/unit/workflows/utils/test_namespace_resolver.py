"""Tests for NamespaceResolver core functionality (task 6.1).

Tests cover:
- resolve_value with single and multiple templates
- resolve_dict with nested dicts, lists, and lists-of-dicts
- _lookup_path with dotted paths
- Loop namespace resolution via set_context
"""

from typing import Any

import pytest

from nexus.workflows.utils.namespace_resolver import NamespaceResolver

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def resolver() -> NamespaceResolver:
    """Resolver with trigger and node1 namespaces loaded."""
    r = NamespaceResolver()
    r.set_namespace("trigger", {"url": "https://api.example.com", "method": "POST", "count": 3})
    r.set_namespace("node1", {"output": {"status": "ok", "items": [1, 2, 3]}})
    return r


# ---------------------------------------------------------------------------
# resolve_value — single template
# ---------------------------------------------------------------------------


class TestResolveValueSingle:
    """resolve_value with a single template expression."""

    def test_full_template_returns_typed_value(self, resolver: NamespaceResolver) -> None:
        assert resolver.resolve_value("${trigger.count}") == 3
        assert isinstance(resolver.resolve_value("${trigger.count}"), int)

    def test_full_template_returns_string(self, resolver: NamespaceResolver) -> None:
        assert resolver.resolve_value("${trigger.url}") == "https://api.example.com"

    def test_full_template_returns_dict(self, resolver: NamespaceResolver) -> None:
        result = resolver.resolve_value("${node1.output}")
        assert result == {"status": "ok", "items": [1, 2, 3]}

    def test_full_template_returns_list(self, resolver: NamespaceResolver) -> None:
        result = resolver.resolve_value("${node1.output.items}")
        assert result == [1, 2, 3]

    def test_non_string_passthrough(self, resolver: NamespaceResolver) -> None:
        assert resolver.resolve_value(42) == 42
        assert resolver.resolve_value(None) is None
        bool_value = True
        assert resolver.resolve_value(bool_value) is bool_value

    def test_no_template_string_passthrough(self, resolver: NamespaceResolver) -> None:
        assert resolver.resolve_value("plain text") == "plain text"


# ---------------------------------------------------------------------------
# resolve_value — multiple templates
# ---------------------------------------------------------------------------


class TestResolveValueMultiple:
    """resolve_value with multiple template expressions in one string."""

    def test_two_templates_in_string(self, resolver: NamespaceResolver) -> None:
        result = resolver.resolve_value("${trigger.method} ${trigger.url}")
        assert result == "POST https://api.example.com"

    def test_template_with_surrounding_text(self, resolver: NamespaceResolver) -> None:
        result = resolver.resolve_value("Send ${trigger.method} to ${trigger.url}")
        assert result == "Send POST to https://api.example.com"

    def test_non_string_coerced_to_str_in_mixed(self, resolver: NamespaceResolver) -> None:
        result = resolver.resolve_value("count=${trigger.count}")
        assert result == "count=3"

    def test_missing_namespace_raises(self, resolver: NamespaceResolver) -> None:
        with pytest.raises(KeyError, match="unknown"):
            resolver.resolve_value("${unknown.field}")


# ---------------------------------------------------------------------------
# resolve_dict — nested dicts
# ---------------------------------------------------------------------------


class TestResolveDictNested:
    """resolve_dict with nested dictionary structures."""

    def test_flat_dict(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"url": "${trigger.url}", "method": "${trigger.method}"}
        result = resolver.resolve_dict(data)
        assert result == {"url": "https://api.example.com", "method": "POST"}

    def test_nested_dict(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"config": {"endpoint": "${trigger.url}"}}
        result = resolver.resolve_dict(data)
        assert result == {"config": {"endpoint": "https://api.example.com"}}

    def test_deeply_nested_dict(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"a": {"b": {"c": "${trigger.url}"}}}
        result = resolver.resolve_dict(data)
        assert result == {"a": {"b": {"c": "https://api.example.com"}}}

    def test_mixed_template_and_static(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"url": "${trigger.url}", "static": "hello", "num": 42}
        result = resolver.resolve_dict(data)
        assert result == {"url": "https://api.example.com", "static": "hello", "num": 42}

    def test_returns_new_dict(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"url": "${trigger.url}"}
        result = resolver.resolve_dict(data)
        assert result is not data


# ---------------------------------------------------------------------------
# resolve_dict — lists and lists-of-dicts
# ---------------------------------------------------------------------------


class TestResolveDictLists:
    """resolve_dict with lists containing templates."""

    def test_list_of_strings(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"urls": ["${trigger.url}", "static"]}
        result = resolver.resolve_dict(data)
        assert result["urls"] == ["https://api.example.com", "static"]

    def test_list_of_dicts(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {
            "items": [
                {"url": "${trigger.url}"},
                {"method": "${trigger.method}"},
            ],
        }
        result = resolver.resolve_dict(data)
        assert result["items"] == [
            {"url": "https://api.example.com"},
            {"method": "POST"},
        ]

    def test_nested_list_of_lists(self, resolver: NamespaceResolver) -> None:
        data: dict[str, Any] = {"matrix": [["${trigger.url}"]]}
        result = resolver.resolve_dict(data)
        assert result["matrix"] == [["https://api.example.com"]]

    def test_empty_dict(self, resolver: NamespaceResolver) -> None:
        assert resolver.resolve_dict({}) == {}


# ---------------------------------------------------------------------------
# _lookup_path — dotted paths
# ---------------------------------------------------------------------------


class TestLookupPath:
    """Tests for _lookup_path with dotted namespace paths."""

    def test_single_level(self, resolver: NamespaceResolver) -> None:
        result = resolver._lookup_path("trigger.url")
        assert result == "https://api.example.com"

    def test_two_level_path(self, resolver: NamespaceResolver) -> None:
        result = resolver._lookup_path("node1.output.status")
        assert result == "ok"

    def test_three_level_path(self, resolver: NamespaceResolver) -> None:
        """Access list via dotted path on dict."""
        result = resolver._lookup_path("node1.output.items")
        assert result == [1, 2, 3]

    def test_missing_namespace_raises(self, resolver: NamespaceResolver) -> None:
        with pytest.raises(KeyError, match="Namespace"):
            resolver._lookup_path("unknown.field")

    def test_missing_key_in_namespace_raises(self, resolver: NamespaceResolver) -> None:
        with pytest.raises(KeyError):
            resolver._lookup_path("trigger.nonexistent")


# ---------------------------------------------------------------------------
# Loop namespace resolution via set_context
# ---------------------------------------------------------------------------


class TestLoopResolution:
    """Loop namespace resolution using set_context."""

    def test_loop_item_resolves_with_context(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("loop", {"my_loop": {"item": "apple", "index": 0}})
        r.set_context(loop_node_id="my_loop")
        assert r.resolve_value("${loop.item}") == "apple"

    def test_loop_index_resolves_with_context(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("loop", {"my_loop": {"item": "apple", "index": 2}})
        r.set_context(loop_node_id="my_loop")
        assert r.resolve_value("${loop.index}") == 2

    def test_loop_without_context_uses_direct_path(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("loop", {"item": "direct_value"})
        # No set_context → no rewrite, so loop.item resolves directly
        assert r.resolve_value("${loop.item}") == "direct_value"

    def test_loop_context_switching(self) -> None:
        r = NamespaceResolver()
        r.set_namespace(
            "loop",
            {
                "loop_a": {"item": "first"},
                "loop_b": {"item": "second"},
            },
        )
        r.set_context(loop_node_id="loop_a")
        assert r.resolve_value("${loop.item}") == "first"
        r.set_context(loop_node_id="loop_b")
        assert r.resolve_value("${loop.item}") == "second"

    def test_loop_in_resolve_dict(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("loop", {"lp": {"item": {"name": "test"}, "index": 0}})
        r.set_context(loop_node_id="lp")
        data: dict[str, Any] = {"current": "${loop.item}", "idx": "${loop.index}"}
        result = r.resolve_dict(data)
        assert result == {"current": {"name": "test"}, "idx": 0}


# ---------------------------------------------------------------------------
# Namespace management
# ---------------------------------------------------------------------------


class TestNamespaceManagement:
    """Tests for set_namespace, has_namespace, remove_namespace, get_namespace."""

    def test_has_namespace(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("ns", {"key": "val"})
        assert r.has_namespace("ns") is True
        assert r.has_namespace("other") is False

    def test_remove_namespace(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("ns", {"key": "val"})
        r.remove_namespace("ns")
        assert r.has_namespace("ns") is False

    def test_remove_nonexistent_namespace_no_error(self) -> None:
        r = NamespaceResolver()
        r.remove_namespace("nope")  # should not raise

    def test_get_namespace(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("ns", {"key": "val"})
        assert r.get_namespace("ns") == {"key": "val"}

    def test_get_nonexistent_namespace_raises(self) -> None:
        r = NamespaceResolver()
        with pytest.raises(KeyError):
            r.get_namespace("missing")

    def test_get_all_namespaces(self) -> None:
        r = NamespaceResolver()
        r.set_namespace("a", {"x": 1})
        r.set_namespace("b", {"y": 2})
        all_ns = r.get_all_namespaces()
        assert set(all_ns.keys()) == {"a", "b"}


# ---------------------------------------------------------------------------
# Edge cases and error paths
# ---------------------------------------------------------------------------


class TestNamespaceResolverEdgeCases:
    """Edge cases and unhappy paths for NamespaceResolver."""

    def test_namespace_only_resolution(self) -> None:
        """${trigger} with no dot returns the entire namespace dict."""
        r = NamespaceResolver()
        r.set_namespace("trigger", {"url": "http://test.com", "method": "GET"})
        result = r.resolve_value("${trigger}")
        assert result == {"url": "http://test.com", "method": "GET"}

    def test_resolve_value_empty_string(self) -> None:
        r = NamespaceResolver()
        assert r.resolve_value("") == ""

    def test_resolve_dict_preserves_non_template_types(self) -> None:
        """Non-string values (int, bool, None) pass through resolve_dict."""
        r = NamespaceResolver()
        data: dict[str, Any] = {"a": 42, "b": True, "c": None, "d": [1, 2]}
        result = r.resolve_dict(data)
        assert result == {"a": 42, "b": True, "c": None, "d": [1, 2]}

    def test_loop_context_reset_to_none(self) -> None:
        """Clearing loop context reverts to direct path resolution."""
        r = NamespaceResolver()
        r.set_namespace("loop", {"my_loop": {"item": "apple"}, "item": "direct"})
        r.set_context(loop_node_id="my_loop")
        assert r.resolve_value("${loop.item}") == "apple"
        r.set_context(loop_node_id=None)
        assert r.resolve_value("${loop.item}") == "direct"

    def test_missing_key_deep_in_path_raises(self) -> None:
        """KeyError when intermediate key is missing in a multi-level path."""
        r = NamespaceResolver()
        r.set_namespace("node", {"output": {"a": 1}})
        with pytest.raises(KeyError):
            r._lookup_path("node.output.nonexistent")

    def test_set_namespace_overwrites(self) -> None:
        """Setting the same namespace twice replaces the old data."""
        r = NamespaceResolver()
        r.set_namespace("ns", {"old": True})
        r.set_namespace("ns", {"new": True})
        assert r.get_namespace("ns") == {"new": True}
