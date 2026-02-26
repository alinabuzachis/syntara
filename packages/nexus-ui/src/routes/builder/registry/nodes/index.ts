/**
 * Central registration point for all node types
 * Auto-discovers and registers all node types using import.meta.glob
 */

// Auto-discover all registration modules matching the pattern register*.ts
// Using eager: true to load them synchronously during app initialization
const nodeModules = import.meta.glob<{ default: () => void }>(['./register*.ts', '!./*.test.ts', '!./*.spec.ts'], {
  eager: true,
})

/**
 * Register all node types
 * Call this once during app initialization
 *
 * This function automatically discovers and registers all nodes
 * by importing any file matching the pattern register*.ts
 */
export function registerAllNodes() {
  // Iterate through all discovered modules and call their default export
  Object.entries(nodeModules).forEach(([path, module]) => {
    if (typeof module.default === 'function') {
      try {
        module.default()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to register node from ${path}:`, error)
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Module ${path} does not export a registration function as default`)
    }
  })

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`✓ Registered ${Object.keys(nodeModules).length} node types`)
  }
}
