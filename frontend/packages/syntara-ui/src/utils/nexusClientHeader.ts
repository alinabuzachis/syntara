/** Header name sent by the Syntara UI so backend metrics can distinguish UI from API traffic. */
export const NEXUS_CLIENT_HEADER = 'X-Nexus-Client' as const

/** Header value identifying a request as originating from the Syntara UI. */
export const NEXUS_CLIENT_UI_VALUE = 'ui' as const

/** Plain-object headers marking the caller as the Syntara UI (for raw fetch call sites). */
export function nexusUiClientHeaders(): Record<string, string> {
  return { [NEXUS_CLIENT_HEADER]: NEXUS_CLIENT_UI_VALUE }
}

/** Set the UI client header on a Request/Headers instance. */
export function applyNexusUiClientHeader(headers: Headers): void {
  headers.set(NEXUS_CLIENT_HEADER, NEXUS_CLIENT_UI_VALUE)
}
