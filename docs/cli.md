# AAP Orchestrator CLI

The `ao` command-line client provides access to the AAP Orchestrator API from the terminal. It dynamically builds commands at runtime from the OpenAPI spec and ships as a standalone `aap-orchestrator-cli` Python package (separate from the auto-generated `nexus-api-client`).

## Installation

```bash
pip install aap-orchestrator-cli
```

This installs the `ao` command. You can also run it as a Python module:

```bash
python -m aap_orchestrator_cli
```

## Authentication

### Login (recommended)

```bash
ao authentication login --username admin --password <password>
```

On success, the token is **automatically saved** to `~/.aap/orchestrator/` and used for all subsequent commands — no need to pass `--token` or set environment variables.

Tokens are stored per-instance, so you can work with multiple servers without conflicts. Expired tokens are automatically purged.

### Environment variables

```bash
export AO_URL=http://localhost:8000/api/v1
export AO_TOKEN=<your-jwt-token>
```

### CLI flags

```bash
ao --base-url http://localhost:8000/api/v1 --token <token> users list
```

### Resolution order

The CLI resolves the token in this order (first match wins):

1. `--token` flag
2. `AO_TOKEN` environment variable
3. Cached token from `~/.aap/orchestrator/` (saved by `login`)

If neither is set, `--base-url` defaults to `http://localhost:8000/api/v1`.

### Extracting the token (scripting)

If you need the raw token for scripting:

```bash
export AO_TOKEN=$(ao authentication login \
  --username admin --password secret | jq -r .access_token)
```

## Command structure

Commands follow a `<resource> <action>` pattern:

```
ao <resource-group> <command> [ARGUMENTS] [OPTIONS]
```

- **Resource groups** map to API tags: `users`, `groups`, `projects`, `workflows`, `roles`, `policies`, `role-assignments`, `credentials`, etc.
- **Commands** map to API operations: `list`, `create`, `get`, `update`, `delete`, plus resource-specific actions like `add-member`, `list-role-assignments`, etc.
- **Arguments** are positional (path parameters like IDs).
- **Options** are named flags (`--name`, `--email`, etc.).

### Examples

```bash
# Login (token is saved automatically)
ao authentication login --username admin --password secret

# User management
ao users list
ao users create --username alice --email alice@example.com \
  --full-name "Alice" --password secret
ao users get <user-id>
ao users update <user-id> --full-name "Alice Smith"
ao users delete <user-id>

# Groups
ao groups create --name backend-eng --description "Backend team"
ao groups list
ao groups add-member <group-id> --user-id <user-id>
ao groups list-members <group-id>

# Projects
ao projects create --name staging --description "Staging environment"
ao projects list

# Role assignments
ao role-assignments create --principal-type user \
  --principal-id <user-id> --role-name admin
ao users create-role-assignment <user-id> --role-name viewer
ao users create-role-assignment <user-id> --role-name project-admin \
  --project-id <project-id>

# Workflows
ao workflows create --name my-workflow \
  --workflow-definition @workflow.json --project-id <project-id>
ao workflows list
ao workflows get <workflow-id>

# Authorization checks
ao authorization can-i --action read --resource-type workflow
ao authorization what-can-i

# Credentials
ao credentials create --name "my-aap" --credential-type-id <type-id> \
  --project-id <project-id> --inputs '{"host": "https://aap.example.com", "token": "..."}'

# Audit
ao audit-events list --limit 50 --event-category authorization
```

## Output format

All commands output JSON to stdout. Errors are printed to stderr with a non-zero exit code.

Successful response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "alice",
  "email": "alice@example.com",
  "full_name": "Alice",
  "is_active": true,
  "created_at": "2025-01-15T10:30:00Z"
}
```

Error response (stderr):

```json
{
  "error": {
    "type": "https://example.com/errors/not-found",
    "title": "Not Found",
    "detail": "User not found"
  },
  "status": 404
}
```

### Piping and scripting

The JSON output is designed for piping with `jq`:

```bash
# Get all usernames
ao users list | jq -r '.resources[].username'

# Get a project ID by name
PROJECT_ID=$(ao projects list | jq -r '.resources[] | select(.name=="staging") | .id')

# Create a user and capture the ID
USER_ID=$(ao users create --username bob --email bob@example.com \
  --full-name "Bob" --password secret | jq -r .id)
```

## Complex fields

Some commands accept complex values (objects, arrays). These can be passed as:

1. **Inline JSON string**: `--inputs '{"host": "https://example.com"}'`
2. **File reference**: `--workflow-definition @path/to/workflow.json`

The `@` prefix reads the file contents and parses it as JSON.

## Discovering commands

Every command supports `--help`:

```bash
ao --help                    # list all resource groups
ao users --help              # list all user commands
ao users create --help       # show all options for user creation
```

Help text includes parameter descriptions, default values, and enum choices where applicable.

## How the CLI works

The CLI is built dynamically at runtime from the OpenAPI specification — there are no generated CLI source files to maintain. When you run any `ao` command:

1. The CLI locates the schema sources under `src/nexus/schemas/`
2. It hashes all source files and compares against a saved manifest in `~/.aap/orchestrator/spec-hashes.json`
3. If anything changed (or no cache exists), the spec is re-bundled and cached to `~/.aap/orchestrator/openapi.json`
4. Commands, arguments, and options are constructed from the cached spec at runtime

When the API spec changes, the CLI automatically picks up the changes on the next invocation — no code generation step required.

### File layout

```
src/
├── cli/                         # hand-written CLI package (never auto-generated)
│   ├── pyproject.toml           # CLI package metadata, deps, and entrypoint
│   └── aap_orchestrator_cli/
│       ├── __init__.py          # app entrypoint, global options (--base-url, --token)
│       ├── __main__.py          # python -m support
│       ├── auth.py              # token persistence (~/.aap/orchestrator/)
│       ├── commands.py          # dynamic command builder (spec → Typer commands)
│       └── spec.py              # spec caching and auto-bundling
├── api_client/                  # auto-generated API client (regenerated by make)
│   ├── pyproject.toml           # generated package metadata
│   └── nexus_api_client/
│       ├── api/                 # generated endpoint modules
│       ├── models/              # generated model classes
│       ├── client.py            # Client / AuthenticatedClient
│       └── ...
```

### Local data (`~/.aap/orchestrator/`)

| File | Purpose |
|------|---------|
| `openapi.json` | Cached bundled OpenAPI spec |
| `spec-hashes.json` | SHA-256 manifest of schema source files |
| `<instance>.json` | Saved auth token (one per server instance) |

### Benchmarking CLI overhead

Set `AO_BENCHMARK=1` to print a timing breakdown to `stderr` for one CLI invocation:

```bash
AO_BENCHMARK=1 ao --base-url http://localhost:8000/api/v1 groups list --limit 1
```

The summary includes startup phases such as spec loading and dynamic command construction, plus request phases such as client creation, model import, endpoint import, API call, and response formatting.
