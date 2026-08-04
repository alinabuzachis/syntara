// @currents/playwright exports lack `types` conditions in package.json,
// so moduleResolution:"bundler" cannot resolve them.  Re-declare the
// two symbols the project actually imports.
declare module '@currents/playwright' {
  export type CurrentsConfig = {
    projectId: string
    recordKey: string
    [key: string]: unknown
  }
  export function currentsReporter(config?: CurrentsConfig): [string, CurrentsConfig]
}
