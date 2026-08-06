/** Help popover body text for identity provider form fields. */

export const PROVIDER_TEMPLATE_HELP =
  'Pre-configured defaults for common identity providers. A template fills in scopes, claim mapping, and group extraction. Choose Custom to configure every setting manually.'

export const SUBJECT_CLAIM_HELP =
  'The OIDC claim that uniquely identifies the user (commonly sub). Federated identities are keyed on this value together with the issuer URL. Wrong mapping can block login or link the wrong account.'

export const EMAIL_CLAIM_HELP =
  'Maps an IdP claim name to the email field (commonly email). Providers differ. For example, Azure AD often uses mail or upn instead of email.'

export const GROUP_EXTRACTION_EXPRESSION_HELP =
  'JMESPath expression run against ID token claims to extract group values (e.g. groups[*] or realm_access.roles[*]). Invalid expressions are rejected when you save; runtime failures deny login rather than silently clearing groups.'

export const IDP_GROUP_VALUE_HELP =
  'Group name or role from the identity provider token to match against. Supports glob wildcards (e.g. admin*, */engineers). A bare * matches any value, including an empty group list.'

export const GROUP_HELP =
  'Local group assigned when the IdP group value matches. Group membership drives role assignments and permissions after login. Manually assigned groups are not changed by IdP sync.'
