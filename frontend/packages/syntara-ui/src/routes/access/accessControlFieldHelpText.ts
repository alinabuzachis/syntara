/** Help popover body text for access control form fields. */

export const RESOURCE_TYPE_HELP =
  'Resource type for the check (e.g. workflow, credential, approval). Every authorization decision is whether an action is allowed on a resource type.'

export const ACTION_HELP =
  'Action to check (read, create, delete, etc.). Policies use resource_type:action strings; wildcards such as workflow:* are supported.'

export const PROJECT_HELP =
  'Optional project context. Project-scoped policies apply only when the resource belongs to this project; global assignments use a null project_id.'

export const RESOURCE_ID_HELP =
  'Optional resource ID for attribute-based checks. Some policies use self scope (own resources) or conditions on resource metadata and labels.'

export const SCOPE_HELP =
  'System-scoped roles apply globally, across every project. Project-scoped roles grant permissions only within the selected project.'

export const POLICIES_HELP =
  'Policies contain allow or deny rules for specific resources and actions. A role bundles one or more policies. Deny rules are evaluated first and override allow; anything not explicitly allowed is denied by default.'

export const PRINCIPAL_TYPE_HELP =
  'Who receives the role: a user (direct), a group (all members), or a service account (programmatic access).'

export const ROLE_HELP =
  'Role to assign. The principal receives every policy in this role for the chosen scope (system-wide or a single project). Built-in roles are provided by the platform; custom roles are ones you create.'
