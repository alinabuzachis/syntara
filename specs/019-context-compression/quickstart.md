# Quickstart: Context Compression for Multi-Agent System

**Date**: December 9, 2025
**Feature**: Context compression with LLM summarization

## Overview

This guide demonstrates how to use the context compression feature to automatically handle documents that exceed token budgets. The CompressorService provides a simple interface that either passes content through unchanged (if it fits) or compresses it using LLM summarization.

## Prerequisites

- Nexus system with Context Manager
- OpenRouter API key for LLM access
- Python 3.12 environment

## Environment Setup

1. **Set your OpenRouter API key**:
   ```bash
   export NEXUS_OPENROUTER_API_KEY="your-api-key-here"
   ```

2. **Install dependencies**:
   ```bash
   make install
   ```

## Quick Example

> **Note**: The `compress` method is asynchronous. You must use `await` or `asyncio.run()` to call it.

### Basic Usage - Single Document

```python
import asyncio
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def compress_document():
    # Initialize the compression service (uses default settings)
    compressor = CompressorService()

    # Single document example
    document = "This is a long document that might exceed the token budget. " * 100

    # Compress if needed (max 100 tokens)
    result = await compressor.compress(
        data=document,
        max_tokens=100,
        strategy="greedy",
        goal="Extract key information",
        correlation_id="example-001"
    )

    print("Compressed result:", result)
    print("Length:", len(result))
    return result

# Run the async function
asyncio.run(compress_document())
```

**Alternative: Using async REPL (Python 3.8+)**
```bash
python -m asyncio
```
```python
>>> from nexus.agent_orchestrator.context_manager.compressor import CompressorService
>>> compressor = CompressorService()
>>> result = await compressor.compress(data="Your document", max_tokens=100, strategy="greedy", correlation_id="test")
>>> print(result)
```

### Multiple Documents with Citations

```python
import asyncio
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def compress_multiple_docs():
    compressor = CompressorService()

    # Multiple documents that will trigger compression
    documents = [
        "Document about pricing: Our product costs $100 and includes features A, B, C...",
        "Document about support: We provide 24/7 support with response times under 1 hour...",
        "Document about features: Key features include automated workflows, API integration..."
    ]

    # This will likely exceed 50 tokens and trigger LLM compression
    result = await compressor.compress(
        data=documents,
        max_tokens=50,
        strategy="greedy",
        goal="Summarize product information for potential customers",
        correlation_id="example-002"
    )

    # Result will include citations like "According to Document 1..." and "Document 2 shows..."
    print("Compressed with citations:", result)
    return result

asyncio.run(compress_multiple_docs())
```

### Passthrough Example (No Compression)

```python
import asyncio
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def passthrough_example():
    compressor = CompressorService()

    # Short content that fits within budget
    short_docs = ["Brief summary", "Another short note"]

    result = await compressor.compress(
        data=short_docs,
        max_tokens=1000,  # Large budget - won't trigger compression
        strategy="greedy",
        correlation_id="example-003"
    )

    # Result will be the original documents formatted but not compressed
    print("Passthrough result:", result)
    # Expected: "Document 1:\nBrief summary\n\nDocument 2:\nAnother short note"
    return result

asyncio.run(passthrough_example())
```

## Testing Your Setup

### Test 1: Verify Service Initialization

```python
# Test that compression service initializes without errors
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

try:
    compressor = CompressorService()
    print("✓ CompressorService initialized successfully")
except Exception as e:
    print(f"✗ Initialization failed: {e}")
    print("Check your NEXUS_OPENROUTER_API_KEY environment variable")
```

### Test 2: Test Passthrough Behavior

```python
import asyncio
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def test_passthrough():
    compressor = CompressorService()

    result = await compressor.compress(
        data="Short test content",
        max_tokens=100,
        strategy="greedy",
        correlation_id="test-passthrough"
    )

    expected = "Short test content"
    if result == expected:
        print("✓ Passthrough working correctly")
    else:
        print(f"✗ Expected '{expected}', got '{result}'")

asyncio.run(test_passthrough())
```

