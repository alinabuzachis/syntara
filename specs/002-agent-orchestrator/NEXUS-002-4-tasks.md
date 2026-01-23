# Tasks: NEXUS-002-4 - Generic Agent for Information Queries

**Input**: Design documents from `/specs/002-agent-orchestrator/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/agent-orchestrator-api.yaml
**JIRA Issue**: NEXUS-002-4
**Dependencies**: NEXUS-002-1 (async invocation working)

## Overview

**⚠️ ARCHITECTURE UPDATED:** This task list implements NEXUS-002-4: Generic Agent for Information Queries.

**IMPLEMENTED APPROACH:** The feature was simplified from the original complex routing design. Instead of complex routing logic, we implemented a direct GenericAgent that handles all invocation requests. The routing functionality was removed for simplicity.

**COMPLETED CORE FUNCTIONALITY:**
- ✅ GenericAgent with LangChain + OpenRouter integration
- ✅ Proper SQLModel data models
- ✅ Integration tests and full API functionality
- ✅ All 797 tests passing

## Key Completed Features

- **GenericAgent with LangChain + OpenRouter**: Direct LLM integration for answering user queries
- **SQLModel data models**: Proper agent response schemas using project standards
- **Integration tests**: End-to-end API functionality verified
- **Type safety**: Full mypy strict mode compliance

---

## Phase 3.1: Setup

- [x] **T001** Review existing codebase structure
  - Read `src/nexus/api/services/routing_service.py` (existing routing logic to refactor)
  - Read `src/nexus/api/api/v1/invocation.py` (POST `/invocations` endpoint)
  - Read `src/nexus/api/clients/a2a_client.py` (ignore A2A - work directly with agents)
  - Confirm no WorkflowGeneratorAgent exists yet (will be mocked)
  - Document current routing logic and what needs to change

- [x] **T002** Add LangChain dependencies with OpenRouter support to pyproject.toml
  - Verify `langchain` is present (should already be in codebase)
  - Verify `langgraph` is present (should already be in codebase)
  - Verify `langchain-openai` is present (for OpenRouter compatibility - uses OpenAI SDK format)
  - Add `python-dotenv` for environment variable management (if not present)
  - Verify dependencies don't conflict with existing versions

- [x] **T003** [P] Configure LangChain to use OpenRouter as LLM provider
  - Create `.env.example` with `NEXUS_OPENROUTER_API_KEY=your_key_here`
  - Create `.env.example` with `NEXUS_OPENROUTER_MODEL=anthropic/claude-3.5-sonnet`
  - Create `.env.example` with `NEXUS_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
  - Document LangChain OpenRouter configuration in `src/nexus/core/config/base.py` or similar
  - Add validation for required environment variables
  - Document that OpenRouter uses OpenAI-compatible API format

---

## Completed Core Tasks

- [x] **T006** GenericAgent unit tests - LangChain integration, error handling, response validation
- [x] **T008** Integration tests - End-to-end API functionality for information queries

- [x] **T011** GenericAgentResponse schema - SQLModel-based response structure
- [x] **T012** OpenRouter configuration - Created base.py in src/nexus/core/config for LLM configuration management
- [x] **T013** GenericAgent implementation - LangChain with OpenRouter integration

## Current Status

✅ **All core functionality implemented and working:**
- GenericAgent successfully handles information queries via LangChain + OpenRouter
- SQLModel data models properly structured
- All 797 tests passing with type checking clean
- API endpoints functional and tested

---

_Implementation completed for NEXUS-002-4 - Generic Agent for Information Queries_
