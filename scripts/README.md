# Database Backup and Restore Scripts

This directory contains scripts for backing up and restoring PostgreSQL databases using both local PostgreSQL tools and Docker containers.

## Prerequisites

### Option 1: Local PostgreSQL Tools (Traditional)
1. **Bun Runtime**: Make sure you have Bun installed on your system.
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   ```

2. **PostgreSQL Client Tools**: Make sure you have `pg_dump` and `psql` installed on your system.

   **macOS:**
   ```bash
   brew install postgresql
   ```

   **Ubuntu/Debian:**
   ```bash
   sudo apt-get install postgresql-client
   ```

   **Windows:**
   Download from https://www.postgresql.org/download/windows/

### Option 2: Docker (Recommended)
1. **Bun Runtime**: Make sure you have Bun installed on your system.
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Docker**: Make sure you have Docker installed and running.
   ```bash
   # Install Docker Desktop
   # Visit: https://docs.docker.com/get-docker/
   ```

3. **Database Access**: Ensure your database user has the necessary permissions for backup and restore operations.

## Scripts

### 1. Backup Scripts

#### Local Backup Script (`backup-db.ts`)
Creates a full backup of your PostgreSQL database using local `pg_dump`.

#### Docker Backup Script (`backup-db-docker.ts`) ⭐ **Recommended**
Creates a full backup using Docker containers, avoiding version compatibility issues.

**Usage:**
```bash
# Using npm script (recommended)
bun run backup:db:docker

# Direct execution
bun run scripts/backup-db-docker.ts

# Test if Bun is working
bun run test:scripts
```

**Environment Variables:**
- `DATABASE_URL` - Full PostgreSQL connection string (e.g., `postgresql://user:pass@host:port/db`)
- `BACKUP_DIR` - Backup directory (default: ./db-backup)
- `DOCKER_IMAGE` - Docker image to use (default: postgres:15-alpine)

**Features:**
- ✅ Interactive database URL input if not provided
- ✅ Interactive table selection with arrow keys
- ✅ Creates timestamped backup files
- ✅ Automatically creates backup directory if it doesn't exist
- ✅ Uses Docker to avoid version compatibility issues
- ✅ Proper volume mounting for backup files
- ✅ Shows backup file size and progress
- ✅ Automatic interactive mode for 5+ tables

### 2. Restore Scripts

#### Local Restore Script (`restore-db.ts`)
Restores a PostgreSQL database from a backup file using local `psql`.

#### Docker Restore Script (`restore-db-docker.ts`) ⭐ **Recommended**
Restores a database using Docker containers with interactive backup file selection.

**Usage:**
```bash
# Using npm script (recommended)
bun run restore:db:docker

# Direct execution
bun run scripts/restore-db-docker.ts
```

**Environment Variables:**
- `DATABASE_URL` - Full PostgreSQL connection string
- `BACKUP_DIR` - Backup directory (default: ./db-backup)
- `BACKUP_FILE` - Specific backup file to restore (optional)
- `DOCKER_IMAGE` - Docker image to use (default: postgres:15-alpine)

**Features:**
- ✅ Interactive database URL input if not provided
- ✅ Interactive backup file selection with arrow keys
- ✅ Lists available backup files with timestamps and sizes
- ✅ Creates the target database if it doesn't exist
- ✅ Uses Docker to avoid version compatibility issues
- ✅ Proper volume mounting for backup files
- ✅ Shows restore progress and warnings

## Examples

### Interactive Docker Backup (No Environment Variables)
```bash
bun run backup:db:docker
# Will prompt for:
# 1. Database URL: postgresql://user:pass@localhost:5432/posthog
# 2. Backup directory: ./db-backup
# 3. Docker image: postgres:15-alpine
# 4. Table selection: all, none, or specific tables (interactive)
```

### Docker Backup with Environment Variables
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/posthog" \
BACKUP_DIR="/backups" \
DOCKER_IMAGE="postgres:16-alpine" \
bun run backup:db:docker
```

### Interactive Docker Restore
```bash
bun run restore:db:docker
# Will prompt for:
# 1. Database URL: postgresql://user:pass@localhost:5432/posthog_dev
# 2. Backup directory: ./db-backup
# 3. Docker image: postgres:15-alpine
# 4. Backup file selection (interactive)
```

### Docker Restore with Environment Variables
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/posthog_dev" \
BACKUP_FILE="backup-2024-01-15T10-30-00-000Z.sql" \
bun run restore:db:docker
```

