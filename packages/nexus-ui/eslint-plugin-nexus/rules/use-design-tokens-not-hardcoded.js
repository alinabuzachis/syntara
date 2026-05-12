/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer PatternFly design tokens over hardcoded px/rem spacing and hardcoded color values in inline styles',
    },
    messages: {
      hardcodedSpacing:
        "Use a PatternFly design token (e.g., var(--pf-t--global--spacer--md)) instead of hardcoded '{{value}}' for {{property}}.",
      hardcodedColor:
        "Use a PatternFly design token (e.g., var(--pf-t--global--color--*)) instead of hardcoded '{{value}}' for {{property}}.",
    },
    schema: [],
  },
  create(context) {
    const SPACING_PROPERTIES = new Set([
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'margin',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'gap',
      'rowGap',
      'columnGap',
      'top',
      'right',
      'bottom',
      'left',
      'inset',
      'borderRadius',
    ])

    /** Layout-constraint properties that are intentionally skipped. */
    const LAYOUT_PROPERTIES = new Set([
      'width',
      'height',
      'maxWidth',
      'maxHeight',
      'minWidth',
      'minHeight',
      'flex',
    ])

    const HARDCODED_SPACING_RE = /\d+\.?\d*px|\d+\.?\d*rem/
    const RELATIVE_UNIT_RE = /(?:ch|vh|vw|%|em)/
    const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}/
    const RGB_COLOR_RE = /^rgba?\(/

    /**
     * Resolve the property key name from a Property node.
     * Handles both `Identifier` keys and `Literal` string keys.
     */
    function getPropertyName(prop) {
      if (prop.key.type === 'Identifier') return prop.key.name
      if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value
      return null
    }

    /**
     * Return the raw string value of a Literal node, or null.
     */
    function getStringValue(node) {
      if (node && node.type === 'Literal' && typeof node.value === 'string') {
        return node.value
      }
      return null
    }

    /**
     * Check whether a string value references a PF design token.
     */
    function usesPfToken(value) {
      return value.includes('var(--pf-')
    }

    /**
     * Check whether a value is effectively zero.
     */
    function isZero(node) {
      if (node.type === 'Literal') {
        return node.value === 0 || node.value === '0'
      }
      return false
    }

    /**
     * Check whether a string value is a negative offset (layout positioning).
     */
    function isNegativeOffset(value) {
      return typeof value === 'string' && value.startsWith('-')
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return

        const valueNode = node.value
        if (!valueNode || valueNode.type !== 'JSXExpressionContainer') return

        const expression = valueNode.expression
        if (!expression || expression.type !== 'ObjectExpression') return

        for (const prop of expression.properties) {
          // Skip spread elements
          if (prop.type !== 'Property') continue

          const propertyName = getPropertyName(prop)
          if (!propertyName) continue

          // Skip layout-constraint properties entirely
          if (LAYOUT_PROPERTIES.has(propertyName)) continue

          // Skip zero values and negative offsets (layout positioning)
          if (isZero(prop.value)) continue
          if (getStringValue(prop.value) !== null && isNegativeOffset(getStringValue(prop.value))) continue

          const stringValue = getStringValue(prop.value)

          // --- Spacing check ---
          if (SPACING_PROPERTIES.has(propertyName)) {
            if (stringValue !== null) {
              if (usesPfToken(stringValue)) continue
              if (HARDCODED_SPACING_RE.test(stringValue)) {
                context.report({
                  node: prop,
                  messageId: 'hardcodedSpacing',
                  data: { value: stringValue, property: propertyName },
                })
                continue
              }
              if (RELATIVE_UNIT_RE.test(stringValue)) continue
            }

            // Also catch bare numeric literals (React treats numbers as px)
            if (prop.value.type === 'Literal' && typeof prop.value.value === 'number') {
              context.report({
                node: prop,
                messageId: 'hardcodedSpacing',
                data: { value: `${prop.value.value}px`, property: propertyName },
              })
              continue
            }
          }

          // --- Color check (applies to any property) ---
          if (stringValue !== null) {
            if (usesPfToken(stringValue)) continue
            if (HEX_COLOR_RE.test(stringValue) || RGB_COLOR_RE.test(stringValue)) {
              context.report({
                node: prop,
                messageId: 'hardcodedColor',
                data: { value: stringValue, property: propertyName },
              })
            }
          }
        }
      },
    }
  },
}
