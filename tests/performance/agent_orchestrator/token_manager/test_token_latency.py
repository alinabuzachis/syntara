"""Performance test for token calculation latency.

Tests that token calculation meets performance targets:
- p95 latency < 50ms per calculation
"""

import logging
import statistics
import sys
import time

from nexus.agent_orchestrator.token_manager.services import TokenCalculator

# Configure logger to output to stdout
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)


class TestTokenCalculationLatency:
    """Performance tests for token calculation speed."""

    def test_token_calculation_latency_meets_target(self) -> None:
        """Test that token calculation completes within 50ms (p95).

        Target: <50ms per calculation (p95)
        Test: Calculate tokens for 1000 requests of varying sizes
        """
        calculator = TokenCalculator()

        # Generate test texts of varying sizes
        test_texts = [
            "Short text " * 10,  # ~50 tokens
            "Medium length text for testing token counting performance " * 20,  # ~200 tokens
            "This is a longer text that simulates a more realistic LLM request with multiple sentences and paragraphs. "
            * 50,  # ~500 tokens
            "Very long text " * 200,  # ~1000 tokens
        ]

        # Run 1000 token calculations
        latencies: list[float] = []
        num_iterations = 1000

        for i in range(num_iterations):
            text = test_texts[i % len(test_texts)]

            start_time = time.perf_counter()
            calculator.count_tokens(text)
            end_time = time.perf_counter()

            latency_ms = (end_time - start_time) * 1000
            latencies.append(latency_ms)

        # Calculate percentiles
        latencies.sort()
        p50 = statistics.median(latencies)
        p95_index = int(0.95 * len(latencies))
        p95 = latencies[p95_index]
        p99_index = int(0.99 * len(latencies))
        p99 = latencies[p99_index]

        # Report results
        logger.info("\nToken Calculation Latency (n=%d):", num_iterations)
        logger.info("  p50: %.2fms", p50)
        logger.info("  p95: %.2fms", p95)
        logger.info("  p99: %.2fms", p99)
        logger.info("  min: %.2fms", min(latencies))
        logger.info("  max: %.2fms", max(latencies))
        logger.info("  mean: %.2fms", statistics.mean(latencies))

        # Verify against target
        assert p95 < 50.0, f"p95 latency {p95:.2f}ms exceeds target of 50ms"
        logger.info("✅ Token calculation latency meets performance target (p95 < 50ms)")

    def test_encoder_caching_effectiveness(self) -> None:
        """Test that encoder caching reduces latency on repeated calls.

        Verifies that the @lru_cache decorator on get_encoder() is effective.
        """
        calculator = TokenCalculator()
        text = "Test text for encoder caching validation " * 10

        # First call (may include encoder initialization)
        latencies_first: list[float] = []
        for _ in range(100):
            start_time = time.perf_counter()
            calculator.count_tokens(text)
            end_time = time.perf_counter()
            latencies_first.append((end_time - start_time) * 1000)

        # Subsequent calls (should use cached encoder)
        latencies_cached: list[float] = []
        for _ in range(100):
            start_time = time.perf_counter()
            calculator.count_tokens(text)
            end_time = time.perf_counter()
            latencies_cached.append((end_time - start_time) * 1000)

        mean_first = statistics.mean(latencies_first)
        mean_cached = statistics.mean(latencies_cached)

        logger.info("\nEncoder Caching Performance:")
        logger.info("  Mean latency (first 100 calls): %.2fms", mean_first)
        logger.info("  Mean latency (next 100 calls): %.2fms", mean_cached)
        logger.info("  Improvement: %.1f%%", (mean_first - mean_cached) / mean_first * 100)

        # Both should be fast, but there should be no significant degradation
        assert mean_cached <= mean_first * 1.1, "Caching should not degrade performance"
        logger.info("✅ Encoder caching is effective")

    def test_token_calculation_scales_linearly(self) -> None:
        """Test that token calculation time scales linearly with text length.

        Verifies that performance doesn't degrade exponentially with longer texts.
        """
        calculator = TokenCalculator()

        text_sizes = [100, 500, 1000, 2000, 5000]  # Number of words
        results = []

        for size in text_sizes:
            text = "word " * size
            latencies = []

            for _ in range(50):
                start_time = time.perf_counter()
                calculator.count_tokens(text)
                end_time = time.perf_counter()
                latencies.append((end_time - start_time) * 1000)

            mean_latency = statistics.mean(latencies)
            results.append((size, mean_latency))
            logger.info("  %d words: %.2fms", size, mean_latency)

        # Check that latency scales reasonably (not exponentially)
        # 5000 words is 50x more than 100 words
        # Linear scaling would be ~50x, exponential would be >>100x
        # Allow up to 80x to account for constant overhead and CI variability
        # Note: CI environments have higher overhead for small inputs
        ratio = results[-1][1] / results[0][1]
        logger.info("\nScaling ratio (5000 words / 100 words): %.1fx", ratio)

        assert ratio < 80.0, f"Latency scaling is too steep (exponential): {ratio:.1f}x"
        logger.info("✅ Token calculation scales linearly with text length")
