"""Application-wide constants.

All constants can be overridden via environment variables for deployment flexibility.
See docs/CONFIGURATION.md for detailed documentation.
"""

import os

# Temporal configuration
# These defaults are suitable for local development.
# Override via environment variables for production deployments.

DEFAULT_TEMPORAL_ADDRESS = os.getenv("NEXUS_TEMPORAL_ADDRESS", "localhost:7233")
"""Temporal server address (host:port).

Environment variable: NEXUS_TEMPORAL_ADDRESS
Default: localhost:7233 (local development)
Production example: temporal.example.com:7233
"""

DEFAULT_TEMPORAL_NAMESPACE = os.getenv("NEXUS_TEMPORAL_NAMESPACE", "default")
"""Temporal namespace for workflow isolation.

Environment variable: NEXUS_TEMPORAL_NAMESPACE
Default: default
Recommended per environment:
- Development: default or dev
- Staging: staging
- Production: production
"""

DEFAULT_TASK_QUEUE = os.getenv("NEXUS_TASK_QUEUE", "nexus-workflow-queue")
"""Temporal task queue name for workflow routing.

Environment variable: NEXUS_TASK_QUEUE
Default: nexus-workflow-queue
Use cases for multiple queues:
- Environment isolation: dev-queue, staging-queue, prod-queue
- Priority tiers: high-priority-queue, standard-queue
- Feature segregation: data-processing-queue, api-workflows-queue
"""

# Workflow execution limits

MAX_LOOP_ITERATIONS = int(os.getenv("NEXUS_MAX_LOOP_ITERATIONS", "10000"))
"""Maximum iterations for loops to prevent runaway execution.

Environment variable: NEXUS_MAX_LOOP_ITERATIONS
Default: 10000

This protects against:
- Infinite loops due to logic errors
- Resource exhaustion (memory, CPU, Temporal history size)
- Accidental DDoS on downstream services

Recommended values:
- Development: 10000 (default)
- Production (general): 10000
- Production (batch processing): 50000
- Production (strict): 1000

Individual workflows can set lower maxIterations, but cannot exceed this system limit.
"""
