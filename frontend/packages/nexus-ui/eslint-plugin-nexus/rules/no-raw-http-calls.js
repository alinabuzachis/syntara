import picomatch from 'picomatch'

const RULE_ID = 'nexus/no-raw-http-calls'

/** @param {string} commentText */
function disablesRawHttpRule(commentText) {
  if (!/eslint-disable(?:-(?:next-)?line)?(?:\s|$)/.test(commentText)) {
    return false
  }

  const afterDirective = commentText.replace(/^\s*eslint-disable(?:-(?:next-)?line)?/, '').trim()
  if (!afterDirective) {
    return false
  }

  const ruleListPart = afterDirective.split('--')[0].trim()
  if (!ruleListPart) {
    return false
  }

  return ruleListPart
    .split(',')
    .map((rule) => rule.trim())
    .some((rule) => rule === RULE_ID || rule === 'no-raw-http-calls')
}

/** @param {string} commentText */
function hasDisableJustification(commentText) {
  const justificationMatch = commentText.match(/--\s*(\S.*)?$/)
  return Boolean(justificationMatch?.[1]?.trim())
}

/**
 * True when an Identifier node references the global fetch (not a declaration,
 * import/export name, or property access like obj.fetch).
 *
 * @param {import('estree').Identifier} node
 */
function isFetchGlobalReference(node) {
  if (node.name !== 'fetch') {
    return false
  }

  const { parent } = node
  if (!parent) {
    return false
  }

  // obj.fetch — property name, not a global reference
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
    return false
  }

  // import { fetch } / export { fetch }
  if (parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier') {
    return false
  }

  // Binding identifiers in declarations
  if (
    (parent.type === 'VariableDeclarator' && parent.id === node) ||
    (parent.type === 'FunctionDeclaration' && parent.id === node) ||
    (parent.type === 'FunctionExpression' && parent.id === node) ||
    (parent.type === 'ArrowFunctionExpression' && parent.id === node) ||
    (parent.type === 'ClassDeclaration' && parent.id === node) ||
    (parent.type === 'ClassExpression' && parent.id === node) ||
    (parent.type === 'CatchClause' && parent.param === node) ||
    (parent.type === 'RestElement' && parent.argument === node) ||
    (parent.type === 'AssignmentPattern' && parent.left === node)
  ) {
    return false
  }

  // Object literal keys: { fetch: fn } — key is not a reference
  if (parent.type === 'Property' && parent.key === node && !parent.method && !parent.shorthand && !parent.computed) {
    return false
  }

  // TypeScript type-member keys
  if ((parent.type === 'TSPropertySignature' || parent.type === 'TSMethodSignature') && parent.key === node) {
    return false
  }

  return true
}

/**
 * @param {import('eslint').Rule.RuleContext} context
 * @param {string[]} allowedFiles
 */
function isAllowedFile(context, allowedFiles) {
  if (allowedFiles.length === 0) {
    return false
  }

  const filename = context.physicalFilename ?? context.filename
  const normalized = filename.replace(/\\/g, '/')
  return allowedFiles.some((pattern) => picomatch(pattern)(normalized))
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw HTTP calls (fetch, XMLHttpRequest, axios) in UI code. Use typed API clients (workflowClient, credentialsClient, etc.) instead to maintain UI-API parity.',
      recommended: true,
    },
    messages: {
      noRawFetch:
        'Use a typed API client (workflowClient, credentialsClient, etc.) instead of raw fetch(). Raw calls bypass type safety and can hit undocumented endpoints, breaking UI-API parity. For pre-auth or external calls, add an eslint-disable-next-line with a justification.',
      noRawXMLHttpRequest:
        'Use a typed API client (workflowClient, credentialsClient, etc.) instead of XMLHttpRequest. Raw calls bypass type safety and can hit undocumented endpoints, breaking UI-API parity. For legacy integrations, add an eslint-disable-next-line with a justification.',
      noAxiosImport:
        'Use a typed API client (workflowClient, credentialsClient, etc.) instead of importing axios directly. Direct axios calls bypass type safety and centralized request configuration.',
      missingDisableJustification:
        'eslint-disable comments for nexus/no-raw-http-calls must include a justification after "--" (e.g. eslint-disable-next-line nexus/no-raw-http-calls -- pre-auth call before token middleware).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedFiles: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Glob patterns for files exempt from this rule (prefer over inline eslint-disable per coding standards §28).',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] ?? {}
    const allowedFiles = options.allowedFiles ?? []

    if (isAllowedFile(context, allowedFiles)) {
      return {}
    }

    const sourceCode = context.sourceCode

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const text = comment.value.trim()
          if (!disablesRawHttpRule(text) || hasDisableJustification(text)) {
            continue
          }

          context.report({
            loc: comment.loc,
            messageId: 'missingDisableJustification',
          })
        }
      },

      // Detect axios imports
      ImportDeclaration(node) {
        if (node.source.value === 'axios') {
          context.report({
            node,
            messageId: 'noAxiosImport',
          })
        }
      },

      // Detect any reference to the global fetch (calls, aliasing, passing as callback, etc.)
      Identifier(node) {
        if (isFetchGlobalReference(node)) {
          context.report({
            node,
            messageId: 'noRawFetch',
          })
        }
      },

      // Detect XMLHttpRequest instantiation
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'XMLHttpRequest') {
          context.report({
            node,
            messageId: 'noRawXMLHttpRequest',
          })
        }
      },
    }
  },
}
