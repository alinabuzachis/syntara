import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-mcp'],
  framework: '@storybook/react-vite',
  core: {
    disableTelemetry: true,
  },
  features: {
    sidebarOnboardingChecklist: false,
  },
  // Storybook runs its own Vite instance and does not inherit server.watch from vite.config.ts,
  // so coverage report writes would trigger spurious page reloads without this.
  // strictPort prevents Vite from silently moving to another port if 5174 is already in use —
  // port 5174 is fixed in CLAUDE.md (Storybook + MCP server) and referenced in docs.
  viteFinal(config) {
    return mergeConfig(config, {
      server: {
        strictPort: true,
        watch: {
          ignored: ['**/coverage/**'],
        },
      },
    })
  },
}
export default config
