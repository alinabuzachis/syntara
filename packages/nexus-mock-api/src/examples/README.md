# Workflow Examples

This directory contains example YAML workflow files used for testing, demonstration, and documentation purposes.

## Directory Structure

- **`basic/`** - Core example workflows demonstrating fundamental features
  - `hello-world.yaml` - Simple sequential workflow with two bash script activities
  - `loop-demo.yaml` - forEach loop execution with default input values
  - `parallel-demo.yaml` - Parallel activity execution
  - `conditional-demo.yaml` - Conditional branching based on temperature input using nested condition activities
  - `retry-demo.yaml` - Retry policies with exponential and fixed backoff strategies

- **`loops/`** - Examples focused on loop constructs
  - `foreach-items.yaml` - forEach loop with item processing and default values

- **`parallel/`** - Examples focused on parallel execution
  - `parallel-tasks.yaml` - Three parallel tasks executing concurrently

- **`error-handling/`** - Examples demonstrating error handling patterns
  - `failing-task.yaml` - Task with expected failure and retry policy
  - `transient-errors.yaml` - Retry on transient failures with exponential backoff
  - `error-propagation.yaml` - How errors propagate through sequential activities

- **`timeout-retry/`** - Examples focused on timeout and retry scenarios
  - `activity-timeout.yaml` - Activity with timeout configuration
  - `retry-policy.yaml` - Retry policy with exponential backoff
  - `timeout-with-retry.yaml` - Combined timeout and retry policies

- **`parameters/`** - Examples showing parameter mapping patterns
  - `activity-chaining.yaml` - Output-to-input parameter mapping between activities
  - `input-expressions.yaml` - Various input parameter expression formats

- **`agentic/`** - AI agent-driven workflow examples (see `agentic/README.md`)
  - `simple-research.yaml` - Basic agentic research workflow
  - `hybrid-workflow.yaml` - Combined script and agentic tasks
  - `multi-agent-pipeline.yaml` - Sequential specialized agents
  - `parallel-research.yaml` - Parallel agentic research
  - `conditional-agent-routing.yaml` - AI-powered request routing

- **`real-world/`** - Examples using real public APIs (see `real-world/README.md`)
  - `blog-analytics.yaml` - Multi-step blog analytics with JSONPlaceholder
  - `github-repo-info.yaml` - GitHub repository analysis
  - `ip-geolocation.yaml` - IP address geolocation lookup
  - `random-users.yaml` - Random user profile generation
  - `country-info.yaml` - Country information analysis

- **`api/`** - API executor examples (auth, query params, HTTP methods)

- **`condition/`**, **`conditionals/`** - Conditional branching examples

- **`converge/`** - Converge (join) node examples

- **`edge_cases/`** - Edge case and stress-test workflows

- **`join/`** - Join/parallel convergence patterns

- **`metadata/`** - Workflow metadata examples

- **`mixed/`** - Mixed activity type workflows

- **`python/`** - Python script executor examples

- **`retry/`** - Retry policy examples

- **`sequence/`** - Sequential activity workflows

## Usage in This Repository

These YAML files are fixture examples for the mock API package and local UI development. In this repository, use them as:

- Example workflow definitions under `packages/nexus-mock-api/src/examples/`
- Input data copied from the backend repo during `npm run gen`
- Reference files for inspecting workflow syntax and mock responses

```text
packages/nexus-mock-api/src/examples/
├── agentic/
├── api/
├── basic/
├── condition/
├── conditionals/
├── converge/
├── edge_cases/
├── error-handling/
├── join/
├── loops/
├── metadata/
├── mixed/
├── parallel/
├── parameters/
├── python/
├── real-world/
├── retry/
├── sequence/
└── timeout-retry/
```

If you need to execute these workflows with backend tooling, validate them against backend schemas, or run integration tests, do that in the backend repository where the workflow CLI and schema test harness live.

## Adding New Examples

When adding new examples:

1. Place them in the appropriate category directory
2. Keep the YAML aligned with the backend workflow schema so `npm run gen` does not overwrite or regress it
3. Update this README when adding a new category or notable example
4. Make any execution/schema-validation updates in the backend repository as well
