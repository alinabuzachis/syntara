/**
 * Central registration point for all workflow step types (Add step panel).
 * Auto-discovers registration modules using import.meta.glob (each maps to React Flow node components).
 */

// Auto-discover all registration modules matching the pattern register*.ts
// Using eager: true to load them synchronously during app initialization
const nodeModules = import.meta.glob<{ default: () => void }>(['./register*.ts', '!./*.test.ts', '!./*.spec.ts'], {
  eager: true,
})

/**
 * Register all workflow step types
 * Call this once during app initialization
 *
 * Discovers and registers every `register*.ts` module (each defines a canvas step type for the builder).
 */
export function registerAllNodes() {
  // Iterate through all discovered modules and call their default export
  Object.entries(nodeModules).forEach(([path, module]) => {
    if (typeof module.default === 'function') {
      try {
        module.default()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to register step type from ${path}:`, error)
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Module ${path} does not export a registration function as default`)
    }
  })

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`✓ Registered ${Object.keys(nodeModules).length} workflow step types`)
  }
}
