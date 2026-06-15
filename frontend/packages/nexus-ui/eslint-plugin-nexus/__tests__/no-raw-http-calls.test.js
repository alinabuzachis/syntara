import { ESLint, RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'
import nexusPlugin from '../index.js'
import rule from '../rules/no-raw-http-calls.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  plugins: {
    nexus: nexusPlugin,
  },
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

function createEslint() {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{js,ts}'],
        plugins: { nexus: nexusPlugin },
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        rules: {
          'nexus/no-raw-http-calls': 'error',
        },
      },
    ],
  })
}

ruleTester.run('nexus/no-raw-http-calls', rule, {
  valid: [
    // Using typed API client is allowed
    {
      code: `
        import { workflowClient } from '../client';
        const { data } = workflowClient.useQuery('get', '/workflows');
      `,
    },
    // Multiple typed clients
    {
      code: `
        import { workflowClient, credentialsClient } from '../client';
        const workflows = workflowClient.useQuery('get', '/workflows');
        const creds = credentialsClient.useQuery('get', '/credentials');
      `,
    },
    // Using openapi-fetch directly (which is what typed clients use)
    {
      code: `
        import createClient from 'openapi-fetch';
        const client = createClient({ baseUrl: '/api' });
      `,
    },
    // Using createFetchClient from openapi-fetch
    {
      code: `
        import createFetchClient from 'openapi-fetch';
        const client = createFetchClient({ baseUrl: '/api' });
      `,
    },
    // Non-fetch HTTP operations (like fetch polyfills being imported)
    {
      code: `
        import { fetch as customFetch } from 'cross-fetch';
      `,
    },
    // Disable comment with required justification
    {
      code: `
        // eslint-disable-next-line nexus/no-raw-http-calls -- pre-auth call before token middleware
        const value = 1;
      `,
    },
    // Block comment disable with justification
    {
      code: `
        /* eslint-disable-next-line nexus/no-raw-http-calls -- XMLHttpRequest required for upload progress */
        const value = 2;
      `,
    },
    // Combined rule disable with shared justification
    {
      code: `
        // eslint-disable-next-line nexus/no-raw-http-calls, no-console -- auth retry with refreshed token
        const value = 3;
      `,
    },
    // File-level disable with justification
    {
      code: `
        /* eslint-disable nexus/no-raw-http-calls -- test fixture uses raw fetch mocks */
        const value = 4;
      `,
    },
    // Unrelated eslint-disable comments are ignored
    {
      code: `
        // eslint-disable-next-line no-console -- debug logging in dev only
        console.log('debug');
      `,
    },
    // Property access to fetch is allowed (e.g. window.fetch, mock setup)
    {
      code: `
        const fn = window.fetch;
      `,
    },
    // allowedFiles exempts matching paths from all rule checks
    {
      code: `
        const xhr = new XMLHttpRequest();
      `,
      options: [{ allowedFiles: ['**/useFileUploadWithProgress.ts'] }],
      filename: 'src/hooks/useFileUploadWithProgress.ts',
    },
  ],
  invalid: [
    // Raw fetch() call without justification
    {
      code: `
        const response = await fetch('/api/workflows');
      `,
      errors: [{ messageId: 'noRawFetch' }],
    },
    // Raw fetch() with POST
    {
      code: `
        const response = await fetch('/api/workflows', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      `,
      errors: [{ messageId: 'noRawFetch' }],
    },
    // XMLHttpRequest without justification
    {
      code: `
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/workflows');
        xhr.send();
      `,
      errors: [{ messageId: 'noRawXMLHttpRequest' }],
    },
    // Nested function with fetch
    {
      code: `
        function getData() {
          return fetch('/api/data');
        }
      `,
      errors: [{ messageId: 'noRawFetch' }],
    },
    // Class method with XMLHttpRequest
    {
      code: `
        class ApiClient {
          request(url) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            return xhr;
          }
        }
      `,
      errors: [{ messageId: 'noRawXMLHttpRequest' }],
    },
    // Multiple violations in same file
    {
      code: `
        const a = await fetch('/api/a');
        const xhr = new XMLHttpRequest();
      `,
      errors: [{ messageId: 'noRawFetch' }, { messageId: 'noRawXMLHttpRequest' }],
    },
    // eslint-disable without justification
    {
      code: `
        // eslint-disable-next-line nexus/no-raw-http-calls
        const value = 1;
      `,
      errors: [{ messageId: 'missingDisableJustification' }],
    },
    // Block comment disable without justification
    {
      code: `
        /* eslint-disable-next-line nexus/no-raw-http-calls */
        const value = 1;
      `,
      errors: [{ messageId: 'missingDisableJustification' }],
    },
    // fetch aliasing (bypasses call-site-only checks)
    {
      code: `
        const f = fetch;
        f('/api/workflows');
      `,
      errors: [{ messageId: 'noRawFetch' }],
    },
    // fetch passed as callback
    {
      code: `
        const runner = (fn) => fn('/api/data');
        runner(fetch);
      `,
      errors: [{ messageId: 'noRawFetch' }],
    },
  ],
})

describe('nexus/no-raw-http-calls eslint integration', () => {
  it('allows raw fetch when disable includes a justification', async () => {
    const eslint = createEslint()
    const code = `
      // eslint-disable-next-line nexus/no-raw-http-calls -- pre-auth call before token middleware
      const response = await fetch('/api/v1/auth/providers')
    `

    const [result] = await eslint.lintText(code, { filePath: 'src/example.ts' })

    expect(result.messages).toEqual([])
  })

  it('rejects disable without justification and does not report the suppressed fetch call', async () => {
    const eslint = createEslint()
    const code = `
      // eslint-disable-next-line nexus/no-raw-http-calls
      const response = await fetch('/api/v1/auth/providers')
    `

    const [result] = await eslint.lintText(code, { filePath: 'src/example.ts' })

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].ruleId).toBe('nexus/no-raw-http-calls')
    expect(result.messages[0].messageId).toBe('missingDisableJustification')
  })

  it('allows XMLHttpRequest in files matched by allowedFiles', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{js,ts}'],
          plugins: { nexus: nexusPlugin },
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
          },
          rules: {
            'nexus/no-raw-http-calls': ['error', { allowedFiles: ['**/useFileUploadWithProgress.ts'] }],
          },
        },
      ],
    })
    const code = `
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/upload')
    `

    const [result] = await eslint.lintText(code, {
      filePath: 'src/hooks/useFileUploadWithProgress.ts',
    })

    expect(result.messages).toEqual([])
  })

  it('blocks axios imports via no-restricted-imports', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{js,ts}'],
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
          },
          rules: {
            'no-restricted-imports': [
              'error',
              {
                paths: [
                  {
                    name: 'axios',
                    message: 'Use typed API clients from client.tsx instead of axios.',
                  },
                ],
              },
            ],
          },
        },
      ],
    })
    const code = `import axios from 'axios'`

    const [result] = await eslint.lintText(code, { filePath: 'src/example.ts' })

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].ruleId).toBe('no-restricted-imports')
  })
})
