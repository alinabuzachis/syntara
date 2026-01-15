"""Quickstart validation script for token counting feature.

This script validates all scenarios from quickstart.md to ensure the
implementation matches the specification.
"""

import asyncio
import logging
import sys
import traceback
from datetime import UTC, datetime, timedelta

from nexus.core.database import get_async_session
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.token_manager.exceptions import TokenLimitExceededError
from nexus.agent_orchestrator.token_manager.models import (
    TokenUsageRecord,
    UserTokenConfig,
)
from nexus.agent_orchestrator.token_manager.services import TokenValidationService
from nexus.core.models.user import User, UserRole

# Configure logger to output to stdout
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)

# Test scenario constants
SCENARIO_2_EXPECTED_USAGE = 9500
SCENARIO_3_EXPECTED_USAGE = 3000
SCENARIO_4_USER_A_EXPECTED_USAGE = 4500
SCENARIO_4_USER_B_EXPECTED_USAGE = 9000


async def cleanup_test_data(session: AsyncSession, email_prefix: str = "quickstart_") -> None:
    """Clean up any test data from previous runs."""
    # Find and delete test users
    stmt = select(User).where(User.email.like(f"{email_prefix}%"))  # type: ignore[attr-defined]
    result = await session.execute(stmt)
    users = result.scalars().all()

    for user in users:
        # Delete related token usage records
        usage_stmt = select(TokenUsageRecord).where(TokenUsageRecord.user_id == user.id)
        usage_result = await session.execute(usage_stmt)
        usage_records = usage_result.scalars().all()
        for record in usage_records:
            await session.delete(record)

        # Delete user token configs
        config_stmt = select(UserTokenConfig).where(UserTokenConfig.user_id == user.id)
        config_result = await session.execute(config_stmt)
        configs = config_result.scalars().all()
        for config in configs:
            await session.delete(config)

        # Delete user
        await session.delete(user)

    await session.commit()
    logger.info("Cleaned up %d test users and their related data", len(users))


async def scenario_1_within_limit(session: AsyncSession) -> bool:
    """Scenario 1: Request within limit is accepted."""
    logger.info("\n%s", "=" * 60)
    logger.info("SCENARIO 1: Request Within Limit")
    logger.info("%s", "=" * 60)

    try:
        # Create test user
        user = User(
            username="quickstart_user1",
            email="quickstart_user1@example.com",
            full_name="Quickstart User 1",
            role=UserRole.VIEWER,
        )
        session.add(user)
        await session.commit()

        # Create config with 10,000 token limit
        config = UserTokenConfig(user_id=user.id, token_limit=10000, window_duration_seconds=86400)
        session.add(config)
        await session.commit()

        # Initialize service
        service = TokenValidationService()

        # Simulate 8,000 tokens already used
        # Create a usage record directly
        usage_record = TokenUsageRecord(user_id=user.id, token_count=8000, request_timestamp=datetime.now(UTC))
        session.add(usage_record)
        await session.commit()

        # Test: Submit request with ~1,500 tokens (using 300 words ~ 1500 tokens)
        test_text = "token " * 300

        tokens_used = await service.validate_and_record(user.id, test_text, session)
        logger.info("✅ Request accepted - %d tokens recorded", tokens_used)

        # Verify current usage
        usage_stats = await service.get_current_usage(user.id, session)
        current_usage = usage_stats["current_usage"]
        logger.info("✅ Current usage: %d tokens (expected ~9500)", current_usage)

        # Verify it's within acceptable range (8000 + tokens_used)
        expected = 8000 + tokens_used
        if current_usage != expected:
            logger.error("Usage verification failed: %d != expected %d", current_usage, expected)
            return False

        logger.info("✅ SCENARIO 1 PASSED")
        return True

    except Exception:
        logger.exception("❌ SCENARIO 1 FAILED")
        return False


