"""Tests for URL validation utilities (SSRF prevention)."""

import pytest

from nexus.core.lib.url_validation import validate_endpoint_url, validate_host_url


class TestValidateHostUrl:
    """Tests for validate_host_url()."""

    def test_valid_https_host(self) -> None:
        """Accept a standard HTTPS host URL."""
        assert validate_host_url("https://controller.example.com") == "https://controller.example.com"

    def test_valid_https_host_with_port(self) -> None:
        """Accept HTTPS host with non-default port."""
        assert validate_host_url("https://controller.example.com:8443") == "https://controller.example.com:8443"

    def test_trailing_slash_normalized(self) -> None:
        """Accept trailing slash and normalize it away."""
        assert validate_host_url("https://controller.example.com/") == "https://controller.example.com"

    def test_default_port_omitted(self) -> None:
        """Omit default port (443 for HTTPS) from normalized output."""
        assert validate_host_url("https://controller.example.com:443") == "https://controller.example.com"

    def test_http_rejected_by_default(self) -> None:
        """Reject HTTP scheme when allow_http is False."""
        with pytest.raises(ValueError, match="scheme must be https"):
            validate_host_url("http://controller.example.com")

    def test_http_accepted_when_allowed(self) -> None:
        """Accept HTTP scheme when allow_http is True."""
        assert validate_host_url("http://controller.example.com", allow_http=True) == "http://controller.example.com"

    def test_http_default_port_omitted(self) -> None:
        """Omit default port (80 for HTTP) from normalized output."""
        result = validate_host_url("http://controller.example.com:80", allow_http=True)
        assert result == "http://controller.example.com"

    def test_path_injection_rejected(self) -> None:
        """Reject URLs with path components (SSRF vector)."""
        with pytest.raises(ValueError, match="must not contain a path"):
            validate_host_url("https://controller.example.com/foo/bar/")

    def test_query_suffix_attack_rejected(self) -> None:
        """Reject the specific ?-suffix attack from AAP-74616."""
        with pytest.raises(ValueError, match="must not contain a path"):
            validate_host_url("https://attacker.example.com/foo/bar/?")

    def test_query_string_rejected(self) -> None:
        """Reject URLs with query strings."""
        with pytest.raises(ValueError, match="must not contain a query string"):
            validate_host_url("https://controller.example.com?x=1")

    def test_fragment_rejected(self) -> None:
        """Reject URLs with fragments."""
        with pytest.raises(ValueError, match="must not contain a fragment"):
            validate_host_url("https://controller.example.com#frag")

    def test_ftp_scheme_rejected(self) -> None:
        """Reject non-HTTP(S) schemes."""
        with pytest.raises(ValueError, match="scheme must be https"):
            validate_host_url("ftp://controller.example.com")

    def test_file_scheme_rejected(self) -> None:
        """Reject file:// scheme (local file access)."""
        with pytest.raises(ValueError, match="scheme must be https"):
            validate_host_url("file:///etc/passwd")

    def test_empty_hostname_rejected(self) -> None:
        """Reject URLs with empty hostname."""
        with pytest.raises(ValueError, match="must include a hostname"):
            validate_host_url("https://")

    def test_empty_string_rejected(self) -> None:
        """Reject empty string."""
        with pytest.raises(ValueError, match="must not be empty"):
            validate_host_url("")

    def test_no_scheme_rejected(self) -> None:
        """Reject URLs without a scheme."""
        with pytest.raises(ValueError, match="must include a scheme"):
            validate_host_url("not-a-url")

    def test_backslash_userinfo_bypass_rejected(self) -> None:
        """Reject backslash in authority (urlparse misparses hostname)."""
        with pytest.raises(ValueError, match=r"userinfo.*backslash"):
            validate_host_url("https://host\\@evil.com")

    def test_at_sign_userinfo_rejected(self) -> None:
        """Reject @ in authority (userinfo injection)."""
        with pytest.raises(ValueError, match=r"userinfo.*backslash"):
            validate_host_url("https://user:pass@evil.com")

    def test_url_encoded_path_stays_in_hostname(self) -> None:
        """URL-encoded %2f stays in hostname (not decoded to path separator)."""
        result = validate_host_url("https://example.com%2ffoo")
        assert result == "https://example.com%2ffoo"

    def test_ipv4_address_accepted(self) -> None:
        """Accept IPv4 address as hostname."""
        assert validate_host_url("https://192.168.1.1") == "https://192.168.1.1"

    def test_ipv4_with_port_accepted(self) -> None:
        """Accept IPv4 address with non-default port."""
        assert validate_host_url("https://10.0.0.1:8443") == "https://10.0.0.1:8443"

    def test_ipv6_address_accepted(self) -> None:
        """Accept IPv6 address in bracket notation."""
        assert validate_host_url("https://[::1]") == "https://[::1]"

    def test_ipv6_with_port_accepted(self) -> None:
        """Accept IPv6 address with port, preserving RFC 3986 brackets."""
        assert validate_host_url("https://[2001:db8::1]:8443") == "https://[2001:db8::1]:8443"


