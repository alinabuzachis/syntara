"""Shared fixtures for Suite 17: Agent Orchestration performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Agent Orchestration KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile,
poll_for_component_kpis, poll_for_metric_records, submit_invocation,
poll_until_resources_terminal, extract_routing_decisions,
get_configured_models) are defined in the parent
tests/performance/conftest.py and inherited automatically.

This file adds agent-orchestration-specific labeled prompts and helpers
used by the selection accuracy, coordination overhead, and success rate
test modules.

The agent orchestration tests exercise routing accuracy, coordination
overhead, and invocation success rates via the invocation API.  Each
``POST /api/v1/invocations`` triggers the OrchestratorAgent which
records ``AGENT_ROUTING_DURATION``, ``AGENT_STATUS``, and
``COMPONENT_DURATION`` metrics.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM Provider credential** created and enabled on the deployment,
      OR ``E2E_LLM_CREDENTIAL_CONFIGURED=1`` env var set on the deployment
      with a valid ``openrouter_api_key`` in settings.

Run with:
    make test-performance
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Labeled prompt categories for agent selection accuracy testing (17.1)
# ---------------------------------------------------------------------------

AUTOMATION_PROMPTS: list[str] = [
    "Create a workflow that deploys my application to production",
    "Build an automated pipeline to run integration tests nightly",
    "Generate a CI/CD workflow for my Python project",
    "Design an infrastructure provisioning automation script",
    "Make a workflow that scales services based on load metrics",
    "Set up an automated rollback procedure for failed deployments",
    "Create a scheduled job to rotate database credentials weekly",
    "Build a multi-stage deployment pipeline with canary releases",
    "Automate the process of patching servers across environments",
    "Generate a workflow for disaster recovery failover testing",
]

CODE_GENERATION_PROMPTS: list[str] = [
    "Write a Python function to merge two sorted linked lists",
    "Create a REST API endpoint for user registration with validation",
    "Implement a binary search tree with insert, delete, and find operations",
    "Write a decorator that retries failed HTTP requests with exponential backoff",
    "Build a connection pool manager with health checking",
    "Implement a rate limiter using the token bucket algorithm",
    "Write a recursive descent parser for simple arithmetic expressions",
    "Create a thread-safe singleton pattern with lazy initialization",
    "Implement a least recently used cache with O(1) operations",
    "Write a function to detect cycles in a directed graph",
]

ANALYSIS_PROMPTS: list[str] = [
    "Analyze the trade-offs between microservices and monolithic architecture",
    "Explain how Kubernetes handles pod scheduling and resource allocation",
    "Compare PostgreSQL and MySQL for high-write enterprise workloads",
    "Summarize best practices for database connection pooling",
    "What are the security implications of using JWT for authentication",
    "Describe the CAP theorem and its practical implications",
    "Explain the differences between event sourcing and CRUD patterns",
    "Analyze the pros and cons of serverless architecture",
    "Compare gRPC and REST for internal service communication",
    "Evaluate different caching strategies for a read-heavy application",
]

GENERAL_QA_PROMPTS: list[str] = [
    "What is a load balancer?",
    "Define continuous integration in simple terms",
    "What does HTTPS stand for?",
    "Explain what an API gateway does",
    "What is the purpose of a reverse proxy?",
    "What is a container orchestrator?",
    "Define infrastructure as code",
    "What is a message queue used for?",
    "Explain what DNS does",
    "What is the role of a service mesh?",
]

ALL_ORCHESTRATION_PROMPTS: list[str] = (
    AUTOMATION_PROMPTS + CODE_GENERATION_PROMPTS + ANALYSIS_PROMPTS + GENERAL_QA_PROMPTS
)

LABELED_PROMPT_CATEGORIES: dict[str, list[str]] = {
    "automation": AUTOMATION_PROMPTS,
    "code_generation": CODE_GENERATION_PROMPTS,
    "analysis": ANALYSIS_PROMPTS,
    "general_qa": GENERAL_QA_PROMPTS,
}


def build_labeled_prompts(
    prompts_per_category: int = 10,
) -> list[dict[str, str]]:
    """Build a list of prompts with expected routing labels.

    Each entry has ``prompt``, ``category``, and ``expected_agent``.
    The orchestrator currently routes all prompts to ``generic_agent``,
    but the category labels allow the accuracy test to verify that
    routing decisions are consistently recorded.

    When additional specialist agents are added, update the
    ``expected_agent`` mapping per category accordingly.

    Args:
        prompts_per_category: Maximum prompts to take from each category.

    """
    labeled: list[dict[str, str]] = []
    for category, prompts in LABELED_PROMPT_CATEGORIES.items():
        for prompt in prompts[:prompts_per_category]:
            labeled.append(
                {
                    "prompt": prompt,
                    "category": category,
                    "expected_agent": "generic_agent",
                }
            )
    return labeled
