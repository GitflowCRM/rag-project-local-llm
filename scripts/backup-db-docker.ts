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
  dockerImage?: string;
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

async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

async function getTables(config: BackupConfig): Promise<TableInfo[]> {
  const dockerCmd = [
    'docker',
    'run',
    '--rm',
    '-i',
    `--env=PGPASSWORD=${config.password}`,
    config.dockerImage || 'postgres:15-alpine',
    'psql',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.username}`,
    `--dbname=${config.database}`,
    '--tuples-only',
    '--no-align',
    '--command',
    `"SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"`,
  ].join(' ');

  try {
    const { stdout } = await execAsync(dockerCmd);
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

async function selectTablesInteractive(tables: TableInfo[]): Promise<string[]> {
  const selectedTables: string[] = [];
  let currentIndex = 0;
  let showHelp = false;

  const renderTable = () => {
    // Clear screen (works on most terminals)
    console.clear();
    console.log(
      '=== Table Selection (Use arrow keys, space to select, enter to confirm) ===\n',
    );

    tables.forEach((table, index) => {
      const isSelected = selectedTables.includes(table.table_name);
      const isCurrent = index === currentIndex;

      let line = '';
      if (isCurrent) {
        line += '> '; // Current selection indicator
      } else {
        line += '  ';
      }

      if (isSelected) {
        line += '[✓] '; // Selected indicator
      } else {
        line += '[ ] '; // Unselected indicator
      }

      line += table.table_name;

      if (isCurrent) {
        line += ' <--'; // Highlight current
      }

      console.log(line);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Selected: ${selectedTables.length} tables`);
    console.log(
      'Controls: ↑/↓ arrows, SPACE to toggle, ENTER to confirm, A for all, N for none',
    );

    if (showHelp) {
      console.log('\n--- Help ---');
      console.log('↑/↓ Arrow keys: Navigate through tables');
      console.log('SPACE: Toggle selection of current table');
      console.log('A: Select all tables');
      console.log('N: Deselect all tables');
      console.log('ENTER: Confirm selection and proceed');
      console.log('Q: Quit without selection');
    }
  };

  return new Promise((resolve) => {
    // Set raw mode to capture individual key presses
    const stdin = process.stdin;
    // const stdout = process.stdout;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const handleKeyPress = (key: string) => {
      if (key === '\u0003') {
        // Ctrl+C
        stdin.setRawMode(false);
        stdin.pause();
        process.exit(0);
      }

      if (key === '\r' || key === '\n') {
        // Enter key - confirm selection
        stdin.setRawMode(false);
        stdin.pause();
        console.log('\nSelection confirmed!');
        resolve(selectedTables);
        return;
      }

      if (key === 'q' || key === 'Q') {
        // Quit
        stdin.setRawMode(false);
        stdin.pause();
        console.log('\nSelection cancelled.');
        resolve([]);
        return;
      }

      if (key === 'a' || key === 'A') {
        // Select all
        selectedTables.length = 0;
        tables.forEach((table) => selectedTables.push(table.table_name));
        renderTable();
        return;
      }

      if (key === 'n' || key === 'N') {
        // Select none
        selectedTables.length = 0;
        renderTable();
        return;
      }

      if (key === ' ') {
        // Space key - toggle selection
        const currentTable = tables[currentIndex].table_name;
        const index = selectedTables.indexOf(currentTable);

        if (index > -1) {
          selectedTables.splice(index, 1);
        } else {
          selectedTables.push(currentTable);
        }

        renderTable();
        return;
      }

      if (key === '\u001b[A') {
        // Up arrow
        currentIndex = Math.max(0, currentIndex - 1);
        renderTable();
        return;
      }

      if (key === '\u001b[B') {
        // Down arrow
        currentIndex = Math.min(tables.length - 1, currentIndex + 1);
        renderTable();
        return;
      }

      if (key === 'h' || key === 'H') {
        // Toggle help
        showHelp = !showHelp;
        renderTable();
        return;
      }
    };

    stdin.on('data', handleKeyPress);
    renderTable();
  });
}

async function selectTables(tables: TableInfo[]): Promise<string[]> {
  // If there are many tables, automatically use interactive mode
  if (tables.length > 5) {
    console.log(
      `\nFound ${tables.length} tables. Using interactive selection mode...`,
    );
    return await selectTablesInteractive(tables);
  }

  // For small number of tables, show simple options
  console.log('\nAvailable tables:');
  tables.forEach((table, index) => {
    console.log(`  ${index + 1}. ${table.table_name}`);
  });

  console.log('\nSelect tables to backup:');
  console.log('  - Enter table numbers separated by commas (e.g., 1,3,5)');
  console.log('  - Enter "all" to backup all tables');
  console.log('  - Enter "none" to skip table selection');
  console.log('  - Enter "interactive" for arrow key selection');

  const selection = await promptForInput('Your selection: ');

  if (selection.toLowerCase() === 'interactive') {
    return await selectTablesInteractive(tables);
  }

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

  // Ensure backup directory exists on host
  createBackupDirectory(config.backupDir);

  // Build docker pg_dump command with proper volume mounting
  const dockerArgs = [
    'docker',
    'run',
    '--rm',
    '-i',
    `--env=PGPASSWORD=${config.password}`,
    '-v',
    `${path.resolve(config.backupDir)}:/backup`,
    config.dockerImage || 'postgres:15-alpine',
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
      dockerArgs.push(`--table=${table}`);
    });
  }

  dockerArgs.push(`--file=/backup/backup-${timestamp}.sql`);

  const dockerCmd = dockerArgs.join(' ');

  try {
    console.log(`Starting database backup using Docker...`);
    console.log(`Backup file: ${backupFile}`);
    console.log(`Host backup directory: ${path.resolve(config.backupDir)}`);
    if (config.tables && config.tables.length > 0) {
      console.log(`Selected tables: ${config.tables.join(', ')}`);
    } else {
      console.log('Backing up entire database');
    }
    console.log(
      `Using Docker image: ${config.dockerImage || 'postgres:15-alpine'}`,
    );

    const { stderr } = await execAsync(dockerCmd);

    if (stderr) {
      console.warn('pg_dump warnings:', stderr);
    }

    // Verify the file was created on the host
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file was not created on host: ${backupFile}`);
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
  console.log('=== Docker Database Backup Script ===\n');

  // Check if Docker is available
  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    console.error('Docker is not available. Please install Docker first.');
    console.error('Visit: https://docs.docker.com/get-docker/');
    process.exit(1);
  }

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
      dockerImage: process.env.DOCKER_IMAGE || 'postgres:15-alpine',
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

    const dockerImage = await promptForInput(
      'Docker image (default: postgres:15-alpine): ',
    );

    config = {
      ...dbConfig,
      backupDir: backupDir || path.join(process.cwd(), 'db-backup'),
      dockerImage: dockerImage || 'postgres:15-alpine',
    };
  }

  console.log(`\nConnection details:`);
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  Username: ${config.username}`);
  console.log(`  Backup directory: ${config.backupDir}`);
  console.log(`  Docker image: ${config.dockerImage}`);

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