class TestValidateEndpointUrl:
    """Tests for validate_endpoint_url() — allows paths, rejects query/fragment/userinfo."""

    def test_endpoint_with_path(self) -> None:
        """Accept endpoint URL with path (e.g., MCP servers at /mcp)."""
        assert validate_endpoint_url("http://localhost:8765/mcp", allow_http=True) == "http://localhost:8765/mcp"

    def test_endpoint_without_path(self) -> None:
        """Accept endpoint URL without path."""
        assert validate_endpoint_url("https://api.example.com", allow_http=False) == "https://api.example.com"

    def test_trailing_slash_preserved(self) -> None:
        """Trailing slash is preserved (not normalized away)."""
        assert validate_endpoint_url("http://localhost:8080/", allow_http=True) == "http://localhost:8080/"

    def test_nested_path_accepted(self) -> None:
        """Accept nested paths."""
        assert validate_endpoint_url("http://host:8000/api/v1/mcp", allow_http=True) == "http://host:8000/api/v1/mcp"

    def test_rejects_query_string(self) -> None:
        """Reject URLs with query strings."""
        with pytest.raises(ValueError, match="must not contain a query string"):
            validate_endpoint_url("http://localhost:8080/mcp?key=val", allow_http=True)

    def test_rejects_fragment(self) -> None:
        """Reject URLs with fragments."""
        with pytest.raises(ValueError, match="must not contain a fragment"):
            validate_endpoint_url("http://localhost:8080/mcp#section", allow_http=True)

    def test_rejects_userinfo(self) -> None:
        """Reject URLs with userinfo (@)."""
        with pytest.raises(ValueError, match="must not contain userinfo"):
            validate_endpoint_url("http://user:pass@localhost:8080/mcp", allow_http=True)

    def test_http_allowed_with_flag(self) -> None:
        """HTTP scheme accepted when allow_http=True."""
        assert validate_endpoint_url("http://localhost:8080", allow_http=True) == "http://localhost:8080"

    def test_http_rejected_by_default(self) -> None:
        """HTTP scheme rejected when allow_http=False (default)."""
        with pytest.raises(ValueError, match="scheme must be"):
            validate_endpoint_url("http://localhost:8080")

    def test_empty_url_rejected(self) -> None:
        """Empty URL is rejected."""
        with pytest.raises(ValueError, match="must not be empty"):
            validate_endpoint_url("")

    def test_missing_scheme_rejected(self) -> None:
        """URL without proper scheme is rejected."""
        with pytest.raises(ValueError, match="scheme must be"):
            validate_endpoint_url("localhost:8080")

    def test_missing_hostname_rejected(self) -> None:
        """URL without hostname is rejected."""
        with pytest.raises(ValueError, match="must include a hostname"):
            validate_endpoint_url("http:///path", allow_http=True)
