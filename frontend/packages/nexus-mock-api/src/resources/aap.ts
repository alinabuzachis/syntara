/**
 * Mock AAP Controller data for development.
 */

export const organizations = [
  { id: 1, name: 'Default' },
  { id: 2, name: 'Engineering' },
  { id: 3, name: 'Operations' },
]

export const jobTemplates = [
  { id: 10, name: 'Deploy App', description: 'Deploy the application', organization: 'Default' },
  { id: 11, name: 'Backup DB', description: 'Backup the database', organization: 'Default' },
  { id: 12, name: 'Run Tests', description: 'Run integration tests', organization: 'Engineering' },
  { id: 13, name: 'Provision VMs', description: 'Provision virtual machines', organization: 'Operations' },
  { id: 14, name: 'Update Packages', description: 'Update system packages', organization: 'Operations' },
]

/** Prompt-on-launch flags for each job template (keyed by template id). */
export const jobTemplateDetails: Record<number, Record<string, unknown>> = {
  10: {
    ask_variables_on_launch: true,
    ask_limit_on_launch: true,
    ask_tags_on_launch: true,
    ask_skip_tags_on_launch: true,
    ask_verbosity_on_launch: true,
    ask_diff_mode_on_launch: true,
    ask_forks_on_launch: true,
    ask_job_slice_count_on_launch: true,
    ask_execution_environment_on_launch: true,
    ask_labels_on_launch: true,
    ask_timeout_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 1, name: 'Demo Inventory' },
    default_execution_environment: { id: 1, name: 'Default EE' },
    default_credentials: [{ id: 1, name: 'SSH Machine Credential' }],
    default_labels: [
      { id: 1, name: 'label1' },
      { id: 2, name: 'label2' },
    ],
    job_type: 'run',
    verbosity: 5,
    forks: 3,
    limit: '4',
    job_tags: 'JU2',
    skip_tags: 'a1',
    diff_mode: true,
    job_slice_count: 6,
    timeout: 0,
    extra_vars: '{"key":"value"}',
  },
  11: {
    ask_variables_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 2, name: 'Production' },
    default_credentials: [{ id: 2, name: 'AWS Access Keys' }],
  },
  12: {
    ask_variables_on_launch: true,
    ask_tags_on_launch: true,
    ask_skip_tags_on_launch: true,
    ask_verbosity_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 3, name: 'Staging' },
    default_execution_environment: { id: 2, name: 'Custom EE' },
    default_credentials: [{ id: 3, name: 'Ansible Vault Password' }],
    job_tags: 'deploy,staging',
    skip_tags: 'slow-tests',
    verbosity: 1,
  },
  13: {
    ask_inventory_on_launch: true,
    ask_credential_on_launch: true,
    ask_variables_on_launch: true,
    ask_limit_on_launch: true,
    ask_forks_on_launch: true,
    ask_job_slice_count_on_launch: true,
    ask_timeout_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 4, name: 'Dev Servers' },
    default_execution_environment: { id: 3, name: 'Minimal EE' },
    default_credentials: [
      { id: 4, name: 'GitHub Token' },
      { id: 5, name: 'Azure Service Principal' },
    ],
    limit: 'webservers',
    forks: 10,
    job_slice_count: 2,
    timeout: 1800,
  },
  14: {
    ask_limit_on_launch: true,
    ask_verbosity_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 2, name: 'Production' },
    default_credentials: [{ id: 6, name: 'GCP Service Account' }],
  },
}

export const workflowTemplates = [
  {
    id: 20,
    name: 'Deploy Application Workflow',
    description: 'Complete application deployment workflow',
    organization: 'Default',
  },
  { id: 21, name: 'Database Backup Workflow', description: 'Backup and verify database', organization: 'Default' },
  {
    id: 22,
    name: 'Infrastructure Provisioning',
    description: 'Provision and configure infrastructure',
    organization: 'Engineering',
  },
  { id: 23, name: 'Release Pipeline', description: 'Build, test, and deploy release', organization: 'Operations' },
]

/** Prompt-on-launch flags for each workflow template (keyed by template id). */
export const workflowTemplateDetails: Record<number, Record<string, unknown>> = {
  20: {
    ask_inventory_on_launch: true,
    ask_variables_on_launch: true,
    ask_limit_on_launch: true,
    ask_scm_branch_on_launch: true,
    ask_labels_on_launch: true,
    ask_tags_on_launch: true,
    ask_skip_tags_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 1, name: 'Demo Inventory' },
    default_labels: [
      { id: 3, name: 'production' },
      { id: 1, name: 'label1' },
    ],
    limit: 'webservers',
    scm_branch: 'main',
    job_tags: 'deploy,config',
    skip_tags: 'slow',
    extra_vars: '{"environment":"production"}',
  },
  21: {
    ask_variables_on_launch: true,
    ask_limit_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 2, name: 'Production' },
    default_labels: [{ id: 2, name: 'label2' }],
    limit: 'db-servers',
  },
  22: {
    ask_inventory_on_launch: true,
    ask_variables_on_launch: true,
    ask_scm_branch_on_launch: true,
    ask_labels_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 3, name: 'Staging' },
    default_labels: [{ id: 4, name: 'staging' }],
    scm_branch: 'develop',
  },
  23: {
    ask_inventory_on_launch: true,
    ask_variables_on_launch: true,
    ask_tags_on_launch: true,
    ask_skip_tags_on_launch: true,
    survey_enabled: false,
    default_inventory: { id: 2, name: 'Production' },
    default_labels: [
      { id: 3, name: 'production' },
      { id: 5, name: 'development' },
    ],
    job_tags: 'build,test,deploy',
    skip_tags: 'slow-tests',
  },
}

export const executionEnvironments = [
  { id: 1, name: 'Default EE', description: 'Default execution environment' },
  { id: 2, name: 'Custom EE', description: 'Custom EE with extra collections' },
  { id: 3, name: 'Minimal EE', description: 'Minimal execution environment' },
]

export const aapCredentials = [
  { id: 1, name: 'SSH Machine Credential' },
  { id: 2, name: 'AWS Access Keys' },
  { id: 3, name: 'Ansible Vault Password' },
  { id: 4, name: 'GitHub Token' },
  { id: 5, name: 'Azure Service Principal' },
  { id: 6, name: 'GCP Service Account' },
]

export const instanceGroups = [
  { id: 1, name: 'default' },
  { id: 2, name: 'controlplane' },
  { id: 3, name: 'execution' },
]

export const inventories = [
  { id: 1, name: 'Demo Inventory', description: 'Demo hosts', organization: 'Default' },
  { id: 2, name: 'Production', description: 'Production hosts', organization: 'Default' },
  { id: 3, name: 'Staging', description: 'Staging hosts', organization: 'Engineering' },
  { id: 4, name: 'Dev Servers', description: 'Development servers', organization: 'Operations' },
]

export const labels = [
  { id: 1, name: 'label1', organization: 1 },
  { id: 2, name: 'label2', organization: 1 },
  { id: 3, name: 'production', organization: 2 },
  { id: 4, name: 'staging', organization: 2 },
  { id: 5, name: 'development', organization: 3 },
]
