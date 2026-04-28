/** Name of the built-in administrators group as defined by the backend. */
export const BUILTIN_ADMINS_GROUP_NAME = 'admins'

/** Explanation shown when the admin toggle is disabled for the built-in admin. */
export const BUILTIN_ADMIN_TOGGLE_DISABLED_REASON =
  'Only the built-in administrator can disable their own account, and only when at least one other enabled user exists in the admins group.'

/** Explanation shown when disabling any admin would leave no enabled admins. */
export const LAST_ADMIN_TOGGLE_DISABLED_REASON =
  'This user cannot be disabled because they are the last enabled user in the admins group.'
