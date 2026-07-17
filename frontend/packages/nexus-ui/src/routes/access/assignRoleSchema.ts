import { z } from 'zod'

import { RolePrincipalType } from '../access-management/RoleAssignmentTypes'

const principalTypeValues = Object.values(RolePrincipalType) as [RolePrincipalType, ...RolePrincipalType[]]

export const assignRoleSchema = z
  .object({
    principalType: z.enum(principalTypeValues),
    scope: z.enum(['system', 'project']),
    userId: z.string(),
    groupId: z.string(),
    serviceAccountId: z.string(),
    projectId: z.string(),
    roleName: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.principalType === RolePrincipalType.USER && !data.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'User is required', path: ['userId'] })
    }
    if (data.principalType === RolePrincipalType.GROUP && !data.groupId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Group is required', path: ['groupId'] })
    }
    if (data.principalType === RolePrincipalType.SERVICE_ACCOUNT && !data.serviceAccountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Service account is required', path: ['serviceAccountId'] })
    }
    if (data.scope === 'project' && !data.projectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Project is required', path: ['projectId'] })
    }
    if (!data.roleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Role is required', path: ['roleName'] })
    }
  })

export type AssignRoleFormData = z.infer<typeof assignRoleSchema>
