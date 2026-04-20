#!/bin/bash
# Create the audit database and its dedicated user on the same PostgreSQL
# instance if they don't already exist.
# This script runs during sclorg PostgreSQL container startup via the
# /opt/app-root/src/postgresql-start/ hook directory.

AUDIT_DB="${APP_AUDIT_DB_NAME:-nexus_audit}"
AUDIT_USER="${APP_AUDIT_DB_USER:-nexus_audit}"
AUDIT_PASS="${APP_AUDIT_DB_PASSWORD:-audit_pass}"

# Values come from our own podman-compose.yml environment variables,
# not from external user input.

# Create the audit user if it doesn't exist.
if ! psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${AUDIT_USER}'" | grep -q 1; then
    echo "Creating audit database user '${AUDIT_USER}'..."
    psql -U postgres -c "CREATE ROLE \"${AUDIT_USER}\" WITH LOGIN PASSWORD '${AUDIT_PASS}'"
else
    echo "Audit database user '${AUDIT_USER}' already exists."
fi

# Create the audit database if it doesn't exist.
if ! psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${AUDIT_DB}'" | grep -q 1; then
    echo "Creating audit database '${AUDIT_DB}' owned by '${AUDIT_USER}'..."
    psql -U postgres -c "CREATE DATABASE \"${AUDIT_DB}\" OWNER \"${AUDIT_USER}\""
else
    echo "Audit database '${AUDIT_DB}' already exists."
fi

# Ensure the audit user can create tables in the public schema.
psql -U postgres -d "${AUDIT_DB}" -c "GRANT ALL ON SCHEMA public TO \"${AUDIT_USER}\""