async def scenario_2_exceeds_limit(session: AsyncSession) -> bool:
    """Scenario 2: Request exceeding limit is blocked."""
    logger.info("\n%s", "=" * 60)
    logger.info("SCENARIO 2: Request Exceeding Limit")
    logger.info("%s", "=" * 60)

    try:
        # Create test user
        user = User(
            username="quickstart_user2",
            email="quickstart_user2@example.com",
            full_name="Quickstart User 2",
            role=UserRole.VIEWER,
        )
        session.add(user)
        await session.commit()

        # Create config
        config = UserTokenConfig(user_id=user.id, token_limit=10000, window_duration_seconds=86400)
        session.add(config)
        await session.commit()

        # Initialize service
        service = TokenValidationService()

        # Simulate 9,500 tokens already used
        usage_record = TokenUsageRecord(user_id=user.id, token_count=9500, request_timestamp=datetime.now(UTC))
        session.add(usage_record)
        await session.commit()

        # Test: Submit request that would exceed limit
        large_text = "token " * 200  # ~1000 tokens

        request_blocked = False
        try:
            await service.validate_and_record(user.id, large_text, session)
            logger.error("❌ Request should have been blocked!")
            return False
        except TokenLimitExceededError as e:
            logger.info("✅ Request blocked: %s", e.message)
            logger.info("   Current usage: %d", e.current_usage)
            logger.info("   Token limit: %d", e.token_limit)
            logger.info("   Request tokens: %d", e.request_tokens)
            request_blocked = True

        # Verify usage wasn't recorded (only if request was blocked)
        if request_blocked:
            usage_stats = await service.get_current_usage(user.id, session)
            final_usage = usage_stats["current_usage"]
            if final_usage != SCENARIO_2_EXPECTED_USAGE:
                logger.error("Usage should still be %d, got %d", SCENARIO_2_EXPECTED_USAGE, final_usage)
                return False
            logger.info("✅ Usage correctly unchanged after rejection")

        logger.info("✅ SCENARIO 2 PASSED")
        return True

    except Exception:
        logger.exception("❌ SCENARIO 2 FAILED")
        return False


async def scenario_3_rolling_window(session: AsyncSession) -> bool:
    """Scenario 3: Rolling window excludes old records."""
    logger.info("\n%s", "=" * 60)
    logger.info("SCENARIO 3: Rolling Window Behavior")
    logger.info("%s", "=" * 60)

    try:
        # Create test user
        user = User(
            username="quickstart_user3",
            email="quickstart_user3@example.com",
            full_name="Quickstart User 3",
            role=UserRole.VIEWER,
        )
        session.add(user)
        await session.commit()

        # Create config with 24-hour window
        config = UserTokenConfig(user_id=user.id, token_limit=10000, window_duration_seconds=86400)
        session.add(config)
        await session.commit()

        # Create old usage record (25 hours ago = 90,000 seconds)
        old_timestamp = datetime.now(UTC) - timedelta(seconds=90000)
        old_record = TokenUsageRecord(user_id=user.id, token_count=5000, request_timestamp=old_timestamp)
        session.add(old_record)

        # Create recent usage record (12 hours ago)
        recent_timestamp = datetime.now(UTC) - timedelta(hours=12)
        recent_record = TokenUsageRecord(user_id=user.id, token_count=3000, request_timestamp=recent_timestamp)
        session.add(recent_record)
        await session.commit()

        # Initialize service
        service = TokenValidationService()

        # Test: Current usage should only include recent record
        usage_stats = await service.get_current_usage(user.id, session)
        current_usage = usage_stats["current_usage"]
        if current_usage != SCENARIO_3_EXPECTED_USAGE:
            logger.error(
                "Expected %d (old record excluded), got %d",
                SCENARIO_3_EXPECTED_USAGE,
                current_usage,
            )
            return False
        logger.info("✅ Rolling window correctly excludes old records: %d tokens", current_usage)

        # Test: New request should be validated against only recent usage
        test_text = "token " * 200  # ~1000 tokens
        tokens_used = await service.validate_and_record(user.id, test_text, session)
        new_usage_stats = await service.get_current_usage(user.id, session)
        new_usage = new_usage_stats["current_usage"]

        expected = SCENARIO_3_EXPECTED_USAGE + tokens_used
        if new_usage != expected:
            logger.error("Expected ~%d, got %d", expected, new_usage)
            return False
        logger.info("✅ New request accepted, total now: %d tokens", new_usage)

        logger.info("✅ SCENARIO 3 PASSED")
        return True

    except Exception:
        logger.exception("❌ SCENARIO 3 FAILED")
        return False


