import { z } from 'zod'

export const assignRoleSchema = z
  .object({
    principalOrGroup: z.enum(['principal', 'group']),
    scope: z.enum(['system', 'project']),
    userId: z.string(),
    groupId: z.string(),
    projectId: z.string(),
    roleName: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.principalOrGroup === 'principal' && !data.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'User is required', path: ['userId'] })
    }
    if (data.principalOrGroup === 'group' && !data.groupId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Group is required', path: ['groupId'] })
    }
    if (data.scope === 'project' && !data.projectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Project is required', path: ['projectId'] })
    }
    if (!data.roleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Role is required', path: ['roleName'] })
    }
  })

export type AssignRoleFormData = z.infer<typeof assignRoleSchema>
