/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
/**
 * EXAMPLE: How to create a custom plugin node
 *
 * This file demonstrates how to register a completely new node type
 * without modifying any existing code.
 *
 * Steps:
 * 1. Create your form component
 * 2. Create a registration file like this
 * 3. Import and call the registration function in nodes/index.ts
 */

import { BellIcon } from 'lucide-react'

import { useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { NodeRegistry } from '../NodeRegistry'
import type { BaseNodeFormProps } from '../NodeRegistry'

// 1. Define your form data type
interface NotificationFormData {
  name: string
  channel: 'email' | 'slack' | 'webhook'
  recipients: string
  message: string
}

// 2. Create your form component (or import it)
function NotificationNodeForm({ onSubmit, onCancel }: BaseNodeFormProps<NotificationFormData>) {
  // Form implementation here
  // This is just a placeholder
  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Configure Notification</h3>
      <button
        onClick={() =>
          onSubmit({
            name: 'Test',
            channel: 'email',
            recipients: 'test@example.com',
            message: 'Test message',
          })
        }
      >
        Add
      </button>
    </div>
  )
}

// 3. Register your node type
export function registerNotificationNode() {
  NodeRegistry.register<NotificationFormData>({
    id: 'notification',
    label: 'Send Notification',
    icon: BellIcon,
    category: 'action',
    description: 'Send notifications via email, Slack, or webhook',
    keywords: ['notify', 'alert', 'email', 'slack', 'webhook', 'message'],
    order: 50,
    formComponent: NotificationNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Create your custom activity based on form data
        const activity = {
          type: 'task' as const,
          id: `notification_${crypto.randomUUID().replace(/-/g, '_')}`,
          name: data.name,
          task: {
            executor: 'notification' as any, // You might need to extend the API types
            config: {
              channel: data.channel,
              recipients: data.recipients,
              message: data.message,
            },
          },
        }

        // Add to workflow
        useWorkflowStore.getState().addActivity(activity as any)
        onSuccess()
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add notification node')
      }
    },
  })
}

/**
 * Usage in nodes/index.ts:
 *
 * import { registerNotificationNode } from './registerCustomPlugin.example'
 *
 * export function registerAllNodes() {
 *   registerTriggerNode()
 *   registerActionNode()
 *   registerNotificationNode() // ← Add your plugin here
 * }
 */