async def scenario_4_per_user_independence(session: AsyncSession) -> bool:
    """Scenario 4: Per-user independence."""
    logger.info("\n%s", "=" * 60)
    logger.info("SCENARIO 4: Per-User Independence")
    logger.info("%s", "=" * 60)

    try:
        # Create two test users
        user_a = User(
            username="quickstart_user_a",
            email="quickstart_user_a@example.com",
            full_name="Quickstart User A",
            role=UserRole.VIEWER,
        )
        user_b = User(
            username="quickstart_user_b",
            email="quickstart_user_b@example.com",
            full_name="Quickstart User B",
            role=UserRole.VIEWER,
        )
        session.add_all([user_a, user_b])
        await session.commit()

        # Create different configs
        config_a = UserTokenConfig(user_id=user_a.id, token_limit=5000, window_duration_seconds=3600)
        config_b = UserTokenConfig(user_id=user_b.id, token_limit=10000, window_duration_seconds=86400)
        session.add_all([config_a, config_b])
        await session.commit()

        # Initialize service
        service = TokenValidationService()

        # User A uses 4,500 tokens
        usage_a = TokenUsageRecord(user_id=user_a.id, token_count=4500, request_timestamp=datetime.now(UTC))
        session.add(usage_a)

        # User B uses 9,000 tokens
        usage_b = TokenUsageRecord(user_id=user_b.id, token_count=9000, request_timestamp=datetime.now(UTC))
        session.add(usage_b)
        await session.commit()

        # Verify independent tracking
        usage_a_stats = await service.get_current_usage(user_a.id, session)
        usage_b_stats = await service.get_current_usage(user_b.id, session)
        usage_a_val = usage_a_stats["current_usage"]
        usage_b_val = usage_b_stats["current_usage"]

        if usage_a_val != SCENARIO_4_USER_A_EXPECTED_USAGE:
            logger.error(
                "User A usage should be %d, got %d",
                SCENARIO_4_USER_A_EXPECTED_USAGE,
                usage_a_val,
            )
            return False
        if usage_b_val != SCENARIO_4_USER_B_EXPECTED_USAGE:
            logger.error(
                "User B usage should be %d, got %d",
                SCENARIO_4_USER_B_EXPECTED_USAGE,
                usage_b_val,
            )
            return False
        logger.info("✅ User A usage: %d (limit: 5000)", usage_a_val)
        logger.info("✅ User B usage: %d (limit: 10000)", usage_b_val)

        # User A can't exceed their limit
        try:
            await service.validate_and_record(user_a.id, "token " * 200, session)
            logger.error("❌ User A should have been blocked")
            return False
        except TokenLimitExceededError:
            logger.info("✅ User A correctly blocked at their limit")

        # User B still has budget
        try:
            tokens = await service.validate_and_record(user_b.id, "token " * 100, session)
            logger.info("✅ User B request accepted (independent budget): %d tokens", tokens)
        except TokenLimitExceededError:
            logger.exception("❌ User B should have been accepted")
            return False

        logger.info("✅ SCENARIO 4 PASSED")
        return True

    except Exception:
        logger.exception("❌ SCENARIO 4 FAILED")
        return False


async def main() -> int:
    """Run all quickstart validation scenarios."""
    logger.info("\n%s", "=" * 60)
    logger.info("QUICKSTART VALIDATION - TOKEN COUNTING FEATURE")
    logger.info("%s", "=" * 60)

    async for session in get_async_session():
        try:
            # Cleanup any previous test data
            await cleanup_test_data(session)

            # Run scenarios
            results = []
            results.append(await scenario_1_within_limit(session))
            results.append(await scenario_2_exceeds_limit(session))
            results.append(await scenario_3_rolling_window(session))
            results.append(await scenario_4_per_user_independence(session))

            # Cleanup test data
            await cleanup_test_data(session)

            # Print summary
            logger.info("\n%s", "=" * 60)
            logger.info("SUMMARY")
            logger.info("%s", "=" * 60)
            passed = sum(results)
            total = len(results)
            logger.info("Passed: %d/%d", passed, total)

            if passed == total:
                logger.info("✅ ALL QUICKSTART SCENARIOS PASSED")
                return 0
            logger.error("❌ SOME SCENARIOS FAILED")
            return 1

        except Exception:
            logger.exception("\n❌ FATAL ERROR")
            traceback.print_exc()
            return 1

    return 1  # Should never reach here, but needed for type checking


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
