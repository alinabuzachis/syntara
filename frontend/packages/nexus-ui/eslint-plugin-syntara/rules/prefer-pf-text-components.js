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

    const EXPRESSION_TYPES_THAT_MAY_CARRY_TEXT = new Set([
      'Identifier',
      'CallExpression',
      'MemberExpression',
      'ConditionalExpression',
      'LogicalExpression',
      'BinaryExpression',
      'ChainExpression',
    ])

    const TEXT_STYLING_PROPERTIES = new Set([
      'color',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'fontFamily',
      'fontVariant',
      'textDecoration',
      'textTransform',
      'textAlign',
      'textIndent',
      'textShadow',
      'textOverflow',
      'whiteSpace',
      'wordBreak',
      'wordSpacing',
      'wordWrap',
      'lineHeight',
      'letterSpacing',
      'verticalAlign',
    ])

    /**
     * Check whether a JSX child carries literal text (non-whitespace JSXText,
     * string literal, or template literal expression).
     */
    function hasLiteralText(child) {
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
     * Check whether an expression is `children` or `props.children` --
     * React composition patterns that carry JSX elements, not text.
     */
    function isReactChildrenExpression(expression) {
      if (expression.type === 'Identifier' && expression.name === 'children') return true
      if (
        expression.type === 'MemberExpression' &&
        expression.object.type === 'Identifier' &&
        expression.object.name === 'props' &&
        expression.property.type === 'Identifier' &&
        expression.property.name === 'children'
      ) {
        return true
      }
      return false
    }

    /**
     * Check whether a JSX child carries any dynamic content that likely
     * resolves to text (variables, function calls, member access, ternaries).
     */
    function hasDynamicContent(child) {
      if (child.type === 'JSXExpressionContainer') {
        return EXPRESSION_TYPES_THAT_MAY_CARRY_TEXT.has(child.expression.type)
      }
      return false
    }

    /**
     * Check whether ALL dynamic children are React children patterns
     * (`children` or `props.children`).
     */
    function allDynamicChildrenAreReactChildren(children) {
      return children
        .filter((child) => child.type === 'JSXExpressionContainer' && hasDynamicContent(child))
        .every((child) => isReactChildrenExpression(child.expression))
    }

    /**
     * Check whether a JSX child node carries text content -- either literal
     * text or dynamic expressions that likely resolve to text.
     */
    function isTextBearing(child) {
      return hasLiteralText(child) || hasDynamicContent(child)
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
        if (current.type === 'JSXElement' && current.openingElement.name.type === 'JSXIdentifier') {
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
     * Check whether a span is a screen-reader-only element (className includes
     * "pf-v6-u-screen-reader"). This is an intentional a11y pattern — not a
     * text presentation choice — and should not be flagged.
     */
    function isScreenReaderSpan(openingElement) {
      return openingElement.attributes.some((attr) => {
        if (attr.type !== 'JSXAttribute' || attr.name.name !== 'className') return false
        const { value } = attr
        if (value && value.type === 'Literal' && typeof value.value === 'string') {
          return value.value.split(' ').includes('pf-v6-u-screen-reader')
        }
        return false
      })
    }

    /**
     * Check whether a JSXOpeningElement has a `style` attribute.
     */
    function hasStyleProp(openingElement) {
      return openingElement.attributes.some((attr) => attr.type === 'JSXAttribute' && attr.name.name === 'style')
    }

    /**
     * Check whether a style attribute's value is an inspectable inline
     * ObjectExpression that contains text-styling properties (color,
     * fontSize, fontWeight, etc.). Returns true when text-styling is
     * detected or when the style value cannot be inspected (variable
     * reference, spread elements). Returns false when the style is an
     * inline object with only layout/positioning properties.
     */
    function styleHasTextProperties(openingElement) {
      const styleAttr = openingElement.attributes.find(
        (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'style'
      )
      if (!styleAttr || !styleAttr.value) return true

      const valueExpr = styleAttr.value.type === 'JSXExpressionContainer' ? styleAttr.value.expression : styleAttr.value

      if (valueExpr.type !== 'ObjectExpression') return true

      if (valueExpr.properties.some((p) => p.type === 'SpreadElement')) return true

      return valueExpr.properties.some(
        (p) => p.type === 'Property' && p.key.type === 'Identifier' && TEXT_STYLING_PROPERTIES.has(p.key.name)
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
        const hasLiteralTextChild = children.some(hasLiteralText)
        const hasDynamicChild = children.some(hasDynamicContent)
        const hasAnyTextChild = hasLiteralTextChild || hasDynamicChild
        const styled = hasStyleProp(node)

        // <p> and <h1>–<h6> always have PF equivalents (Content, Title)
        // so flag both literal text AND dynamic expressions
        if (tag === 'p' || /^h[1-6]$/.test(tag)) {
          if (hasAnyTextChild) {
            context.report({
              node,
              messageId: 'preferPfTextComponent',
              data: { element: tag },
            })
          }
          return
        }

        // For <div> and <span>, distinguish literal text from dynamic
        // expressions. PF6 has no ContentVariants.span, so we only flag
        // dynamic children when a style prop is present (styled text
        // wrapper pattern like <span style={...}>{variable}</span>).
        //
        // Skip when:
        // - All dynamic children are React children patterns (children / props.children)
        // - Style is an inline object with only layout/positioning properties
        const dynamicFlaggable =
          hasDynamicChild && styled && !allDynamicChildrenAreReactChildren(children) && styleHasTextProperties(node)
        const flaggable = hasLiteralTextChild || dynamicFlaggable
        if (!flaggable) return

        // For <div>: only flag when it has a style prop
        if (tag === 'div' && !styled) return

        // For <span>: skip if ALL children are only JSX elements (icon wrapper),
        // or if it is a screen-reader-only span (a11y utility pattern)
        if (tag === 'span') {
          if (isScreenReaderSpan(node)) return
          const nonWhitespaceChildren = children.filter((child) => {
            if (child.type === 'JSXText') return child.value.trim().length > 0
            return true
          })
          if (nonWhitespaceChildren.length > 0 && nonWhitespaceChildren.every(isJSXElement)) return
        }

        // Exception: inside <Th>/<Td> without a style prop is fine
        if (isInsideTableCell(jsxElement) && !styled) return

        context.report({
          node,
          messageId: 'preferPfTextComponent',
          data: { element: tag },
        })
      },
    }
  },
}