### Test 3: Test Compression Behavior

```python
import asyncio
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def test_compression():
    compressor = CompressorService()

    # Test with content that should trigger compression
    long_content = "This is a very long document. " * 200  # About 1200+ tokens

    result = await compressor.compress(
        data=long_content,
        max_tokens=50,  # Small budget to force compression
        strategy="greedy",
        goal="Extract main points",
        correlation_id="test-compression"
    )

    if len(result) < len(long_content) and len(result) > 0:
        print("✓ Compression working correctly")
        print(f"Original: {len(long_content)} chars, Compressed: {len(result)} chars")
    else:
        print(f"✗ Compression may not be working. Result length: {len(result)}")

asyncio.run(test_compression())
```

## Integration with Context Manager

### Basic Planner Integration

```python
from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

# The planner automatically uses CompressorService
planner = ContextManagerPlanner()

# During planning, compression happens automatically
context_package = await planner.plan_request(
    correlation_id="plan-example",
    session_id="user-session-123",
    query="What are the product features?",
    invocation_id=None  # Optional for cancellation support
)
```

### Custom Compression in Your Code

```python
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def custom_compression_workflow(user_query: str, correlation_id: str):
    # If you need direct control over compression
    compressor = CompressorService()

    # Your retrieved documents
    retrieved_docs = get_documents_from_retriever()

    # Convert to simple strings if needed
    document_strings = [str(doc) for doc in retrieved_docs]

    # Compress with specific goal (note: await is required)
    compressed_content = await compressor.compress(
        data=document_strings,
        max_tokens=2000,  # Based on your requirements
        strategy="greedy",
        goal=f"Answer user query: {user_query}",
        correlation_id=correlation_id
    )

    # Use compressed content in your workflow
    final_context = assemble_context_package(compressed_content)
    return final_context
```

## Configuration

### Using Custom Settings

The service uses settings from `nexus.core.config`. You can override defaults with environment variables:

```bash
# Compression-specific settings
export NEXUS_CONTEXT_MANAGER_COMPRESSION_TEMPERATURE="0.2"
export NEXUS_CONTEXT_MANAGER_COMPRESSION_MAX_TOKENS="1500"

# General OpenRouter settings
export NEXUS_OPENROUTER_MODEL="anthropic/claude-3.5-sonnet"
export NEXUS_OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
```

### Creating Custom Service Instances

```python
from nexus.agent_orchestrator.context_manager.compressor import CompressorService
from nexus.agent_orchestrator.token_manager.services import TokenCalculator
from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm

# Custom token calculator
token_calc = TokenCalculator()

# Custom LLM with specific settings
custom_llm = get_openrouter_llm(
    model="anthropic/claude-3.5-sonnet",
    temperature=0.1,  # More deterministic
    max_tokens=1000
)

# Custom compressor
compressor = CompressorService(
    token_calculator=token_calc,
    llm=custom_llm
)
```

## Error Handling

### Common Error Scenarios

```python
import asyncio
import logging
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

logger = logging.getLogger(__name__)

async def test_error_handling():
    compressor = CompressorService()

    try:
        result = await compressor.compress(
            data=[],  # Empty data
            max_tokens=100,
            strategy="greedy",
            correlation_id="error-test"
        )
    except ValueError as e:
        logger.error(f"Invalid input: {e}")
        # Handle empty data error

    try:
        result = await compressor.compress(
            data="test",
            max_tokens=0,  # Invalid token limit
            strategy="greedy",
            correlation_id="error-test"
        )
    except ValueError as e:
        logger.error(f"Invalid token limit: {e}")
        # Handle invalid parameters

    try:
        result = await compressor.compress(
            data="test",
            max_tokens=100,
            strategy="invalid_strategy",  # Unsupported strategy
            correlation_id="error-test"
        )
    except ValueError as e:
        logger.error(f"Unsupported strategy: {e}")
        # Handle unsupported strategy

asyncio.run(test_error_handling())
```

### LLM Service Failures

