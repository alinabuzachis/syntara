# Quick Start: Adding a New Node

This guide shows you how to quickly add a new node to the workflow builder.

## Overview

Adding a new node involves **just 2 simple steps**:

1. Create a form component
2. Create a registration file with **default export**

That's it! The **auto-discovery system** automatically finds and registers all `register*.ts` files.

## Step 1: Create Your Form Component

Create a form component in `packages/nexus-ui/src/routes/builder/node-forms/`:

```typescript
// MyNewNodeForm.tsx
import { useState } from 'react'
import type { BaseNodeFormProps } from '../registry/NodeRegistry'

export interface MyNewNodeFormData {
  name: string
  url: string
  method: 'GET' | 'POST'
}

export function MyNewNodeForm({ onSubmit, onCancel }: BaseNodeFormProps<MyNewNodeFormData>) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ name, url, method })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Your form fields here */}
      <button type="submit">Add Node</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  )
}
```

## Step 2: Create a Registration File

Choose the appropriate template based on your needs:

### Option A: Simple Node (Placeholder Implementation)

For nodes where you're not ready to implement the full logic yet:

```typescript
// registerMyNewNode.ts
import { RhStandardGlobeAbstractIcon } from '@patternfly/react-icons'
import { createBasicNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'
import { MyNewNodeForm } from '../../node-forms/MyNewNodeForm'

// IMPORTANT: Must export as default for auto-discovery
export default function registerMyNewNode() {
  NodeRegistry.register(
    createBasicNode({
      id: 'my-new-node',
      label: 'My New Node',
      icon: RhStandardGlobeAbstractIcon,
      category: 'action', // Type-safe category
      description: 'Does something amazing',
      keywords: ['api', 'http', 'request', 'web'],
      order: 35, // Optional: controls display order
      formComponent: MyNewNodeForm,
    })
  )
}
```

### Option B: Custom Node (Full Implementation)

For nodes that need to interact with the workflow store or perform complex logic:

```typescript
// registerMyNewNode.ts
import { RhStandardGlobeAbstractIcon } from '@patternfly/react-icons'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'
import { useWorkflowStore } from '../../../../stores/useWorkflowStore'
import type { MyNewNodeFormData } from '../../node-forms/MyNewNodeForm'
import { MyNewNodeForm } from '../../node-forms/MyNewNodeForm'

// IMPORTANT: Must export as default for auto-discovery
export default function registerMyNewNode() {
  NodeRegistry.register(
    createCustomNode<MyNewNodeFormData>(
      {
        id: 'my-new-node',
        label: 'My New Node',
        icon: RhStandardGlobeAbstractIcon,
        category: 'action', // Type-safe category
        description: 'Does something amazing',
        keywords: ['api', 'http', 'request', 'web'],
        order: 35,
        formComponent: MyNewNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
          // Your custom logic here
          const activity = createMyActivity(data)

          if (activity) {
            useWorkflowStore.getState().addActivity(activity)
            onSuccess()
          } else {
            onError('Invalid configuration. Please check your inputs.')
          }
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to add node')
        }
      }
    )
  )
}
```

**That's it!** Your node is automatically discovered and registered. No need to manually edit `index.ts`.

## Categories

Choose the appropriate category for your node:

| Category      | Use Case                      | Examples                               |
| ------------- | ----------------------------- | -------------------------------------- |
| `trigger`     | Starts workflow execution     | Manual trigger, Scheduled, Event-based |
| `action`      | Performs tasks or operations  | API calls, Script execution, Job runs  |
| `logic`       | Controls workflow flow        | Conditionals, Branches, Loops          |
| `integration` | External service integrations | Third-party APIs, Cloud services       |
| `approval`    | Human approval gates          | Manual approval, Review checkpoints    |

## Icons

