"""URL validation utilities for SSRF prevention.

Ensures host URLs contain only scheme, hostname, and optional port.
"""

from __future__ import annotations

from urllib.parse import ParseResult, urlparse

_ALLOWED_SCHEMES = frozenset({"https", "http"})
_HTTPS_ONLY = frozenset({"https"})
_DEFAULT_PORTS: dict[str, int] = {"https": 443, "http": 80}


def _check_disallowed_components(parsed: ParseResult) -> None:
    """Raise ValueError if the parsed URL contains paths, query strings, fragments, or userinfo."""
    if "@" in parsed.netloc or "\\" in parsed.netloc:
        msg = "Host URL must not contain userinfo (@) or backslash characters."
        raise ValueError(msg)

    if parsed.path and parsed.path != "/":
        msg = (
            "Host URL must not contain a path. Use only scheme://hostname[:port], e.g., https://controller.example.com"
        )
        raise ValueError(msg)

    if parsed.query:
        msg = "Host URL must not contain a query string."
        raise ValueError(msg)

    if parsed.fragment:
        msg = "Host URL must not contain a fragment."
        raise ValueError(msg)


def _normalize_host(parsed: ParseResult) -> str:
    """Build normalized scheme://host[:port] from parsed URL, re-adding IPv6 brackets."""
    hostname = parsed.hostname or ""
    host = f"[{hostname}]" if ":" in hostname else hostname
    port = parsed.port
    if port and port != _DEFAULT_PORTS.get(parsed.scheme):
        return f"{parsed.scheme}://{host}:{port}"
    return f"{parsed.scheme}://{host}"


def validate_host_url(url: str, *, allow_http: bool = False) -> str:
    """Validate and normalize a host URL to scheme://hostname[:port].

    Rejects URLs containing paths, query strings, or fragments to prevent
    SSRF via URL path injection.

    Args:
        url: The URL to validate.
        allow_http: If True, allow http:// scheme. Default requires https://.

    Returns:
        Normalized URL as ``scheme://hostname[:port]`` (port omitted if default).

    Raises:
        ValueError: If the URL contains disallowed components or an invalid scheme.

    """
    url = url.strip() if url else ""
    if not url:
        msg = "Host URL must not be empty."
        raise ValueError(msg)

    parsed = urlparse(url)

    if not parsed.scheme:
        msg = f"Host URL must include a scheme (e.g., https://). Got: '{url}'"
        raise ValueError(msg)

    allowed = _ALLOWED_SCHEMES if allow_http else _HTTPS_ONLY
    if parsed.scheme not in allowed:
        schemes = ", ".join(sorted(allowed))
        msg = f"Host URL scheme must be {schemes}. Got: '{parsed.scheme}'"
        raise ValueError(msg)

    if not parsed.hostname:
        msg = "Host URL must include a hostname."
        raise ValueError(msg)

    _check_disallowed_components(parsed)

    return _normalize_host(parsed)
