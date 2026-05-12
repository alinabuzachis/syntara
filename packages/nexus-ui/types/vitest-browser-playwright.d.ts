// @vitest/browser-playwright is an optional peer dep that may not be installed.
// Declare a minimal module shape so tsc and ESLint can parse vitest.browser.config.ts.
declare module '@vitest/browser-playwright' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const playwright: any
}
