type AuthErrorResult = { message: string; isLogoutFailure: boolean }

const AUTH_ERROR_CODE_MESSAGES: Record<string, AuthErrorResult> = {
  missing_code: { message: 'Missing authorization code', isLogoutFailure: false },
  state_expired: { message: 'Login session expired. Please try again.', isLogoutFailure: false },
  provider_unavailable: { message: 'Identity provider not available', isLogoutFailure: false },
  discovery_failed: { message: 'Failed to connect to identity provider', isLogoutFailure: false },
  auth_failed: { message: 'Authentication failed. Please try again.', isLogoutFailure: false },
  user_failed: { message: 'Unable to sign in. Contact your administrator.', isLogoutFailure: false },
  tls_verify_failed: {
    message:
      'TLS certificate verification failed. If the provider uses a self-signed certificate, enable "Skip TLS certificate verification" in the identity provider settings.',
    isLogoutFailure: false,
  },
  no_group_match: {
    message:
      'Access denied. Your identity provider groups do not match any configured group mappings. Contact your administrator.',
    isLogoutFailure: false,
  },
  idp_logout_failed: {
    message: 'Logged out successfully, but could not log out of the identity provider.',
    isLogoutFailure: true,
  },
}

const DEFAULT_AUTH_ERROR: AuthErrorResult = {
  message: 'Authentication failed. Please try again.',
  isLogoutFailure: false,
}

export function resolveAuthError(raw: string): AuthErrorResult {
  return AUTH_ERROR_CODE_MESSAGES[raw] ?? DEFAULT_AUTH_ERROR
}

const LINK_ERROR_CODE_MESSAGES: Record<string, string> = {
  link_failed: 'Failed to link identity. Please try again.',
  identity_already_linked: 'This identity is already linked to another user.',
}

const DEFAULT_LINK_ERROR = 'Failed to link identity. Please try again.'

export function resolveLinkError(raw: string): string {
  return LINK_ERROR_CODE_MESSAGES[raw] ?? DEFAULT_LINK_ERROR
}
