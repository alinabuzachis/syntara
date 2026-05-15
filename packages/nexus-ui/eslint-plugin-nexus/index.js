import preferConfirmationDialog from './rules/prefer-confirmation-dialog.js'
import preferPfListComponents from './rules/prefer-pf-list-components.js'
import preferPfTextComponents from './rules/prefer-pf-text-components.js'
import useDesignTokensNotHardcoded from './rules/use-design-tokens-not-hardcoded.js'

/** @type {import('eslint').ESLint.Plugin} */
export default {
  meta: { name: 'eslint-plugin-nexus', version: '0.1.0' },
  rules: {
    'prefer-confirmation-dialog': preferConfirmationDialog,
    'prefer-pf-list-components': preferPfListComponents,
    'prefer-pf-text-components': preferPfTextComponents,
    'use-design-tokens-not-hardcoded': useDesignTokensNotHardcoded,
  },
}
