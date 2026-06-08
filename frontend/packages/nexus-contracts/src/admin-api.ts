/**
 * Admin API types for token revocation endpoints.
 *
 * These types mirror the structure that `openapi-typescript` would generate
 * from the backend admin OpenAPI spec. Once the spec is available, regenerate
 * with `npm run gen:admin` and replace this file.
 */

export interface paths {
  '/admin/revocation': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * Get global revocation timestamp
     * @description Retrieve the current global token revocation timestamp.
     *     Tokens issued before this timestamp are considered revoked.
     */
    get: operations['get_global_revocation']
    put?: never
    /**
     * Revoke all tokens globally
     * @description Set or update the global revocation timestamp, invalidating
     *     all tokens issued before the current time.
     */
    post: operations['revoke_global']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/admin/revocation/users/{username}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Revoke tokens for a specific user
     * @description Invalidate all active tokens for the specified user.
     */
    post: operations['revoke_user_tokens']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/admin/revocation/identity-providers/{idp_name}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * Revoke tokens for a specific identity provider
     * @description Invalidate all active tokens for users authenticated via
     *     the specified identity provider.
     */
    post: operations['revoke_idp_tokens']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
}

export type webhooks = Record<string, never>

export interface components {
  schemas: {
    /** Global revocation timestamp read model */
    GlobalRevocationTimestampRead: {
      /** @description ISO 8601 datetime before which all tokens are revoked */
      revoked_before: string | null
      /** @description ISO 8601 datetime when the revocation timestamp was last updated */
      updated_at: string | null
    }
    /** Response returned after a revocation action */
    RevocationResponse: {
      /** @description Human-readable message describing the result */
      message: string
    }
    /** RFC 9457 error response */
    ErrorResponse: {
      type?: string
      title?: string
      status?: number
      detail?: string
    }
  }
  responses: never
  parameters: never
  requestBodies: never
  headers: never
  pathItems: never
}

export type $defs = Record<string, never>

export interface operations {
  get_global_revocation: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Current global revocation timestamp */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['GlobalRevocationTimestampRead']
        }
      }
    }
  }
  revoke_global: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description Tokens revoked successfully */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['RevocationResponse']
        }
      }
      /** @description Forbidden */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorResponse']
        }
      }
    }
  }
  revoke_user_tokens: {
    parameters: {
      query?: never
      header?: never
      path: {
        username: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description User tokens revoked successfully */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['RevocationResponse']
        }
      }
      /** @description Forbidden */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorResponse']
        }
      }
      /** @description User not found */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorResponse']
        }
      }
    }
  }
  revoke_idp_tokens: {
    parameters: {
      query?: never
      header?: never
      path: {
        idp_name: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description IDP tokens revoked successfully */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['RevocationResponse']
        }
      }
      /** @description Forbidden */
      403: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorResponse']
        }
      }
      /** @description Identity provider not found */
      404: {
        headers: {
          [name: string]: unknown
        }
        content: {
          'application/json': components['schemas']['ErrorResponse']
        }
      }
    }
  }
}
