import type { SettingsAPI } from '@ansible/nexus-contracts'

type RuntimeSetting = SettingsAPI['components']['schemas']['RuntimeSettingRead']
type SettingCategory = SettingsAPI['components']['schemas']['SettingCategoryRead']

export const settingsCategories: SettingCategory[] = [
  {
    slug: 'ai_llm',
    name: 'AI / LLM',
    description: 'Artificial intelligence and large language model settings',
    group_names: [],
  },
  {
    slug: 'system',
    name: 'System',
    description: 'System-level settings including observability and diagnostics',
    group_names: ['Observability'],
  },
  {
    slug: 'context_manager',
    name: 'Context Manager',
    description: 'Token limits, retrieval, grounding, compression, and context assembly',
    group_names: [
      'Compression',
      'Context assembly',
      'Grounding scores',
      'Performance',
      'Retrieval',
      'Snippets',
      'Token limits',
    ],
  },
  {
    slug: 'workflow_execution',
    name: 'Workflow Execution',
    description: 'Workflow execution and orchestration settings',
    group_names: [],
  },
  {
    slug: 'integrations',
    name: 'Integrations',
    description: 'Third-party integration settings',
    group_names: [],
  },
  {
    slug: 'application',
    name: 'Application',
    description: 'Application-level settings',
    group_names: [],
  },
]

let nextVersion = 1

