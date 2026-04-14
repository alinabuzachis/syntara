# Quickstart: Credential Storage Foundation

**Feature**: 039-credential-storage | **Epic**: AAP-69551

## What This Delivers

A working CRUD API for Credentials — testable via curl/Swagger. All field values encrypted at rest.

## Key Files

| File | Purpose |
|------|---------|
| `src/nexus/credentials/router.py` | REST API endpoints |
| `src/nexus/credentials/services/credential_service.py` | Business logic (CRUD, validation, masking) |
| `src/nexus/credentials/lib/encryption.py` | AES-256-GCM encrypt/decrypt |
| `src/nexus/credentials/lib/storage_backend.py` | StorageBackend Protocol + DatabaseBackend |
| `src/nexus/credentials/lib/injector_resolver.py` | {{field_id}} template resolution |
| `src/nexus/credentials/lib/preseed.py` | 5 GA managed types on startup |
| `src/nexus/credentials/models/credential.py` | Credential model + API schemas |
| `src/nexus/credentials/models/credential_type.py` | CredentialType model |

## Configuration

```bash
# Required — 64-char hex encryption key (32 bytes)
export NEXUS_SECRET_ENCRYPTION_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
```

## Quick Test (curl)

```bash
# List credential types (should return 5 managed types)
curl -s http://localhost:8000/api/v1/credential-types | jq '.resources[].name'

# Create a Bearer Token credential
curl -s -X POST http://localhost:8000/api/v1/credentials \
  -H "Content-Type: application/json" \
  -d '{"name":"My Token","credential_type_id":"<type-uuid>","inputs":{"token":"secret123"}}' | jq

# Get credential (secret masked)
curl -s http://localhost:8000/api/v1/credentials/<id> | jq '.inputs'
# → {"token": "$encrypted$"}
```

## Dependencies

- Epic 2 (AAP-69552): Credential Management UI — needs this API
- Epic 3 (AAP-69553): Workflow Integration — needs this storage layer
- Epic 4 (AAP-69554): Security Hardening — builds on this encryption
