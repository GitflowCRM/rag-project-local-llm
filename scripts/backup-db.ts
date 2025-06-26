#!/usr/bin/env bun

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';

const execAsync = promisify(exec);

interface BackupConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  backupDir: string;
  tables?: string[];
}

interface TableInfo {
  table_name: string;
  table_type: string;
}

function createBackupDirectory(backupDir: string): void {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Created backup directory: ${backupDir}`);
  }
}

async function promptForInput(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function parseDatabaseUrl(dbUrl: string): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
} {
  // Handle postgresql://username:password@host:port/database format
  const urlPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = dbUrl.match(urlPattern);

  if (match) {
    const port = parseInt(match[4]);
    if (isNaN(port)) {
      throw new Error(
        `Invalid port number: "${match[4]}". Port must be a number (e.g., 5432)`,
      );
    }

    return {
      username: match[1],
      password: match[2],
      host: match[3],
      port: port,
      database: match[5],
    };
  }

  // Try to provide helpful error message
  if (!dbUrl.startsWith('postgresql://')) {
    throw new Error(
      'Database URL must start with "postgresql://". Example: postgresql://username:password@host:5432/database',
    );
  }

  if (!dbUrl.includes('@')) {
    throw new Error(
      'Database URL must include username and password. Example: postgresql://username:password@host:5432/database',
    );
  }

  if (!dbUrl.includes(':')) {
    throw new Error(
      'Database URL must include port number. Example: postgresql://username:password@host:5432/database',
    );
  }

  throw new Error(
    'Invalid database URL format. Expected: postgresql://username:password@host:port/database\n' +
      'Example: postgresql://myuser:mypassword@localhost:5432/mydatabase\n' +
      'Your input: ' +
      dbUrl,
  );
}

async function getTables(config: BackupConfig): Promise<TableInfo[]> {
  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  const query = `
    SELECT table_name, table_type 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const psqlCmd = [
    'psql',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.username}`,
    `--dbname=${config.database}`,
    '--tuples-only',
    '--no-align',
    '--command',
    `"${query}"`,
  ].join(' ');

  try {
    const { stdout } = await execAsync(psqlCmd, { env });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    return lines.map((line) => {
      const [table_name, table_type] = line.split('|').map((s) => s.trim());
      return { table_name, table_type };
    });
  } catch (error) {
    console.error('Failed to get tables:', error);
    throw error;
  }
}

async function selectTables(tables: TableInfo[]): Promise<string[]> {
  console.log('\nAvailable tables:');
  tables.forEach((table, index) => {
    console.log(`  ${index + 1}. ${table.table_name}`);
  });

  console.log('\nSelect tables to backup:');
  console.log('  - Enter table numbers separated by commas (e.g., 1,3,5)');
  console.log('  - Enter "all" to backup all tables');
  console.log('  - Enter "none" to skip table selection');

  const selection = await promptForInput('Your selection: ');

  if (selection.toLowerCase() === 'all') {
    return tables.map((t) => t.table_name);
  }

  if (selection.toLowerCase() === 'none') {
    return [];
  }

  const selectedIndices = selection
    .split(',')
    .map((s) => parseInt(s.trim()) - 1);
  const selectedTables: string[] = [];

  for (const index of selectedIndices) {
    if (index >= 0 && index < tables.length) {
      selectedTables.push(tables[index].table_name);
    } else {
      console.warn(`Invalid table number: ${index + 1}`);
    }
  }

  return selectedTables;
}

async function backupDatabase(config: BackupConfig): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(config.backupDir, `backup-${timestamp}.sql`);

  // Set environment variables for pg_dump
  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  // Build pg_dump command
  const pgDumpArgs = [
    'pg_dump',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.username}`,
    `--dbname=${config.database}`,
    '--clean',
    '--no-owner',
    '--no-privileges',
    '--format=plain',
  ];

  // Add table-specific arguments if tables are selected
  if (config.tables && config.tables.length > 0) {
    config.tables.forEach((table) => {
      pgDumpArgs.push(`--table=${table}`);
    });
  }

  pgDumpArgs.push(`--file=${backupFile}`);

  const pgDumpCmd = pgDumpArgs.join(' ');

  try {
    console.log(`Starting database backup...`);
    console.log(`Backup file: ${backupFile}`);
    if (config.tables && config.tables.length > 0) {
      console.log(`Selected tables: ${config.tables.join(', ')}`);
    } else {
      console.log('Backing up entire database');
    }

    const { stderr } = await execAsync(pgDumpCmd, { env });

    if (stderr) {
      console.warn('pg_dump warnings:', stderr);
    }

    console.log('Database backup completed successfully!');
    console.log(`Backup saved to: ${backupFile}`);

    // Get file size
    const stats = fs.statSync(backupFile);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Backup size: ${fileSizeInMB} MB`);
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
}

function cleanupOldBackups(backupDir: string, keepDays: number = 7): void {
  const files = fs.readdirSync(backupDir);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  let deletedCount = 0;

  for (const file of files) {
    if (file.startsWith('backup-') && file.endsWith('.sql')) {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
        deletedCount++;
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`Cleaned up ${deletedCount} old backup files`);
  }
}

async function main(): Promise<void> {
  console.log('=== Database Backup Script ===\n');

  let config: BackupConfig;

  // Check if database URL is provided via environment variable
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    console.log('Using DATABASE_URL from environment variables');
    const dbConfig = parseDatabaseUrl(dbUrl);
    config = {
      ...dbConfig,
      backupDir:
        process.env.BACKUP_DIR || path.join(process.cwd(), 'db-backup'),
    };
  } else {
    // Prompt for database URL
    console.log(
      'No DATABASE_URL found. Please provide database connection details.',
    );
    const inputDbUrl = await promptForInput(
      'Database URL (postgresql://username:password@host:port/database): ',
    );

    if (!inputDbUrl) {
      console.error('Database URL is required');
      process.exit(1);
    }

    const dbConfig = parseDatabaseUrl(inputDbUrl);
    const backupDir = await promptForInput(
      `Backup directory (default: ${path.join(process.cwd(), 'db-backup')}): `,
    );

    config = {
      ...dbConfig,
      backupDir: backupDir || path.join(process.cwd(), 'db-backup'),
    };
  }

  console.log(`\nConnection details:`);
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  Username: ${config.username}`);
  console.log(`  Backup directory: ${config.backupDir}`);

  try {
    // Test connection and get tables
    console.log('\nConnecting to database...');
    const tables = await getTables(config);
    console.log(`Found ${tables.length} tables`);

    // Select tables to backup
    const selectedTables = await selectTables(tables);
    if (selectedTables.length > 0) {
      config.tables = selectedTables;
      console.log(
        `\nWill backup ${selectedTables.length} tables: ${selectedTables.join(
          ', ',
        )}`,
      );
    } else {
      console.log('\nWill backup entire database');
    }

    // Create backup directory
    createBackupDirectory(config.backupDir);

    // Perform backup
    await backupDatabase(config);

    // Cleanup old backups (keep last 7 days by default)
    cleanupOldBackups(config.backupDir, 7);

    console.log('\n=== Backup completed successfully ===');
  } catch (error) {
    console.error('\n=== Backup failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}