function makeSetting(
  overrides: Partial<RuntimeSetting> &
    Pick<RuntimeSetting, 'key' | 'name' | 'category' | 'value_type' | 'default_value'>
): RuntimeSetting {
  const now = new Date().toISOString()
  const version = nextVersion++
  return {
    id: crypto.randomUUID(),
    description: null,
    group: null,
    value: null,
    effective_value: overrides.default_value,
    requires_restart: false,
    cache_ttl_seconds: null,
    validation_schema: null,
    version,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

export const settings: RuntimeSetting[] = [
  // ── Context Manager: Compression ────────────────────────────────────────
  makeSetting({
    key: 'context_manager.compression_loop',
    name: 'Compression loop',
    description: 'Maximum number of compression retry attempts',
    category: 'context_manager',
    group: 'Compression',
    value_type: 'integer',
    default_value: 3,
    validation_schema: { min: 0 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.compression_max_tokens',
    name: 'Compression max tokens',
    description: 'Maximum tokens for compression LLM responses',
    category: 'context_manager',
    group: 'Compression',
    value_type: 'integer',
    default_value: 2000,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.compression_mode',
    name: 'Compression mode',
    description: 'Compression mode (extractive or abstractive)',
    category: 'context_manager',
    group: 'Compression',
    value_type: 'string',
    default_value: 'extractive',
    validation_schema: { allowed_values: ['extractive', 'abstractive'] } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.compression_temperature',
    name: 'Compression temperature',
    description: 'LLM temperature for compression operations (0.0-1.0)',
    category: 'context_manager',
    group: 'Compression',
    value_type: 'float',
    default_value: 0.3,
    validation_schema: { min: 0, max: 1 } as unknown as Record<string, never>,
  }),

  // ── Context Manager: Context assembly ───────────────────────────────────
  makeSetting({
    key: 'context_manager.enforce_hierarchy',
    name: 'Hierarchical ordering',
    description: 'Enforce hierarchical ordering of context sections',
    category: 'context_manager',
    group: 'Context assembly',
    value_type: 'boolean',
    default_value: true,
  }),
  makeSetting({
    key: 'context_manager.include_citations',
    name: 'Include source citations',
    description: 'Include source citations in assembled context',
    category: 'context_manager',
    group: 'Context assembly',
    value_type: 'boolean',
    default_value: true,
  }),
  makeSetting({
    key: 'context_manager.priority_order',
    name: 'Priority order',
    description: 'Priority order for context sections',
    category: 'context_manager',
    group: 'Context assembly',
    value_type: 'json',
    default_value: ['system', 'context', 'user'],
  }),

  // ── Context Manager: Grounding scores ───────────────────────────────────
  makeSetting({
    key: 'context_manager.minimum_grounding_score',
    name: 'Minimum grounding score',
    description: 'Minimum grounding score threshold (0.0-1.0)',
    category: 'context_manager',
    group: 'Grounding scores',
    value_type: 'float',
    default_value: 0.5,
    validation_schema: { min: 0, max: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.required_grounding_score',
    name: 'Required grounding score',
    description: 'Required grounding score threshold (0.0-1.0)',
    category: 'context_manager',
    group: 'Grounding scores',
    value_type: 'float',
    default_value: 0.7,
    validation_schema: { min: 0, max: 1 } as unknown as Record<string, never>,
  }),

  // ── Context Manager: Performance ────────────────────────────────────────
  makeSetting({
    key: 'context_manager.max_concurrent_requests',
    name: 'Max concurrent requests',
    description: 'Maximum number of concurrent context requests',
    category: 'context_manager',
    group: 'Performance',
    value_type: 'integer',
    default_value: 5,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.request_timeout_seconds',
    name: 'Request timeout (seconds)',
    description: 'Maximum time allowed for context manager requests',
    category: 'context_manager',
    group: 'Performance',
    value_type: 'integer',
    default_value: 30,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),

  // ── Context Manager: Retrieval ──────────────────────────────────────────
  makeSetting({
    key: 'context_manager.default_k',
    name: 'Default K (documents to retrieve)',
    description: 'Default number of documents to retrieve',
    category: 'context_manager',
    group: 'Retrieval',
    value_type: 'integer',
    default_value: 10,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.enable_hybrid_search',
    name: 'Hybrid search',
    description: 'Enable hybrid search (semantic + lexical)',
    category: 'context_manager',
    group: 'Retrieval',
    value_type: 'boolean',
    default_value: true,
  }),
  makeSetting({
    key: 'context_manager.lexical_weight',
    name: 'Lexical weight',
    description: 'Weight for lexical search in hybrid mode (0.0-1.0)',
    category: 'context_manager',
    group: 'Retrieval',
    value_type: 'float',
    default_value: 0.3,
    validation_schema: { min: 0, max: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.semantic_weight',
    name: 'Semantic weight',
    description: 'Weight for semantic search in hybrid mode (0.0-1.0)',
    category: 'context_manager',
    group: 'Retrieval',
    value_type: 'float',
    default_value: 0.7,
    validation_schema: { min: 0, max: 1 } as unknown as Record<string, never>,
  }),

  // ── Context Manager: Snippets ───────────────────────────────────────────
  makeSetting({
    key: 'context_manager.max_snippets_per_doc',
    name: 'Max snippets per document',
    description: 'Maximum number of snippets to extract per document',
    category: 'context_manager',
    group: 'Snippets',
    value_type: 'integer',
    default_value: 3,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.snippet_max_length',
    name: 'Snippet max length (chars)',
    description: 'Maximum length of extracted snippets in characters',
    category: 'context_manager',
    group: 'Snippets',
    value_type: 'integer',
    default_value: 500,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.snippet_min_length',
    name: 'Snippet min length (chars)',
    description: 'Minimum length of extracted snippets in characters',
    category: 'context_manager',
    group: 'Snippets',
    value_type: 'integer',
    default_value: 100,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),

  // ── Context Manager: Token limits ───────────────────────────────────────
  makeSetting({
    key: 'context_manager.max_context_tokens',
    name: 'Max context tokens',
    description: 'Maximum tokens for context content',
    category: 'context_manager',
    group: 'Token limits',
    value_type: 'integer',
    default_value: 3000,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.max_system_tokens',
    name: 'Max system tokens',
    description: 'Maximum tokens for system prompts',
    category: 'context_manager',
    group: 'Token limits',
    value_type: 'integer',
    default_value: 500,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.max_total_tokens',
    name: 'Max total tokens',
    description: 'Maximum total tokens in context package',
    category: 'context_manager',
    group: 'Token limits',
    value_type: 'integer',
    default_value: 4000,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'context_manager.max_user_tokens',
    name: 'Max user tokens',
    description: 'Maximum tokens for user messages',
    category: 'context_manager',
    group: 'Token limits',
    value_type: 'integer',
    default_value: 500,
    validation_schema: { min: 1 } as unknown as Record<string, never>,
  }),

  // ── System ──────────────────────────────────────────────────────────────
  makeSetting({
    key: 'logging.log_level',
    name: 'System Log Level',
    description: 'System logging level. Changes are applied dynamically.',
    category: 'system',
    value_type: 'string',
    default_value: 'INFO',
    validation_schema: {
      allowed_values: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
    } as unknown as Record<string, never>,
  }),
  makeSetting({
    key: 'metrics.perf_test_mode',
    name: 'Performance test mode',
    description:
      'Enable internal metrics store and /_internal/metrics/* endpoints for performance testing. When enabled, raw metric records are stored in memory and queryable without an application restart.',
    category: 'system',
    group: 'Observability',
    value_type: 'boolean',
    default_value: false,
  }),

  // ── AI / LLM ──────────────────────────────────────────────────────────
  makeSetting({
    key: 'retriever.llm_model',
    name: 'Retriever LLM model',
    description: 'OpenRouter model for LLM relevancy checking',
    category: 'ai_llm',
    value_type: 'string',
    default_value: 'anthropic/claude-3.5-sonnet',
    requires_restart: true,
  }),
]
