import type { Approval } from '@ansible/nexus-contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAlerts } from '../../../providers/alerts'

import { useAutoApprovalDetection } from './useAutoApprovalDetection'
import type { useExecutionNodeClick } from './useExecutionNodeClick'
import { useFetchApprovalForUrlParam } from './useFetchApprovalForUrlParam'

type NodeClickResult = ReturnType<typeof useExecutionNodeClick>

export type WorkflowDefinitionLike = {
  nodes?: Array<Record<string, unknown>>
  workflow?: { activities?: Array<Record<string, unknown>> }
}

/**
 * Manages approval side panel UI state and integrations (Layer 4: UI).
 *
 * Responsibilities:
 * - Panel open/close state
 * - URL-based deep linking (`?approval=abc-123`)
 * - WebSocket-based auto-detection of new approvals
 * - Extracting approval message/prompt from workflow definition
 *
 * Part of the approval hooks architecture. See `useExecutionNodeClick.ts` for the full layering explanation.
 */
export function useExecutionApprovalPanel(
  executionId: string | undefined,
  searchParams: string,
  nodeClick: NodeClickResult,
  workflowDefinition: WorkflowDefinitionLike | undefined
) {
  const { clearApprovals, setApprovalsAndIndex, fetchApprovals, currentApproval, approvals } = nodeClick
  const [panelOpen, setPanelOpen] = useState(false)
  const prevApprovalsLengthRef = useRef(0)
  const { showError } = useAlerts()

  const approvalIdFromUrl = useMemo(() => {
    return new URLSearchParams(searchParams).get('approval')
  }, [searchParams])

  const urlApproval = useFetchApprovalForUrlParam(searchParams)
  const [handledApprovalId, setHandledApprovalId] = useState<string | null>(null)
  if (!approvalIdFromUrl && handledApprovalId !== null) {
    setHandledApprovalId(null)
  } else if (urlApproval?.id && urlApproval.id !== handledApprovalId) {
    setHandledApprovalId(urlApproval.id)
    // Fetch all approvals and find the index of the URL approval
    fetchApprovals()
      .then((fetchedApprovals) => {
        const index = fetchedApprovals.findIndex((a) => a.id === urlApproval.id)
        if (index >= 0) {
          setApprovalsAndIndex(fetchedApprovals, index)
        } else {
          // URL approval not found, default to first
          setApprovalsAndIndex(fetchedApprovals, 0)
        }
        setPanelOpen(true)
      })
      .catch(() => {
        showError({
          title: 'Failed to load approval',
          description: 'Could not fetch approval details. Please try again.',
        })
      })
  }

  const open = useCallback(() => {
    setPanelOpen(true)
  }, [])

  const close = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const dismiss = useCallback(() => {
    // After a decision is submitted, check if there are still pending approvals
    // The refetchQueries in onSuccess ensures the cache is fresh before this fires
    fetchApprovals()
      .then((fetchedApprovals) => {
        if (fetchedApprovals.length > 0) {
          // Still have pending approvals - navigate to the first one and keep panel open
          setApprovalsAndIndex(fetchedApprovals, 0)
        } else {
          // No more pending approvals - close the panel
          setPanelOpen(false)
          clearApprovals()
        }
      })
      .catch(() => {
        // Fetch failed - close panel to avoid showing stale state
        setPanelOpen(false)
        clearApprovals()
      })
  }, [fetchApprovals, setApprovalsAndIndex, clearApprovals])

  const handleDetected = useCallback(
    (detected: Approval) => {
      // When auto-detection finds an approval, fetch all and set to that one
      fetchApprovals()
        .then((fetchedApprovals) => {
          const index = fetchedApprovals.findIndex((a) => a.id === detected.id)
          if (index >= 0) {
            setApprovalsAndIndex(fetchedApprovals, index)
          } else {
            setApprovalsAndIndex(fetchedApprovals, 0)
          }
          setPanelOpen(true)
        })
        .catch(() => {
          showError({
            title: 'Failed to load approval',
            description: 'Could not fetch approval details. Please try again.',
          })
        })
    },
    [fetchApprovals, setApprovalsAndIndex, showError]
  )

  useAutoApprovalDetection({
    executionId,
    fetchForNode: async (nodeId: string) => {
      const fetchedApprovals = await fetchApprovals()
      return fetchedApprovals.find((a) => a.approval_node_id === nodeId) ?? null
    },
    onApprovalDetected: handleDetected,
  })

  // Auto-close panel when all approvals are resolved externally (e.g., via WebSocket)
  // Use useEffect to avoid React Compiler errors about accessing refs during render
  useEffect(() => {
    const prevLength = prevApprovalsLengthRef.current
    const currentLength = approvals.length

    // Only close if we transitioned from having approvals to having none
    if (panelOpen && prevLength > 0 && currentLength === 0) {
      // Schedule state update to avoid cascading renders
      const timer = setTimeout(() => {
        setPanelOpen(false)
        clearApprovals()
      }, 0)
      prevApprovalsLengthRef.current = currentLength
      return () => clearTimeout(timer)
    }

    // Track length changes
    prevApprovalsLengthRef.current = currentLength
  }, [panelOpen, approvals.length, clearApprovals])

  const approvalMessage = useMemo(() => {
    if (!currentApproval || !workflowDefinition) return undefined
    const nodes = workflowDefinition.nodes ?? workflowDefinition.workflow?.activities ?? []
    const node = nodes.find((n) => n.id === currentApproval.approval_node_id)
    if (!node) return undefined
    const config = node.config
    if (typeof config === 'object' && config !== null && 'prompt' in config && typeof config.prompt === 'string') {
      return config.prompt
    }
    return undefined
  }, [currentApproval, workflowDefinition])

  return { panelOpen, approvalMessage, open, close, dismiss }
}
