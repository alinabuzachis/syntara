/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer PatternFly text components (Content, HelperText, Title) over raw HTML elements for text content',
    },
    messages: {
      preferPfTextComponent:
        'Use PatternFly text components (Content, HelperText, Title) instead of raw <{{element}}>. See patternfly.org/components/content',
    },
    schema: [],
  },
  create(context) {
    const RAW_TEXT_ELEMENTS = new Set(['span', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

    /**
     * Check whether a JSX child node carries literal text content
     * (non-whitespace JSXText, or a string/template literal expression).
     */
    function isTextBearing(child) {
      if (child.type === 'JSXText') {
        return child.value.trim().length > 0
      }
      if (child.type === 'JSXExpressionContainer') {
        const { expression } = child
        return (
          (expression.type === 'Literal' && typeof expression.value === 'string') ||
          expression.type === 'TemplateLiteral'
        )
      }
      return false
    }

    /**
     * Check whether a JSX child is a nested JSX element.
     */
    function isJSXElement(child) {
      return child.type === 'JSXElement' || child.type === 'JSXFragment'
    }

    /**
     * Walk upward through JSXElement ancestors to see if the element
     * is nested inside a <Th> or <Td>.
     */
    function isInsideTableCell(node) {
      let current = node.parent
      while (current) {
        if (
          current.type === 'JSXElement' &&
          current.openingElement.name.type === 'JSXIdentifier'
        ) {
          const parentTag = current.openingElement.name.name
          if (parentTag === 'Th' || parentTag === 'Td') {
            return true
          }
        }
        current = current.parent
      }
      return false
    }

    /**
     * Check whether a JSXOpeningElement has a `style` attribute.
     */
    function hasStyleProp(openingElement) {
      return openingElement.attributes.some(
        (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'style',
      )
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return

        const tag = node.name.name
        if (!RAW_TEXT_ELEMENTS.has(tag)) return

        const jsxElement = node.parent
        if (!jsxElement || jsxElement.type !== 'JSXElement') return

        const children = jsxElement.children
        const hasTextChild = children.some(isTextBearing)

        // <p> and <h1>–<h6> should always be flagged — use Content or Title
        if (tag === 'p' || /^h[1-6]$/.test(tag)) {
          if (hasTextChild) {
            context.report({
              node,
              messageId: 'preferPfTextComponent',
              data: { element: tag },
            })
          }
          return
        }

        if (!hasTextChild) return

        // For <div>: only flag when it has a style prop (styled text instead of PF component)
        if (tag === 'div' && !hasStyleProp(node)) return

        // For <span>: skip if ALL children are only JSX elements (icon wrapper)
        if (tag === 'span') {
          const nonWhitespaceChildren = children.filter((child) => {
            if (child.type === 'JSXText') return child.value.trim().length > 0
            return true
          })
          if (nonWhitespaceChildren.length > 0 && nonWhitespaceChildren.every(isJSXElement)) return
        }

        // Exception: inside <Th>/<Td> without a style prop is fine
        if (isInsideTableCell(jsxElement) && !hasStyleProp(node)) return

        context.report({
          node,
          messageId: 'preferPfTextComponent',
          data: { element: tag },
        })
      },
    }
  },
}
