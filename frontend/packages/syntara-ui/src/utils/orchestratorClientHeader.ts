/** Header name sent by the Syntara UI so backend metrics can distinguish UI from API traffic. */
export const ORCHESTRATOR_CLIENT_HEADER = 'X-Orchestrator-Client' as const

/** Header value identifying a request as originating from the Syntara UI. */
export const ORCHESTRATOR_CLIENT_UI_VALUE = 'ui' as const

/** Plain-object headers marking the caller as the Syntara UI (for raw fetch call sites). */
export function orchestratorUiClientHeaders(): Record<string, string> {
  return { [ORCHESTRATOR_CLIENT_HEADER]: ORCHESTRATOR_CLIENT_UI_VALUE }
}

/** Set the UI client header on a Request/Headers instance. */
export function applyOrchestratorUiClientHeader(headers: Headers): void {
  headers.set(ORCHESTRATOR_CLIENT_HEADER, ORCHESTRATOR_CLIENT_UI_VALUE)
}