Use [PatternFly React icons](https://patternfly.org/) for consistency:

```typescript
import {
  RhStandardGlobeAbstractIcon,
  RhUiPlay,
  RhStandardBrainIcon,
  RhStandardElectricalBoltIcon,
  RhUiBranchIcon,
  UserCheckIcon,
} from '@patternfly/react-icons'
```

Or use custom SVG icons (avoid as much as possible):

```typescript
// @ts-expect-error - SVG import as React component
import MyIcon from '../../../../assets/my-icon.svg?react'
```

## Best Practices

### 1. **Choose a Unique ID**

- Use lowercase with dashes: `my-service-action`
- Make it descriptive and unique
- Avoid generic names like `node1` or `test`

### 2. **Provide Good Keywords**

- Include related terms users might search for
- Think about what the node does and how users describe it
- Examples: `['api', 'http', 'rest', 'web', 'fetch']`

### 3. **Write Clear Descriptions**

- Describe what the node does, not what it is
- Keep it concise (one sentence)
- Good: "Execute HTTP API requests with custom headers"
- Bad: "An HTTP node"

### 4. **Set Appropriate Order**

- Lower numbers appear first (default: 100)
- Group related nodes together
- Common ranges:
  - Triggers: 10-20
  - AI/Agents: 20-30
  - Actions: 30-50
  - Logic: 50-60

### 5. **Error Handling**

- Always use try/catch in custom nodes
- Provide specific error messages
- Call `onError()` with helpful messages for users

## Testing Your Node

1. **Start the dev server:**

   ```bash
   npm start
   ```

2. **Open the workflow builder:**
   Navigate to `/automation-builder/new`

3. **Test the add panel:**
   - Click "Add Node"
   - Search for your node using keywords
   - Verify it appears in the correct category
   - Click to open the form

4. **Test the form:**
   - Fill out the form fields
   - Submit and verify no errors
   - Check that the node appears in the workflow

## Example: Complete Node Registration

Here's a complete example for a webhook trigger node:

```typescript
// registerWebhookNode.ts
import { RhStandardWebhooksIcon } from '@patternfly/react-icons'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'
import { useWorkflowStore, createEventTrigger } from '../../../../stores/useWorkflowStore'
import type { WebhookFormData } from '../../node-forms/WebhookForm'
import { WebhookForm } from '../../node-forms/WebhookForm'

/**
 * Register the Webhook trigger node
 */
export function registerWebhookNode() {
  NodeRegistry.register(
    createCustomNode<WebhookFormData>(
      {
        id: 'webhook-trigger',
        label: 'Webhook Trigger',
        icon: RhStandardWebhooksIcon,
        category: 'trigger',
        description: 'Trigger workflow from incoming webhook events',
        keywords: ['webhook', 'http', 'callback', 'event', 'api'],
        order: 15,
        formComponent: WebhookForm,
      },
      (data, onSuccess, onError) => {
        try {
          const trigger = createEventTrigger('webhook', data.eventType)

          if (trigger) {
            useWorkflowStore.getState().addTrigger(trigger)
            onSuccess()
          } else {
            onError('Invalid webhook configuration')
          }
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to add webhook trigger')
        }
      }
    )
  )
}
```

## Troubleshooting

### Node doesn't appear in the panel

- Check that you called the registration function in `index.ts`
- Verify the category is valid
- Check browser console for errors

### Form doesn't submit

- Ensure `onSubmit` is called with proper data
- Check that all required fields are provided
- Verify `BaseNodeFormProps` interface is implemented correctly

### TypeScript errors

- Ensure form data interface matches what you're passing to `onSubmit`
- Use the generic type parameter: `createCustomNode<YourFormData>(...)`
- Check that the form component implements `BaseNodeFormProps<YourFormData>`

## Next Steps

- Review existing nodes for patterns and examples
- Check [IMPROVEMENTS.md](../IMPROVEMENTS.md) for future enhancements
- Read [CLAUDE.md](/CLAUDE.md) for architectural overview
