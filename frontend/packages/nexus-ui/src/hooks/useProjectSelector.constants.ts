/** Internal `Select` / `SelectOption` value keys for the project picker (not API project IDs). */
export const ALL_PROJECTS_VALUE = '__all__'
export const CREATE_PROJECT_VALUE = '__create__'
export const VIEW_MORE_VALUE = '__view_more__'

/** IDs that represent actions/meta-items — not real projects, never favoritable. */
export const NON_PROJECT_VALUES = new Set([ALL_PROJECTS_VALUE, CREATE_PROJECT_VALUE, VIEW_MORE_VALUE])
