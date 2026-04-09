import { z } from 'zod'

const optionalUrl = z.string().url('Must be a valid URL').or(z.literal(''))

/**
 * The OIDC callback is always handled by the Nexus backend at this fixed path.
 * In dev the backend runs on a different port (VITE_API_URL), while in production
 * the frontend and backend share the same origin.
 */
const rawApiUrl = import.meta.env.VITE_API_URL as string | undefined
const backendOrigin = rawApiUrl ? new URL(rawApiUrl).origin : globalThis.location.origin
export const OIDC_REDIRECT_URI = `${backendOrigin}/api/v1/auth/oidc/callback`

const baseFields = {
  name: z.string().min(1, 'Provider name is required'),
  enabled: z.boolean(),
  autoDiscovery: z.boolean(),
  issuerUrl: z
    .string()
    .min(1, 'Issuer URL is required')
    .url('Issuer URL must be a valid URL')
    .transform((url) => {
      let end = url.length
      while (end > 0 && url[end - 1] === '/') end--
      return url.slice(0, end)
    }),
  clientId: z.string().min(1, 'Client ID is required'),
  scopes: z.string().min(1, 'Scopes are required'),
  // Manual endpoint fields (required when autoDiscovery is off)
  authorizationEndpoint: optionalUrl,
  tokenEndpoint: optionalUrl,
  jwksUri: optionalUrl,
  userinfoEndpoint: optionalUrl,
}

const manualEndpointRefinement = (
  data: { autoDiscovery: boolean; authorizationEndpoint: string; tokenEndpoint: string; jwksUri: string },
  ctx: z.RefinementCtx
) => {
  if (!data.autoDiscovery) {
    if (!data.authorizationEndpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required when auto-discovery is disabled',
        path: ['authorizationEndpoint'],
      })
    }
    if (!data.tokenEndpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required when auto-discovery is disabled',
        path: ['tokenEndpoint'],
      })
    }
    if (!data.jwksUri) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required when auto-discovery is disabled',
        path: ['jwksUri'],
      })
    }
  }
}

export const identityProviderAddSchema = z
  .object({
    ...baseFields,
    clientSecret: z.string().min(1, 'Client Secret is required'),
  })
  .superRefine(manualEndpointRefinement)

export const identityProviderEditSchema = z
  .object({
    ...baseFields,
    clientSecret: z.string(),
  })
  .superRefine(manualEndpointRefinement)

export type IdentityProviderFormData = z.infer<typeof identityProviderAddSchema>

export const identityProviderDefaults: IdentityProviderFormData = {
  name: '',
  enabled: false,
  autoDiscovery: true,
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid profile email',
  authorizationEndpoint: '',
  tokenEndpoint: '',
  jwksUri: '',
  userinfoEndpoint: '',
}
