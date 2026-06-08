"""use UUIDv7 in audit trigger

UUIDv7 embeds a millisecond timestamp and is lexicographically sortable,
giving audit outbox records a time-correlated ID without an extra column.

Revision ID: c3d4e5f6a7b8
Revises: bd82aa297b0e
Create Date: 2026-06-02 13:21:51.004849

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "24da7d53e012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# CUSTOM: Pure PL/pgSQL UUIDv7 generator (RFC 9562)
_UUID_GENERATE_V7 = """
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
    ts_ms bigint;
    bytes bytea;
BEGIN
    ts_ms := extract(epoch FROM clock_timestamp()) * 1000;
    bytes := substring(int8send(ts_ms) FROM 3)   -- 6-byte ms timestamp
          || gen_random_bytes(10);                -- 10 random bytes
    -- version nibble: 0111 (7)
    bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & x'0f'::int) | x'70'::int);
    -- variant bits: 10xx
    bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & x'3f'::int) | x'80'::int);
    RETURN encode(bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;
"""
# END CUSTOM


def upgrade() -> None:
    """Create uuid_generate_v7() and update audit trigger to use it."""
    # CUSTOM: Create UUIDv7 function
    op.execute(_UUID_GENERATE_V7)
    # END CUSTOM

    # CUSTOM: Replace gen_random_uuid() with uuid_generate_v7() in audit trigger
    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_crud_operation()
        RETURNS TRIGGER AS $$
        DECLARE
            -- Session variables
            v_actor_id uuid;
            v_actor_username text;
            v_actor_type text;
            v_workflow_id uuid;
            v_execution_id uuid;
            v_activity_id text;

            -- Audit metadata
            v_audit_level text;
            v_auditable_fields text[];

            -- Resource metadata
            v_operation text;
            v_model_name text;
            v_resource_id uuid;
            v_resource_urn text;
            v_resource_name text;

            -- Event data
            v_resource_data jsonb;
            v_changes jsonb;
            v_audit_event jsonb;

            -- Row JSON representations
            v_old_json jsonb;
            v_new_json jsonb;

            -- Misc
            v_event_verb text;
        BEGIN
            -- Prevent accidental recursion
            IF TG_TABLE_NAME = 'audit_outbox' THEN
                IF TG_OP = 'DELETE' THEN
                    RETURN OLD;
                ELSE
                    RETURN NEW;
                END IF;
            END IF;

            BEGIN
                -- ------------------------------------------------------
                -- Session context
                -- ------------------------------------------------------
                BEGIN
                    v_actor_id := nullif(current_setting('app.actor_id', true), '')::uuid;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_actor_id := NULL;
                END;

                BEGIN
                    v_workflow_id := nullif(current_setting('app.workflow_id', true), '')::uuid;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_workflow_id := NULL;
                END;

                BEGIN
                    v_execution_id := nullif(current_setting('app.execution_id', true), '')::uuid;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_execution_id := NULL;
                END;

                v_actor_username := nullif(current_setting('app.actor_username', true), '');
                v_actor_type := nullif(current_setting('app.actor_type', true), '');
                v_activity_id := nullif(current_setting('app.activity_id', true), '');

                -- ------------------------------------------------------
                -- Load audit metadata
                -- ------------------------------------------------------
                SELECT
                    model_name,
                    audit_level,
                    auditable_fields
                INTO
                    v_model_name,
                    v_audit_level,
                    v_auditable_fields
                FROM audit_table_metadata
                WHERE table_name = TG_TABLE_NAME;

                -- Table is not audited
                IF NOT FOUND THEN
                    IF TG_OP = 'DELETE' THEN
                        RETURN OLD;
                    ELSE
                        RETURN NEW;
                    END IF;
                END IF;

                -- ------------------------------------------------------
                -- Build JSON representations
                -- ------------------------------------------------------
                IF TG_OP != 'DELETE' THEN
                    v_new_json := to_jsonb(NEW);
                END IF;

                IF TG_OP != 'INSERT' THEN
                    v_old_json := to_jsonb(OLD);
                END IF;

                -- ------------------------------------------------------
                -- Determine operation + resource id
                -- ------------------------------------------------------
                IF TG_OP = 'INSERT' THEN
                    v_operation := 'create';
                    v_resource_id := (v_new_json ->> 'id')::uuid;

                ELSIF TG_OP = 'UPDATE' THEN
                    v_operation := 'update';
                    v_resource_id := coalesce(
                        (v_new_json ->> 'id')::uuid,
                        (v_old_json ->> 'id')::uuid
                    );

                ELSIF TG_OP = 'DELETE' THEN
                    v_operation := 'delete';
                    v_resource_id := (v_old_json ->> 'id')::uuid;
                END IF;

                v_resource_urn := format(
                    'urn:nexus:%s:%s',
                    coalesce(v_model_name, TG_TABLE_NAME),
                    coalesce(v_resource_id::text, 'unknown')
                );

                -- ------------------------------------------------------
                -- Resource name (optional)
                -- ------------------------------------------------------
                IF TG_OP = 'DELETE' THEN
                    v_resource_name := v_old_json ->> 'name';
                ELSE
                    v_resource_name := v_new_json ->> 'name';
                END IF;

                -- ------------------------------------------------------
                -- Build operation-specific payload
                -- ------------------------------------------------------
                IF TG_OP = 'INSERT' THEN
                    v_resource_data := _build_resource_snapshot(
                        v_new_json,
                        v_audit_level,
                        v_auditable_fields
                    );

                    v_changes := NULL;

                ELSIF TG_OP = 'UPDATE' THEN
                    v_changes := _build_changes(
                        v_old_json,
                        v_new_json,
                        v_audit_level,
                        v_auditable_fields
                    );

                    v_resource_data := NULL;

                    -- Skip empty updates
                    IF v_changes = '{}'::jsonb THEN
                        RETURN NEW;
                    END IF;

                ELSIF TG_OP = 'DELETE' THEN
                    v_resource_data := _build_resource_snapshot(
                        v_old_json,
                        v_audit_level,
                        v_auditable_fields
                    );

                    v_changes := NULL;
                END IF;

                -- ------------------------------------------------------
                -- Human-readable event verb
                -- ------------------------------------------------------
                v_event_verb := CASE v_operation
                    WHEN 'create' THEN 'created'
                    WHEN 'update' THEN 'updated'
                    WHEN 'delete' THEN 'deleted'
                    ELSE v_operation
                END;

                -- ------------------------------------------------------
                -- Build canonical audit event
                -- ------------------------------------------------------
                v_audit_event := jsonb_build_object(
                    'event_id', uuid_generate_v7(),
                    'event_category', 'system_operation',
                    'event_severity', 'info',
                    'event_status', 'success',
                    'event_action', lower(v_model_name) || '_' || v_operation,
                    'actor_id', v_actor_id,
                    'actor_type', v_actor_type,
                    'actor_username', v_actor_username,
                    'source_component', 'database.trigger',
                    'resource_urn', v_resource_urn,
                    'resource_name', v_resource_name,
                    'workflow_id', v_workflow_id,
                    'activity_id', v_activity_id,
                    'execution_id', v_execution_id,
                    'event_message', v_model_name || ' ' || v_event_verb,
                    'structured_data', jsonb_build_object(
                        'data_type', 'crud_operation',
                        'operation', v_operation,
                        'model_name', v_model_name,
                        'resource_id', coalesce(v_resource_id::text, ''),
                        'changes', v_changes,
                        'resource_data', v_resource_data
                    )
                );

                -- ------------------------------------------------------
                -- Write to transactional outbox
                -- ------------------------------------------------------
                INSERT INTO audit_outbox (
                    id,
                    created_at,
                    event_source,
                    event_payload
                ) VALUES (
                    uuid_generate_v7(),
                    now(),
                    'crud_event',
                    v_audit_event
                );

            EXCEPTION WHEN OTHERS THEN
                -- Never break the business transaction because auditing failed
                RAISE WARNING
                    'Audit trigger failed for %.% [%]: %',
                    TG_TABLE_SCHEMA,
                    TG_TABLE_NAME,
                    SQLSTATE,
                    SQLERRM;
            END;

            -- ----------------------------------------------------------
            -- Preserve original row semantics
            -- ----------------------------------------------------------
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    # END CUSTOM


def downgrade() -> None:
    """Revert audit trigger to gen_random_uuid() and drop uuid_generate_v7()."""
    # CUSTOM: Restore original trigger using gen_random_uuid()
    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_crud_operation()
        RETURNS TRIGGER AS $$
        DECLARE
            -- Session variables
            v_actor_id uuid;
            v_actor_username text;
            v_actor_type text;
            v_workflow_id uuid;
            v_execution_id uuid;
            v_activity_id text;

            -- Audit metadata
            v_audit_level text;
            v_auditable_fields text[];

            -- Resource metadata
            v_operation text;
            v_model_name text;
            v_resource_id uuid;
            v_resource_urn text;
            v_resource_name text;

            -- Event data
            v_resource_data jsonb;
            v_changes jsonb;
            v_audit_event jsonb;

            -- Row JSON representations
            v_old_json jsonb;
            v_new_json jsonb;

            -- Misc
            v_event_verb text;
        BEGIN
            -- Prevent accidental recursion
            IF TG_TABLE_NAME = 'audit_outbox' THEN
                IF TG_OP = 'DELETE' THEN
                    RETURN OLD;
                ELSE
                    RETURN NEW;
                END IF;
            END IF;

            BEGIN
                -- ------------------------------------------------------
                -- Session context
                -- ------------------------------------------------------
                BEGIN
                    v_actor_id := nullif(current_setting('app.actor_id', true), '')::uuid;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_actor_id := NULL;
                END;

                BEGIN
                    v_workflow_id := nullif(current_setting('app.workflow_id', true), '')::uuid;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_workflow_id := NULL;
                END;

                BEGIN
                    v_execution_id := nullif(current_setting('app.execution_id', true), '')::uuid;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_execution_id := NULL;
                END;

                v_actor_username := nullif(current_setting('app.actor_username', true), '');
                v_actor_type := nullif(current_setting('app.actor_type', true), '');
                v_activity_id := nullif(current_setting('app.activity_id', true), '');

                -- ------------------------------------------------------
                -- Load audit metadata
                -- ------------------------------------------------------
                SELECT
                    model_name,
                    audit_level,
                    auditable_fields
                INTO
                    v_model_name,
                    v_audit_level,
                    v_auditable_fields
                FROM audit_table_metadata
                WHERE table_name = TG_TABLE_NAME;

                -- Table is not audited
                IF NOT FOUND THEN
                    IF TG_OP = 'DELETE' THEN
                        RETURN OLD;
                    ELSE
                        RETURN NEW;
                    END IF;
                END IF;

                -- ------------------------------------------------------
                -- Build JSON representations
                -- ------------------------------------------------------
                IF TG_OP != 'DELETE' THEN
                    v_new_json := to_jsonb(NEW);
                END IF;

                IF TG_OP != 'INSERT' THEN
                    v_old_json := to_jsonb(OLD);
                END IF;

                -- ------------------------------------------------------
                -- Determine operation + resource id
                -- ------------------------------------------------------
                IF TG_OP = 'INSERT' THEN
                    v_operation := 'create';
                    v_resource_id := (v_new_json ->> 'id')::uuid;

                ELSIF TG_OP = 'UPDATE' THEN
                    v_operation := 'update';
                    v_resource_id := coalesce(
                        (v_new_json ->> 'id')::uuid,
                        (v_old_json ->> 'id')::uuid
                    );

                ELSIF TG_OP = 'DELETE' THEN
                    v_operation := 'delete';
                    v_resource_id := (v_old_json ->> 'id')::uuid;
                END IF;

                v_resource_urn := format(
                    'urn:nexus:%s:%s',
                    coalesce(v_model_name, TG_TABLE_NAME),
                    coalesce(v_resource_id::text, 'unknown')
                );

                -- ------------------------------------------------------
                -- Resource name (optional)
                -- ------------------------------------------------------
                IF TG_OP = 'DELETE' THEN
                    v_resource_name := v_old_json ->> 'name';
                ELSE
                    v_resource_name := v_new_json ->> 'name';
                END IF;

                -- ------------------------------------------------------
                -- Build operation-specific payload
                -- ------------------------------------------------------
                IF TG_OP = 'INSERT' THEN
                    v_resource_data := _build_resource_snapshot(
                        v_new_json,
                        v_audit_level,
                        v_auditable_fields
                    );

                    v_changes := NULL;

                ELSIF TG_OP = 'UPDATE' THEN
                    v_changes := _build_changes(
                        v_old_json,
                        v_new_json,
                        v_audit_level,
                        v_auditable_fields
                    );

                    v_resource_data := NULL;

                    -- Skip empty updates
                    IF v_changes = '{}'::jsonb THEN
                        RETURN NEW;
                    END IF;

                ELSIF TG_OP = 'DELETE' THEN
                    v_resource_data := _build_resource_snapshot(
                        v_old_json,
                        v_audit_level,
                        v_auditable_fields
                    );

                    v_changes := NULL;
                END IF;

                -- ------------------------------------------------------
                -- Human-readable event verb
                -- ------------------------------------------------------
                v_event_verb := CASE v_operation
                    WHEN 'create' THEN 'created'
                    WHEN 'update' THEN 'updated'
                    WHEN 'delete' THEN 'deleted'
                    ELSE v_operation
                END;

                -- ------------------------------------------------------
                -- Build canonical audit event
                -- ------------------------------------------------------
                v_audit_event := jsonb_build_object(
                    'event_id', gen_random_uuid(),
                    'event_category', 'system_operation',
                    'event_severity', 'info',
                    'event_status', 'success',
                    'event_action', lower(v_model_name) || '_' || v_operation,
                    'actor_id', v_actor_id,
                    'actor_type', v_actor_type,
                    'actor_username', v_actor_username,
                    'source_component', 'database.trigger',
                    'resource_urn', v_resource_urn,
                    'resource_name', v_resource_name,
                    'workflow_id', v_workflow_id,
                    'activity_id', v_activity_id,
                    'execution_id', v_execution_id,
                    'event_message', v_model_name || ' ' || v_event_verb,
                    'structured_data', jsonb_build_object(
                        'data_type', 'crud_operation',
                        'operation', v_operation,
                        'model_name', v_model_name,
                        'resource_id', coalesce(v_resource_id::text, ''),
                        'changes', v_changes,
                        'resource_data', v_resource_data
                    )
                );

                -- ------------------------------------------------------
                -- Write to transactional outbox
                -- ------------------------------------------------------
                INSERT INTO audit_outbox (
                    id,
                    created_at,
                    event_source,
                    event_payload
                ) VALUES (
                    gen_random_uuid(),
                    now(),
                    'crud_event',
                    v_audit_event
                );

            EXCEPTION WHEN OTHERS THEN
                -- Never break the business transaction because auditing failed
                RAISE WARNING
                    'Audit trigger failed for %.% [%]: %',
                    TG_TABLE_SCHEMA,
                    TG_TABLE_NAME,
                    SQLSTATE,
                    SQLERRM;
            END;

            -- ----------------------------------------------------------
            -- Preserve original row semantics
            -- ----------------------------------------------------------
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute("DROP FUNCTION IF EXISTS uuid_generate_v7() CASCADE;")
    # END CUSTOM
