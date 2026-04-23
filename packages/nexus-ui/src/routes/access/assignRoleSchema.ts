import { z } from 'zod'

/**
 * Flat form schema with conditional validation via superRefine.
 * All fields exist on the type so react-hook-form can register them
 * without unsafe `as` casts. Validation is applied conditionally
 * based on assignmentType.
 */
export const assignRoleSchema = z
  .object({
    assignmentType: z.enum(['user-project', 'group-project', 'user-system', 'group-system']),
    userId: z.string(),
    groupId: z.string(),
    projectId: z.string(),
    roleName: z.string(),
    systemRoleName: z.string(),
  })
  .superRefine((data, ctx) => {
    const isUser = data.assignmentType === 'user-project' || data.assignmentType === 'user-system'
    const isGroup = data.assignmentType === 'group-project' || data.assignmentType === 'group-system'
    const isProjectScoped = data.assignmentType === 'user-project' || data.assignmentType === 'group-project'

    if (isUser && !data.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'User ID is required', path: ['userId'] })
    }
    if (isGroup && !data.groupId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Group is required', path: ['groupId'] })
    }
    if (isProjectScoped && !data.projectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Project is required', path: ['projectId'] })
    }
    if (isProjectScoped && !data.roleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Role is required', path: ['roleName'] })
    }
    if (!isProjectScoped && !data.systemRoleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Role is required', path: ['systemRoleName'] })
    }
  })

export type AssignRoleFormData = z.infer<typeof assignRoleSchema>
