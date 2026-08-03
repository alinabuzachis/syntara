/** Help popover body text for access control and authorization diagnostic form fields. */

export const RESOURCE_TYPE_HELP =
  'Resource type for the check (e.g. workflow, credential, approval). Every authorization decision is whether an action is allowed on a resource type.'

export const ACTION_HELP =
  'Action to check (read, create, delete, etc.). Policies use resource_type:action strings; wildcards such as workflow:* are supported.'

export const PROJECT_HELP =
  'Optional project context. Project-scoped policies apply only when the resource belongs to this project; global assignments use a null project_id.'

export const RESOURCE_ID_HELP =
  'Optional resource ID for attribute-based checks. Some policies use self scope (own resources) or conditions on resource metadata and labels.'