```python
import asyncio
from nexus.agent_orchestrator.context_manager.compressor import CompressorService

async def test_llm_failure():
    compressor = CompressorService()

    try:
        # This might fail if OpenRouter is unavailable or API key is invalid
        result = await compressor.compress(
            data="Very long content that needs compression...",
            max_tokens=50,
            strategy="greedy",
            correlation_id="llm-test"
        )
    except RuntimeError as e:
        logger.error(f"LLM compression failed: {e}")
        # Implement fallback strategy (e.g., simple truncation)
        fallback_result = simple_truncate(long_content, max_tokens=50)

asyncio.run(test_llm_failure())
```

## Troubleshooting

### Check Your Setup

1. **Verify API Key**:
   ```bash
   echo $NEXUS_OPENROUTER_API_KEY
   ```

2. **Test OpenRouter Connection**:
   ```python
   from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm

   try:
       llm = get_openrouter_llm()
       response = llm.invoke([{"role": "user", "content": "Hello"}])
       print("✓ OpenRouter connection working")
   except Exception as e:
       print(f"✗ OpenRouter connection failed: {e}")
   ```

3. **Verify Settings**:
   ```python
   from nexus.core.config import get_settings

   settings = get_settings()
   print(f"Compression temperature: {settings.context_manager_compression_temperature}")
   print(f"Compression max tokens: {settings.context_manager_compression_max_tokens}")
   ```

### Common Issues

- **"LLM compression failed"**: Check your API key and network connectivity
- **"Data cannot be empty"**: Ensure you're passing non-empty content
- **"Unsupported strategy"**: Currently only "greedy" strategy is supported
- **Slow performance**: Consider adjusting `compression_max_tokens` setting
- **Poor compression quality**: Try adjusting the `goal` parameter to be more specific

This quickstart should give you everything needed to start using the context compression feature in your Nexus applications.

Example of a python test for this feature

