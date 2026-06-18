/**
 * Converts a wouter-style path pattern to a TanStack Router path pattern.
 *
 * - `:param` → `$param`
 * - `:param?` (optional) → `$param` (TanStack uses a separate route for the base path instead)
 *
 * Example: `/users/:userId/groups/:groupId` → `/users/$userId/groups/$groupId`
 */
export function convertWouterPathToTanStack(path: string): string {
  return path.replace(/:(\w+)\??/g, '$$$1')
}