## Interactive Features

### Table Selection (Backup)
When backing up, you can interactively select which tables to include:

```
=== Table Selection (Use arrow keys, space to select, enter to confirm) ===

  [ ] cart
  [ ] feature_usage
  [ ] feature_usage_log
  [ ] notification_jobs
  [ ] posthog_events
> [ ] posthog_persons <--
  [ ] posthog_sync_status
  [ ] user_notifications
  [ ] users
  [ ] vendor
  [ ] webhook_events

============================================================
Selected: 0 tables
Controls: ↑/↓ arrows, SPACE to toggle, ENTER to confirm, A for all, N for none
```

### Backup File Selection (Restore)
When restoring, you can interactively select which backup file to use:

```
=== Backup File Selection (Use arrow keys, ENTER to confirm) ===

> backup-2024-01-15T10-30-00-000Z.sql (15.2 MB, 2024-01-15T10:30:00.000Z) <--
  backup-2024-01-14T15-45-00-000Z.sql (14.8 MB, 2024-01-14T15:45:00.000Z)
  backup-2024-01-13T09-20-00-000Z.sql (14.9 MB, 2024-01-13T09:20:00.000Z)

================================================================================
Controls: ↑/↓ arrows, ENTER to confirm, Q to quit
```

## Troubleshooting

### Common Issues

1. **"Cannot use import statement outside a module"**
   - Make sure you're using `bun run` instead of `node`
   - Use the npm scripts: `bun run backup:db:docker`

2. **"Bun command not found"**
   - Install Bun: `curl -fsSL https://bun.sh/install | bash`
   - Restart your terminal

3. **"Docker command not found"**
   - Install Docker: https://docs.docker.com/get-docker/
   - Make sure Docker Desktop is running

4. **"pg_dump/psql not found" (Local scripts only)**
   - Install PostgreSQL client tools (see Prerequisites)
   - Or use Docker scripts instead: `bun run backup:db:docker`

5. **Permission Denied**
   - Ensure your database user has sufficient privileges
   - Check directory permissions for backup folder

6. **Connection Refused**
   - Check if the database server is running and accessible
   - Verify the database URL format

7. **Docker Volume Mount Issues**
   - Ensure the backup directory path is absolute
   - Check Docker permissions and volume mounting

### Testing Your Setup

Run the test script to verify everything is working:
```bash
bun run test:scripts
```

This should output:
```
=== Test Script ===
Bun is working correctly!
Node.js version: v21.0.0
Current directory: /path/to/your/project
Script arguments: []
File system imports work!
Current directory contents: [array of files]
=== Test completed successfully ===
```

## Backup File Format

Backup files are created with the following naming convention:
```
backup-YYYY-MM-DDTHH-MM-SS-sssZ.sql
```

Example: `backup-2024-01-15T10-30-00-000Z.sql`

## Safety Features

1. **Automatic Cleanup**: Old backups are automatically deleted after 7 days
2. **Error Handling**: Scripts provide detailed error messages and exit codes
3. **Database Creation**: Restore script can create the target database if it doesn't exist
4. **File Validation**: Restore script validates backup file existence before proceeding
5. **Interactive Confirmation**: Backup script shows what will be backed up before proceeding
6. **Docker Version Compatibility**: Docker scripts avoid PostgreSQL version mismatches
7. **Volume Mounting**: Proper Docker volume mounting ensures file access

## Security Notes

- Never commit database credentials to version control
- Use environment variables for sensitive information
- Consider encrypting backup files for production use
- Regularly rotate database passwords
- Use `DATABASE_URL` environment variable for secure credential management
- Docker containers are ephemeral and don't persist sensitive data

## Why Docker Scripts?

The Docker-based scripts (`backup-db-docker.ts` and `restore-db-docker.ts`) are recommended because they:

1. **Avoid Version Conflicts**: No need to match local PostgreSQL client version with server version
2. **Consistent Environment**: Same behavior across different development machines
3. **Easy Setup**: No need to install PostgreSQL client tools locally
4. **Isolation**: Backup/restore operations run in isolated containers
5. **Portability**: Works on any system with Docker installed 