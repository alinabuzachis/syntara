#!/usr/bin/env bash
# Comprehensive Alembic migration validation for CI/CD pipelines

set -e

# Colors
RED='\033[91m'
GREEN='\033[92m'
BLUE='\033[94m'
RESET='\033[0m'

check_migration_chain() {
    echo -e "\n${BLUE}📋 Step 1: Validating migration chain...${RESET}"
    if ! uv run alembic history >/dev/null 2>&1; then
        echo -e "${RED}❌ Migration chain is broken!${RESET}" >&2
        echo ""
        echo "This usually means:"
        echo "  - A migration file was deleted"
        echo "  - A migration references a missing parent"
        echo "  - Merge conflicts weren't properly resolved"
        echo ""
        echo "Run 'alembic history' to see the error details"
        return 1
    fi
    echo -e "${GREEN}✅ Migration chain is valid${RESET}"
}

check_multiple_heads() {
    echo -e "\n${BLUE}📋 Step 2: Checking for multiple heads...${RESET}"
    HEADS_COUNT=$(uv run alembic heads 2>/dev/null | wc -l | tr -d ' ')
    if [ "$HEADS_COUNT" -gt 1 ]; then
        echo -e "${RED}❌ Multiple migration heads detected ($HEADS_COUNT heads)!${RESET}" >&2
        echo ""
        echo "Migration branches:"
        uv run alembic branches -v
        echo ""
        echo "You need to merge migrations using: alembic merge -m 'merge heads' <rev1> <rev2>"
        return 1
    fi
    echo -e "${GREEN}✅ No multiple heads detected${RESET}"
}

check_pending_migrations() {
    echo -e "\n${BLUE}📋 Step 3: Applying migrations and checking for pending changes...${RESET}"

    # First, ensure we're at head
    echo "   Upgrading to head..."
    if ! uv run alembic upgrade head; then
        echo -e "${RED}❌ Failed to upgrade to head${RESET}" >&2
        return 1
    fi

    # Now check if models match migrations
    echo "   Checking for pending migrations..."
    if ! uv run alembic check 2>&1; then
        echo -e "${RED}❌ Pending migrations detected or models don't match migrations!${RESET}" >&2
        echo ""
        echo "This usually means:"
        echo "  - Models were changed without creating a migration"
        echo "  - Run 'alembic revision --autogenerate -m \"description\"' to create migration"
        return 1
    fi
    echo -e "${GREEN}✅ No pending migrations, models match migrations${RESET}"
}

check_downgrade_upgrade() {
    echo -e "\n${BLUE}📋 Step 4: Testing downgrade/upgrade consistency...${RESET}"

    # We're already at head from Step 3, so downgrade all the way to base
    echo "   Downgrading to base (removing all migrations)..."
    if ! uv run alembic downgrade base; then
        echo -e "${RED}❌ Downgrade to base failed!${RESET}" >&2
        echo ""
        echo "This usually means:"
        echo "  - A downgrade() function in one of the migrations is broken"
        echo "  - Missing or incorrect downgrade logic"
        return 1
    fi

    echo "   Upgrading back to head..."
    if ! uv run alembic upgrade head; then
        echo -e "${RED}❌ Upgrade to head failed after downgrade!${RESET}" >&2
        return 1
    fi

    echo -e "${GREEN}✅ Full downgrade/upgrade cycle successful${RESET}"
}

# Main execution
echo -e "${BLUE}🔍 Running comprehensive migration checks...${RESET}"
check_migration_chain && \
check_multiple_heads && \
check_pending_migrations && \
check_downgrade_upgrade

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ All migration checks passed!${RESET}"
    exit 0
fi
exit 1
