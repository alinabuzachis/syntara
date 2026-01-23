# Quickstart: Development Environment Setup

**Feature**: Initial Development Environment Setup
**Purpose**: Validate developer onboarding and database setup workflow
**Expected Duration**: 5-10 minutes
**Prerequisites**: Podman installed (podman-compose will be installed via `make install`)

---

## Success Criteria

By completing this quickstart, you will have:
- ✅ PostgreSQL 17 database running in a container (foreground mode)
- ✅ Database accessible on localhost:5432 (or custom port)
- ✅ Verified database connectivity using psql or database tool
- ✅ Confirmed data persistence across container restarts
- ✅ Understanding of basic database lifecycle commands

---

## Step 1: Clone Repository

```bash
# Clone the Nexus repository
git clone <repository-url>
cd nexus

```

**Verification**:
```bash
# Confirm podman-compose.yml exists
ls -la podman-compose.yml

# Confirm .env.example exists
ls -la .env.example
```

**Expected Output**:
```
-rw-r--r-- 1 user user  XXX ... podman-compose.yml
-rw-r--r-- 1 user user  XXX ... .env.example
```

**Troubleshooting**:
- If files don't exist: Ensure you're on the correct branch
- If branch doesn't exist: Feature not yet merged to main

---

## Step 2: Configure Environment (Optional)

The database will work with default configuration. Only create a `.env` file if you need custom settings.

```bash
# Optional: Copy environment template to .env file
cp .env.example .env

# Optional: Customize configuration
# Edit .env to change port if 5432 is already in use
nano .env
```

**Default Configuration** (used if no .env file):
```bash
NEXUS_DB_HOST=localhost
NEXUS_DB_PORT=5432
NEXUS_DB_USER=admin
NEXUS_DB_PASSWORD=admin
NEXUS_DB_NAME=nexus_api
```

**When to customize**:
- Change `NEXUS_DB_PORT` if 5432 is already in use (e.g., 5433)
- Most developers can skip this step and use defaults

**Troubleshooting**:
- Port conflict: Create .env and change NEXUS_DB_PORT to different value (e.g., 5433)

---

## Step 3: Start Database

```bash
# Start PostgreSQL database container (runs in foreground)
make db-run
```

**Expected Output**:
```
🚀 Starting PostgreSQL database...
📍 Connection: postgresql://admin:admin@localhost:5432/nexus_api
Press Ctrl+C to stop

[+] Running 2/2
 ✔ Volume "nexus_postgres_data"  Created
 ✔ Container nexus-database-1    Created
Attaching to database-1
database-1  | PostgreSQL Database directory appears to contain a database; Skipping initialization
database-1  |
database-1  | 2025-10-08 ... LOG:  starting PostgreSQL 17.0 on x86_64-pc-linux-gnu, compiled by gcc ...
database-1  | 2025-10-08 ... LOG:  listening on IPv4 address "0.0.0.0", port 5432
database-1  | 2025-10-08 ... LOG:  database system is ready to accept connections
```

**What's happening**:
- Database runs in **foreground mode** - logs display in real-time
- Keep this terminal open while working
- Stop with **Ctrl+C** when done
- To run commands, open a **new terminal tab/window**

**Verification in a new terminal**:
```bash
# Check container status
podman ps
```

**Container Status Output**:
```
CONTAINER ID   IMAGE         STATUS                   PORTS                    NAMES
abc123def456   postgres:15   Up 10 seconds (healthy)  0.0.0.0:5432->5432/tcp   nexus-database-1
```

**Troubleshooting**:
- Port already in use: Stop `make db-run`, create .env, change NEXUS_DB_PORT, restart
- Health check failing: Wait 30 seconds for PostgreSQL to fully initialize
- podman-compose not found: Run `make install` to install dev dependencies

---

## Step 4: Verify Database Connection

**Important**: Open a **new terminal** (keep Step 3 terminal running)

### Option A: Using psql (PostgreSQL CLI)

```bash
# In a NEW terminal, connect using psql
psql postgresql://admin:admin@localhost:5432/nexus_api

# Or using individual parameters
psql -h localhost -p 5432 -U admin -d nexus_api
# Password: admin
```

**In psql session**:
```sql
-- List databases
\l

-- Verify nexus_api database exists
SELECT current_database();

-- Create test table
CREATE TABLE test_table (id SERIAL PRIMARY KEY, name VARCHAR(100));

-- Insert test data
INSERT INTO test_table (name) VALUES ('test');

-- Query test data
SELECT * FROM test_table;

-- Drop test table
DROP TABLE test_table;

-- Exit psql
\q
```

**Expected Output**:
```
 current_database
------------------
 nexus_api
(1 row)

CREATE TABLE
INSERT 0 1
 id | name
----+------
  1 | test
(1 row)

DROP TABLE
```

### Option B: Using DBeaver / pgAdmin / TablePlus

**Connection Parameters**:
- Host: `localhost`
- Port: `5432` (or custom from NEXUS_DB_PORT)
- Database: `nexus_api`
- Username: `admin`
- Password: `admin`
- SSL Mode: `Disable` (local development)

