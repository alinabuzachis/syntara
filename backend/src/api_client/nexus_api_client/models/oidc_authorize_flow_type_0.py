from enum import Enum


class OidcAuthorizeFlowType0(str, Enum):
    LINK = "link"
    TEST_SIGNIN = "test_signin"

    def __str__(self) -> str:
        return str(self.value)
