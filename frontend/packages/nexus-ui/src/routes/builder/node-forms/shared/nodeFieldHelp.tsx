import type { ReactElement } from 'react'

import { FieldHelpPopover } from '../../../../components/FieldHelpPopover'
import { APPROVER_GROUPS_LABEL, APPROVER_USERS_LABEL } from '../approverConstants'

import * as T from './nodeFieldHelpText'

/** Shorthand for FormGroup labelHelp popovers in node forms. */
export function nodeFieldHelp(header: string, helpText: string): ReactElement {
  return <FieldHelpPopover headerContent={header} helpText={helpText} />
}

/**
 * Pre-built labelHelp elements.
 * Defined at module scope so FormGroup JSX only references identifiers — avoids V8/Sonar
 * phantom branch noise on inline `labelHelp={<FieldHelpPopover … />}` / `nodeFieldHelp(…)`.
 */
export const nodeHelp = {
  // Settings
  onFailureBehavior: nodeFieldHelp('On failure behavior', T.SETTINGS_CONTINUE_ON_FAILURE_HELP),
  timeout: nodeFieldHelp('Timeout', T.SETTINGS_TIMEOUT_HELP),
  retryToggle: nodeFieldHelp('Override retry policy', T.SETTINGS_RETRY_TOGGLE_HELP),
  maxRetries: nodeFieldHelp('Max retries', T.SETTINGS_MAX_RETRIES_HELP),
  initialInterval: nodeFieldHelp('Initial interval', T.SETTINGS_INITIAL_INTERVAL_HELP),
  maxInterval: nodeFieldHelp('Max interval', T.SETTINGS_MAX_INTERVAL_HELP),
  backoffCoefficient: nodeFieldHelp('Backoff coefficient', T.SETTINGS_BACKOFF_HELP),

  // Script / HTTP
  scriptLanguage: nodeFieldHelp('Language', T.SCRIPT_LANGUAGE_HELP),
  scriptCode: nodeFieldHelp('Script', T.SCRIPT_CODE_HELP),
  scriptEnvVars: nodeFieldHelp('Environment variables', T.SCRIPT_ENV_VARS_HELP),
  httpMethod: nodeFieldHelp('HTTP Method', T.HTTP_METHOD_HELP),
  httpUrl: nodeFieldHelp('URL', T.HTTP_URL_HELP),
  httpHeaders: nodeFieldHelp('Headers', T.HTTP_HEADERS_HELP),
  httpBody: nodeFieldHelp('Body', T.HTTP_BODY_HELP),

  // AI agent
  aiModel: nodeFieldHelp('Model', T.AI_MODEL_HELP),
  aiCredential: nodeFieldHelp('Credential', T.AI_CREDENTIAL_HELP),
  aiPrompt: nodeFieldHelp('Prompt', T.AI_PROMPT_HELP),
  aiTools: nodeFieldHelp('Tools', T.AI_TOOLS_HELP),
  aiConnections: nodeFieldHelp('Connections', T.AI_INTEGRATION_CONNECTIONS_HELP),
  aiResponseSchema: nodeFieldHelp('Response schema', T.AI_RESPONSE_SCHEMA_HELP),
  aiContext: nodeFieldHelp('Context file upload', T.AI_CONTEXT_HELP),

  // Approval
  approverUsers: nodeFieldHelp(APPROVER_USERS_LABEL, T.APPROVAL_APPROVER_USERS_HELP),
  approverGroups: nodeFieldHelp(APPROVER_GROUPS_LABEL, T.APPROVAL_APPROVER_GROUPS_HELP),
  approvalMessage: nodeFieldHelp('Message', T.APPROVAL_MESSAGE_HELP),
  approvalFallback: nodeFieldHelp('Fallback decision', T.APPROVAL_FALLBACK_DECISION_HELP),
  approvalDecisionWindow: nodeFieldHelp('Decision window', T.APPROVAL_DECISION_WINDOW_HELP),

  // Loop / logic
  loopItems: nodeFieldHelp('Items expression', T.LOOP_ITEMS_HELP),
  loopItemVariable: nodeFieldHelp('Item variable', T.LOOP_ITEM_VARIABLE_HELP),
  loopIndexVariable: nodeFieldHelp('Index variable', T.LOOP_INDEX_VARIABLE_HELP),
  maxIterations: nodeFieldHelp('Max iterations', T.LOOP_MAX_ITERATIONS_HELP),
  convergeWaitDuration: nodeFieldHelp('Wait duration', T.CONVERGE_WAIT_DURATION_HELP),
  switchPathName: nodeFieldHelp('Path name', T.SWITCH_PATH_NAME_HELP),
  switchFallback: nodeFieldHelp('Fallback path', T.SWITCH_FALLBACK_HELP),
  waitDuration: nodeFieldHelp('Wait duration', T.WAIT_DURATION_HELP),

  // Triggers
  manualInputSchema: nodeFieldHelp('Input schema', T.MANUAL_INPUT_SCHEMA_HELP),
  edaHttpMethod: nodeFieldHelp('HTTP method', T.EDA_HTTP_METHOD_HELP),
  edaUrl: nodeFieldHelp('URL', T.EDA_URL_HELP),
  edaInputSchema: nodeFieldHelp('JSON schema validation', T.EDA_INPUT_SCHEMA_HELP),

  // AAP
  aapOrganization: nodeFieldHelp('Organization', T.AAP_ORGANIZATION_HELP),
  aapJobTemplate: nodeFieldHelp('Job template', T.AAP_JOB_TEMPLATE_HELP),
  aapWorkflowTemplate: nodeFieldHelp('Workflow template', T.AAP_WORKFLOW_TEMPLATE_HELP),
  aapUseExpressions: nodeFieldHelp('Use expressions', T.AAP_USE_EXPRESSIONS_HELP),
  aapJobType: nodeFieldHelp('Run type', T.AAP_JOB_TYPE_HELP),
  aapInventory: nodeFieldHelp('Inventory', T.AAP_INVENTORY_HELP),
  aapJobCredentials: nodeFieldHelp('Credentials', T.AAP_JOB_CREDENTIALS_HELP),
  aapExecutionEnvironment: nodeFieldHelp('Execution environment', T.AAP_EXECUTION_ENVIRONMENT_HELP),
  aapLabels: nodeFieldHelp('Labels', T.AAP_LABELS_HELP),
  aapVerbosity: nodeFieldHelp('Verbosity', T.AAP_VERBOSITY_HELP),
  aapForks: nodeFieldHelp('Forks', T.AAP_FORKS_HELP),
  aapJobSliceCount: nodeFieldHelp('Job slices', T.AAP_JOB_SLICE_COUNT_HELP),
  aapDiffMode: nodeFieldHelp('Show changes', T.AAP_DIFF_MODE_HELP),
  aapInstanceGroup: nodeFieldHelp('Instance group', T.AAP_INSTANCE_GROUP_HELP),
  aapTags: nodeFieldHelp('Job tags', T.AAP_TAGS_HELP),
  aapSkipTags: nodeFieldHelp('Skip tags', T.AAP_SKIP_TAGS_HELP),
  aapLimit: nodeFieldHelp('Limit', T.AAP_LIMIT_HELP),
  aapExtraVars: nodeFieldHelp('Extra variables', T.AAP_EXTRA_VARS_HELP),
  aapScmBranch: nodeFieldHelp('Source control branch', T.AAP_SCM_BRANCH_HELP),
  aapWfTags: nodeFieldHelp('Job tags', T.AAP_WF_TAGS_HELP),
  aapWfSkipTags: nodeFieldHelp('Skip tags', T.AAP_WF_SKIP_TAGS_HELP),
} as const
