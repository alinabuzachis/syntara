/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw Date locale methods and PatternFly Timestamp for date display. Use formatDateTime/formatDate/DateCell from dateUtils.ts to ensure consistent MMM DD, YYYY format across the UI (AAP-76836).',
      recommended: true,
    },
    messages: {
      noLocaleDate:
        'Use formatDateTime() or DateCell from dateUtils.ts instead of {{ method }}(). Raw locale methods produce inconsistent date formats across browsers. See dateUtils.ts for available formatters.',
      noTimestamp:
        'Use DateCell or formatDateTime() from dateUtils.ts instead of PatternFly Timestamp. The Timestamp component renders dates in the browser locale format, which is inconsistent with the UX standard (MMM DD, YYYY).',
    },
    schema: [],
  },
  create(context) {
    const filename = (context.physicalFilename ?? context.filename).replace(/\\/g, '/')

    if (filename.includes('/dateUtils.ts')) {
      return {}
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.property.type !== 'Identifier') {
          return
        }
        const method = node.callee.property.name

        if (method === 'toLocaleDateString' || method === 'toLocaleTimeString') {
          context.report({ node, messageId: 'noLocaleDate', data: { method } })
          return
        }

        if (method === 'toLocaleString') {
          const obj = node.callee.object
          if (obj.type === 'NewExpression' && obj.callee.type === 'Identifier' && obj.callee.name === 'Date') {
            context.report({ node, messageId: 'noLocaleDate', data: { method } })
          }
        }
      },

      ImportDeclaration(node) {
        if (node.source.value !== '@patternfly/react-core') {
          return
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'Timestamp') {
            context.report({ node: specifier, messageId: 'noTimestamp' })
          }
        }
      },
    }
  },
}
