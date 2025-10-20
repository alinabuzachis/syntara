# Temporal Configuration (Development Only)

This directory contains Temporal server dynamic configuration for **local development and debugging only**.

## Files

- `development-sql.yaml`: Dynamic configuration for Temporal server when running with PostgreSQL backend

## Configuration

The Temporal server uses these configuration files to control runtime behavior. The configuration is mounted into the container at `/etc/temporal/config/dynamicconfig/`.

## Production Deployment

**Important**: This configuration is NOT for production use. For production deployments:

### Required Components
- ✅ **Temporal Server** - Required for workflow orchestration
- ❌ **Temporal UI** - NOT required (use CLI or Temporal Cloud UI instead)
- ❌ **This config directory** - NOT required (use Temporal defaults or k8s ConfigMaps)

### Production Recommendations
1. Use Temporal Cloud (managed service) or self-hosted Temporal cluster
2. Enable advanced visibility with Elasticsearch
3. Tune worker and history service limits based on your workload
4. Configure proper metrics and monitoring (Prometheus, Grafana)
5. Set up cluster replication if needed
6. Use Temporal CLI (`tctl`) for workflow management

## Reference

For more information about Temporal configuration and deployment, see:
- [Temporal Dynamic Configuration Documentation](https://docs.temporal.io/references/dynamic-configuration)
- [Configuration Reference](https://github.com/temporalio/temporal/blob/master/common/dynamicconfig/constants.go)
- [Production Deployment Guide](https://docs.temporal.io/self-hosted-guide)