```python
"""Manual test script for compression service.

This script demonstrates the compression service functionality with real LLM calls.
Run this to verify the service works as expected with realistic product data.

Usage: python test_compression_manual.py
"""

import asyncio
import time
from nexus.agent_orchestrator.context_manager.compressor import CompressorService


async def test_passthrough_behavior():
    """Test 1: Small documents that should pass through without compression."""
    print("🧪 Test 1: Passthrough Behavior (No Compression)")
    print("=" * 60)

    compressor = CompressorService()

    # Small product descriptions that should fit within budget
    small_docs = [
        "SaaS Analytics Dashboard - Real-time business intelligence platform with customizable widgets.",
        "Cloud Storage Pro - Secure file storage with 1TB capacity and team collaboration features.",
        "Mobile App Builder - No-code platform for creating native iOS and Android applications."
    ]

    print("Input documents:")
    for i, doc in enumerate(small_docs, 1):
        print(f"  {i}. {doc}")
    print()

    result = await compressor.compress(
        data=small_docs,
        max_tokens=1000,  # Large budget - should not trigger compression
        strategy="greedy",
        goal="Summarize product information for potential customers",
        correlation_id="test-passthrough"
    )

    print(f"Input character count: {sum(len(doc) for doc in small_docs)}")
    print(f"Output character count: {len(result)}")
    print(f"Result:\n{result}")
    print()

    # Check if this was a passthrough (should contain document separators)
    if "Document 1:" in result and "Document 2:" in result:
        print("✅ PASSED: Documents passed through without compression (as expected)")
    else:
        print("❌ UNEXPECTED: Documents may have been compressed when they shouldn't have been")

    print("\n" + "=" * 60 + "\n")
    return result


async def test_compression_behavior():
    """Test 2: Large product descriptions that should trigger compression."""
    print("🧪 Test 2: Compression Behavior (Large Documents)")
    print("=" * 60)

    compressor = CompressorService()

    # Detailed product descriptions that will definitely exceed token budget
    large_docs = [
        """Enterprise CRM Platform - Our comprehensive customer relationship management system provides
        advanced lead tracking, opportunity management, sales pipeline analytics, automated email campaigns,
        customer segmentation tools, integration with major third-party applications like Salesforce and HubSpot,
        real-time reporting dashboards, mobile access for field sales teams, customizable workflow automation,
        advanced security features including SSO and RBAC, API access for custom integrations, dedicated customer
        success manager, 24/7 technical support, training programs, data migration assistance, and compliance
        with GDPR, HIPAA, and SOC 2 Type II standards. The platform scales from small businesses to enterprise
        organizations with over 10,000 users and supports multiple currencies, languages, and time zones.""",

        """AI-Powered Marketing Automation Suite - Revolutionary marketing technology that combines artificial
        intelligence, machine learning algorithms, and predictive analytics to deliver personalized customer
        experiences at scale. Features include intelligent content recommendation engine, automated A/B testing
        for email campaigns, social media scheduling and optimization, lead scoring based on behavioral patterns,
        dynamic website personalization, chatbot integration with natural language processing, advanced attribution
        modeling, cross-channel campaign orchestration, real-time performance monitoring, customer journey mapping,
        predictive churn analysis, revenue forecasting, integration with popular CRMs and data warehouses,
        GDPR-compliant data handling, white-label options for agencies, and comprehensive onboarding and training
        programs. Trusted by over 5,000 companies worldwide including Fortune 500 enterprises.""",

        """Cloud Infrastructure Management Platform - Next-generation DevOps solution that simplifies cloud
        infrastructure deployment, monitoring, and optimization across AWS, Azure, Google Cloud, and hybrid
        environments. Key capabilities include infrastructure-as-code templates, automated provisioning and
        scaling, continuous integration/continuous deployment pipelines, container orchestration with Kubernetes,
        serverless function management, database backup and recovery, security scanning and compliance monitoring,
        cost optimization recommendations, performance analytics, disaster recovery planning, multi-cloud
        management, team collaboration tools, role-based access controls, audit logging, API-first architecture,
        third-party tool integrations, 99.9% uptime SLA, 24/7 expert support, migration services, and dedicated
        customer success management. Designed for development teams, IT operations, and cloud architects."""
    ]

    print("Input documents (truncated for display):")
    for i, doc in enumerate(large_docs, 1):
        preview = doc[:100] + "..." if len(doc) > 100 else doc
        print(f"  {i}. {preview}")
    print()

    total_input_chars = sum(len(doc) for doc in large_docs)
    print(f"Total input characters: {total_input_chars}")

    try:
        start_time = time.time()
        result = await compressor.compress(
            data=large_docs,
            max_tokens=150,  # Small budget - should definitely trigger compression
            strategy="greedy",
            goal="Create a concise summary of the software products highlighting key features and benefits",
            correlation_id="test-compression"
        )
        compression_time = time.time() - start_time

        print(f"Compression completed in {compression_time:.2f} seconds")
        print(f"Output character count: {len(result)}")
        print(f"Compression ratio: {len(result) / total_input_chars:.2f}")
        print(f"Result:\n{result}")
        print()

        # Check for compression indicators
        compression_indicators = [
            "Document 1" in result or "Document 2" in result or "Document 3" in result,
            len(result) < total_input_chars * 0.5,  # Significant reduction
            "CRM" in result or "marketing" in result or "cloud" in result  # Key terms preserved
        ]

        if all(compression_indicators):
            print("✅ PASSED: Documents were successfully compressed with citations")
        else:
            print("⚠️  PARTIAL: Compression occurred but may not have optimal citation format")

    except Exception as e:
        print(f"❌ FAILED: Compression failed with error: {e}")
        return None

    print("\n" + "=" * 60 + "\n")
    return result


async def test_goal_directed_compression():
    """Test 3: Goal-directed compression focusing on specific aspects."""
    print("🧪 Test 3: Goal-Directed Compression (Pricing Focus)")
    print("=" * 60)

    compressor = CompressorService()

    # Product descriptions with pricing information mixed in
    pricing_docs = [
        """Premium Analytics Dashboard (Starting at $99/month) - Professional business intelligence solution
        with real-time data visualization, custom KPI tracking, automated report generation, team collaboration
        features, API integrations with popular tools, advanced filtering and drill-down capabilities,
        mobile responsive design, white-label options, dedicated customer support, and enterprise security.
        Includes 14-day free trial, monthly or annual billing options, volume discounts for teams over 50 users,
        and premium add-ons for advanced machine learning insights starting at $49/month per feature.""",

        """E-commerce Platform (Plans from $29/month to $299/month) - Complete online store solution with
        inventory management, payment processing, shipping integration, SEO optimization tools, customer
        analytics, mobile app, social media integration, marketing automation, and 24/7 support.
        Basic plan includes up to 100 products and 1,000 transactions per month. Professional plan offers
        unlimited products, advanced analytics, and priority support. Enterprise plan includes custom
        integrations, dedicated account manager, and SLA guarantees. All plans include SSL certificate,
        daily backups, and 99.9% uptime guarantee.""",

        """Project Management Software (Free tier available, Pro at $15/user/month) - Comprehensive team
        collaboration platform with task management, time tracking, resource planning, Gantt charts,
        file sharing, real-time messaging, calendar integration, reporting dashboard, and third-party
        app integrations. Free plan supports up to 5 team members with basic features. Pro plan includes
        unlimited projects, advanced reporting, custom fields, and priority support. Enterprise plan
        ($25/user/month) adds SSO, advanced security, custom branding, and dedicated customer success manager.
        Annual billing receives 20% discount on all paid plans."""
    ]

    print("Input documents focused on pricing information:")
    for i, doc in enumerate(pricing_docs, 1):
        preview = doc[:80] + "..." if len(doc) > 80 else doc
        print(f"  {i}. {preview}")
    print()

    try:
        result = await compressor.compress(
            data=pricing_docs,
            max_tokens=120,  # Moderate budget
            strategy="greedy",
            goal="Extract pricing information and plan details for budget planning",
            correlation_id="test-goal-directed"
        )

        print(f"Output character count: {len(result)}")
        print(f"Result:\n{result}")
        print()

        # Check if pricing information is preserved
        pricing_keywords = ["$", "month", "plan", "price", "cost", "billing", "free", "pro", "enterprise"]
        pricing_mentions = sum(1 for keyword in pricing_keywords if keyword.lower() in result.lower())

        if pricing_mentions >= 3:
            print("✅ PASSED: Goal-directed compression successfully focused on pricing information")
        else:
            print("⚠️  PARTIAL: Some pricing information preserved but could be more comprehensive")

    except Exception as e:
        print(f"❌ FAILED: Goal-directed compression failed with error: {e}")
        return None

    print("\n" + "=" * 60 + "\n")
    return result


async def main():
    """Run all manual compression tests."""
    print("🚀 Manual Compression Service Tests")
    print("=" * 60)
    print("This script tests the CompressorService with realistic product data.")
    print("Make sure you have NEXUS_OPENROUTER_API_KEY set in your environment.")
    print("=" * 60 + "\n")

    tests = [
        ("Passthrough Behavior", test_passthrough_behavior),
        ("Compression Behavior", test_compression_behavior),
        ("Goal-Directed Compression", test_goal_directed_compression)
    ]

    results = {}

    for test_name, test_func in tests:
        try:
            result = await test_func()
            results[test_name] = "PASSED" if result is not None else "FAILED"
        except Exception as e:
            print(f"❌ {test_name} crashed with error: {e}\n")
            results[test_name] = "CRASHED"

    # Summary
    print("📊 Test Summary")
    print("=" * 60)
    for test_name, status in results.items():
        status_emoji = {"PASSED": "✅", "FAILED": "❌", "CRASHED": "💥"}[status]
        print(f"{status_emoji} {test_name}: {status}")

    total_passed = sum(1 for status in results.values() if status == "PASSED")
    print(f"\n🏁 Results: {total_passed}/{len(tests)} tests passed")

    if total_passed == len(tests):
        print("🎉 All tests passed! Compression service is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the output above for details.")


if __name__ == "__main__":
    asyncio.run(main())
```
