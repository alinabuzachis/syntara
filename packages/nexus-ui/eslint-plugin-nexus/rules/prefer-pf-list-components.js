/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer PatternFly List / ListItem over native ul / ol / li for UI lists',
    },
    messages: {
      preferPfListComponent:
        'Use PatternFly <List> and <ListItem> instead of raw <{{element}}>. See patternfly.org/components/list',
    },
    schema: [],
  },
  create(context) {
    const RAW_LIST_ELEMENTS = new Set(['ul', 'ol', 'li'])

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return

        const tag = node.name.name
        if (!RAW_LIST_ELEMENTS.has(tag)) return

        context.report({
          node,
          messageId: 'preferPfListComponent',
          data: { element: tag },
        })
      },
    }
  },
}
