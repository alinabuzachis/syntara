
# Implementation Plan: Context Compression for Multi-Agent System

**Branch**: `018-context-compression` | **Date**: December 1, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-context-compression/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → schemas, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
**IMPLEMENTATION COMPLETED**: Implemented a clean compression service with interface `compress(data: Union[List[str], str], max_tokens: int, strategy: str = "greedy", goal: Optional[str] = None, correlation_id: str = "unknown") -> str` for assembler service integration. The service performs binary decision-making (pass-through or LLM compression) on string-based document data, uses existing TokenCalculator and OpenRouter LLM infrastructure, and provides fail-fast error handling with comprehensive correlation tracing. Key deliverables delivered include CompressorService implementation in `/src/nexus/agent_orchestrator/context_manager/compressor.py`, planner integration updates in `/src/nexus/agent_orchestrator/context_manager/planner.py`, comprehensive test suites, and documentation updates.

## Technical Context
**Language/Version**: Python 3.12
**Primary Dependencies**: Existing TokenCalculator service, OpenRouter LLM service integration, langchain-openai, tiktoken
**Storage**: No additional storage required (stateless string processing service)
**Testing**: pytest with comprehensive unit and integration test coverage
**Target Platform**: Linux server (part of Nexus multi-agent system)
**Project Type**: single (internal service component replacement)
**Performance Goals**: fail-fast error handling
**Constraints**: Simple string interface only, reuse existing infrastructure, no DocumentInput dataclass needed, prepare for assembler service integration in PR 222
**Scale/Scope**: Handle string documents up to model token limits, support concurrent compression operations with correlation tracking

**IMPLEMENTATION STATUS**: ✅ COMPLETED
- **Location**: `/src/nexus/agent_orchestrator/context_manager/compressor.py`
- **Integration**: `/src/nexus/agent_orchestrator/context_manager/planner.py`
- **Tests**: `/tests/integration/test_compression_passthrough.py`, `/tests/integration/test_compression_with_citations.py`
- **Interface**: `compress(data: Union[List[str], str], max_tokens: int, strategy: str = "greedy", goal: Optional[str] = None, correlation_id: str = "unknown") -> str`

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

### Technology Standards Compliance
- [x] **SQLModel for Data Models**: No new data models required (simple string output design)

### Code Architecture Compliance
- [x] **DRY Principle**: Leverages existing TokenCalculator service, reuses LLM infrastructure
- [x] **SOLID Principles**: Single responsibility (compression only), open for extension, dependency injection for services
- [x] **Separation of Concerns**: Clear separation between token counting, compression logic, and LLM integration
- [x] **Dependency Injection**: TokenCalculator and LLM services injected via constructor
- [x] **Composition vs Inheritance**: Uses composition with existing services rather than inheritance

### API Specification Standards Compliance
- [x] **OpenAPI/AsyncAPI Compliance**: No new external APIs (internal service integration only)
- [x] **Naming Convention**: Internal interfaces follow Python naming conventions
- [x] **Documentation Completeness**: Service interfaces documented with type hints and docstrings
- [x] **RFC 9457 Error Format**: Errors handled internally, no external API error responses
- [x] **Error Message Safety**: Internal error handling only, no exposure concerns
- [x] **API Versioning**: Internal service, no versioning requirements
- [x] **API Path Structure**: No REST endpoints (internal Python service)
- [x] **Pagination Support**: Not applicable (processes document collections as units)
- [x] **Filtering/Sorting Consistency**: Not applicable (binary compression decision)
- [x] **Security Documentation**: Internal service, no authentication requirements
- [x] **Schema Compatibility**: No schema changes (simple string interface)

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: [DEFAULT to Option 1 unless Technical Context indicates web/mobile app]

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/AsyncAPI schema to `[project root]/schemas/[component]/`
   - Note: Schemas are stored at project root level, NOT within the specs folder

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, [project root]/schemas/[component]/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (schemas, data model, quickstart)
- Each schema → contract test task [P]
- Each entity → model creation task [P]
- Each user story → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order: Models before services before UI
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Implementation Completed
*These phases were executed and completed successfully*

**Phase 3**: ✅ Tasks generated (`/tasks` command created tasks.md)
**Phase 4**: ✅ Implementation complete (executed tasks.md following constitutional principles)
**Phase 5**: ✅ Validation passed (tests passing, performance validation complete)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command)
- [x] Phase 4: Implementation complete
- [x] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v1.2.0 - See `.specify/memory/constitution.md`*