**Verification**:
1. Create new PostgreSQL connection
2. Test connection (should succeed)
3. Browse database structure (should be empty - no tables)
4. Create test table and insert data
5. Verify data persists

**Troubleshooting**:
- Connection refused: Verify container is running (`podman ps`)
- Authentication failed: Check NEXUS_DB_USER and NEXUS_DB_PASSWORD in .env
- Database does not exist: Check NEXUS_DB_NAME in .env matches connection

---

## Step 5: Test Data Persistence

**With database still running and test data created in Step 4**

```bash
# In the terminal running make db-run:
# Press Ctrl+C to stop the database

^C
Gracefully stopping... (press Ctrl+C again to force)
[+] Stopping 1/1
 ✔ Container nexus-database-1  Stopped
```

**Restart database**:
```bash
# In the same terminal, start database again
make db-run
```

**Verify data persistence (in a new terminal)**:
```bash
# Reconnect with psql
psql postgresql://admin:admin@localhost:5432/nexus_api

# Check if test data still exists
SELECT * FROM test_table;
# Should see previously inserted data

# Clean up test table
DROP TABLE test_table;
\q
```

**Expected Outcome**:
- Test table and data still present after restart
- Confirms volume persistence working correctly

**Troubleshooting**:
- Data lost after restart: Volume may have been removed (check `podman volume ls`)
- If data lost: Don't use `make db-clean` between stops (only Ctrl+C)

---

## Step 6: Clean Up (Optional)

### Option A: Stop Database (Preserve Data)

```bash
# In the terminal running make db-run:
# Press Ctrl+C to stop

^C
```

**Use when**: You'll continue development later and want to preserve data

### Option B: Clean Database (Remove All Data)

```bash
# Stop database and delete all data
make db-clean
```

**Expected Output**:
```
🧹 Stopping database and removing data...
[+] Running 2/2
 ✔ Container nexus-database-1      Removed
 ✔ Volume nexus_postgres_data      Removed
✅ Database stopped and data purged
```

**Warning**: ⚠️ This is destructive! All database data will be permanently deleted.

**Use when**: You want to start fresh or finished testing

**Note**: If database is running, first stop it with Ctrl+C, then run `make db-clean`

---

## Verification Checklist

After completing this quickstart, verify:

- [ ] Database container starts successfully in foreground mode
- [ ] Logs visible in terminal running `make db-run`
- [ ] Health check shows "healthy" status in `podman ps`
- [ ] Can connect via psql or database tool (from new terminal)
- [ ] Database `nexus_api` exists
- [ ] User `admin` has full permissions
- [ ] Can create tables and insert data
- [ ] Data persists after Ctrl+C stop and restart
- [ ] Can cleanly stop with Ctrl+C
- [ ] Can completely reset with `make db-clean`

---

## Common Issues and Solutions

### Issue: Port 5432 Already in Use

**Symptoms**: Container fails to start with "port is already allocated" error

**Solution**:
```bash
# Edit .env and change port
nano .env
# Change NEXUS_DB_PORT=5432 to NEXUS_DB_PORT=5433

# Restart database
make db-clean  # Clean old state
make db-run    # Start with new port

# Connect using new port
psql postgresql://admin:admin@localhost:5433/nexus_api
```

### Issue: Container Unhealthy or Won't Start

**Symptoms**: Container status shows "unhealthy" or exits immediately

**Solution**:
```bash
# Logs are already visible in terminal running make db-run
# Look for error messages in the output

# Common causes:
# - Insufficient disk space (check with `df -h`)
# - Incorrect permissions on volume
# - PostgreSQL initialization failed

# Try clean restart
# First stop with Ctrl+C if running
make db-clean
make db-run
```

### Issue: Connection Refused

**Symptoms**: psql or database tool cannot connect

**Solution**:
```bash
# Verify container is running and healthy (in new terminal)
podman ps

# Check if port is accessible
nc -zv localhost 5432

# Verify .env configuration (if exists)
cat .env

# Check startup logs in terminal running make db-run
# Look for "database system is ready to accept connections"
```

### Issue: Authentication Failed

**Symptoms**: "password authentication failed" error

**Solution**:
```bash
# Verify credentials in .env match connection attempt
cat .env | grep NEXUS_DB_USER
cat .env | grep NEXUS_DB_PASSWORD

# If changed after container creation, recreate container
make db-clean
make db-run
```

---

## Next Steps

After completing this quickstart:

1. **Development**: Database is ready for application development
2. **Migrations**: See future feature for Alembic migration setup
3. **Seed Data**: See future feature for test data loading
4. **CI Integration**: Tests will use same database configuration

---

## Support

If you encounter issues not covered here:

1. Check [CONTRIBUTING.md](../../../CONTRIBUTING.md) for troubleshooting tips
2. Review [decision-records.md](../../../decision-records.md) for architecture context
3. Open an issue with:
   - Logs from terminal running `make db-run`
   - Your .env configuration (redact password if sensitive)
   - Operating system and podman/podman-compose version
   - Full error message

---

**Quickstart Complete!** ✅

You now have a fully functional PostgreSQL development environment.
