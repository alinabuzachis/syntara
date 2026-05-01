# Library References

**Before writing code that uses any library listed below that provides an `llms.txt`, fetch it and use it as your primary reference for current APIs and patterns.** These files are maintained by each project and reflect their latest stable documentation. Do not rely on training-data knowledge alone — APIs change across major versions. Verify that the documentation is accurate and consistent with the code being reviewed.

This is especially critical for:
- **React 19** — hooks, compiler, and concurrent features changed significantly from v18
- **Zod v4** — schema API has breaking changes from v3
- **Zustand v5** — store creation and middleware API changed from v4

## Libraries with `llms.txt`

| Library | Role in this project | Action |
|---------|---------------------|--------|
| **React** | UI rendering, hooks | Fetch https://react.dev/llms.txt before writing any React code |
| **Zod** | Schema validation + react-hook-form resolver | Fetch https://zod.dev/llms.txt before writing any Zod schema |
| **Zustand** | Global state (workflow store, builder) | Fetch https://zustand.docs.pmnd.rs/llms.txt before touching any store |
| **Vitest** | Unit and component test runner | Fetch https://vitest.dev/llms.txt before writing or configuring tests |
| **Vite** | Dev server and build tool | Fetch https://vite.dev/llms.txt before modifying build config |
| **TanStack Query** | Server state / data fetching | Fetch https://tanstack.com/llms.txt (see "TanStack Query" section) before writing queries or mutations |

## Libraries without `llms.txt` (use official docs instead)

| Library | Docs |
|---------|------|
| **TypeScript** | https://www.typescriptlang.org/docs/ |
| **React Hook Form** | https://react-hook-form.com/docs |
| **Testing Library** | https://testing-library.com/docs/ |
| **Playwright** | https://playwright.dev/docs/intro |
| **PatternFly** | https://www.patternfly.org/components/all-components/ |
| **openapi-fetch** | https://openapi-ts.dev/openapi-fetch/ |
