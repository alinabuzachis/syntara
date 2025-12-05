"""WebSocket close code constants.

Standard WebSocket close codes as defined in RFC 6455.
"""

# Normal closure - successful operation
NORMAL_CLOSURE = 1000

# Unsupported data - endpoint received data it cannot accept
UNSUPPORTED_DATA = 1003

# Policy violation - endpoint terminated connection due to policy
POLICY_VIOLATION = 1008

# Internal error - endpoint encountered unexpected condition
INTERNAL_ERROR = 1011
