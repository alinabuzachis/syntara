"""Temporal SDK test helpers.

Centralizes access to internal Temporal types so that tests depend on
one stable import path instead of reaching into private SDK internals
directly. If the SDK renames or relocates these types, only this module
needs updating.
"""

from temporalio.activity import _CompleteAsyncError

# The exception raised by activity.raise_complete_async().
# Used in tests as: ``pytest.raises(CompleteAsyncError)``
CompleteAsyncError: type[BaseException] = _CompleteAsyncError
