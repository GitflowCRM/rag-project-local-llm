#!/usr/bin/env bun

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';

const execAsync = promisify(exec);

interface RestoreConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  backupDir: string;
  backupFile?: string;
  dockerImage?: string;
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

function listBackupFiles(backupDir: string): string[] {
  if (!fs.existsSync(backupDir)) {
    console.error(`Backup directory does not exist: ${backupDir}`);
    return [];
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((file) => file.startsWith('backup-') && file.endsWith('.sql'))
    .sort((a, b) => {
      const statsA = fs.statSync(path.join(backupDir, a));
      const statsB = fs.statSync(path.join(backupDir, b));
      return statsB.mtime.getTime() - statsA.mtime.getTime(); // Most recent first
    });

  return files;
}

async function selectBackupFileInteractive(
  backupDir: string,
): Promise<string | null> {
  const files = listBackupFiles(backupDir);
  if (files.length === 0) {
    console.error('No backup files found in directory');
    return null;
  }

  if (files.length === 1) {
    console.log(`Found 1 backup file, using: ${files[0]}`);
    return path.join(backupDir, files[0]);
  }

  console.log(
    `\nFound ${files.length} backup files. Using interactive selection mode...`,
  );

  let currentIndex = 0;

  const renderFiles = () => {
    console.clear();
    console.log(
      '=== Backup File Selection (Use arrow keys, ENTER to confirm) ===\n',
    );

    files.forEach((file, index) => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      const isCurrent = index === currentIndex;

      let line = '';
      if (isCurrent) {
        line += '> '; // Current selection indicator
      } else {
        line += '  ';
      }

      line += `${file} (${fileSizeInMB} MB, ${stats.mtime.toISOString()})`;

      if (isCurrent) {
        line += ' <--'; // Highlight current
      }

      console.log(line);
    });

    console.log('\n' + '='.repeat(80));
    console.log('Controls: ↑/↓ arrows, ENTER to confirm, Q to quit');
  };

  return new Promise((resolve) => {
    const stdin = process.stdin;
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
        resolve(path.join(backupDir, files[currentIndex]));
        return;
      }

      if (key === 'q' || key === 'Q') {
        // Quit
        stdin.setRawMode(false);
        stdin.pause();
        console.log('\nSelection cancelled.');
        resolve(null);
        return;
      }

      if (key === '\u001b[A') {
        // Up arrow
        currentIndex = Math.max(0, currentIndex - 1);
        renderFiles();
        return;
      }

      if (key === '\u001b[B') {
        // Down arrow
        currentIndex = Math.min(files.length - 1, currentIndex + 1);
        renderFiles();
        return;
      }
    };

    stdin.on('data', handleKeyPress);
    renderFiles();
  });
}

async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

async function restoreDatabase(config: RestoreConfig): Promise<void> {
  const backupFilePath = await selectBackupFileInteractive(config.backupDir);

  if (!backupFilePath) {
    throw new Error('No valid backup file selected');
  }

  const backupFileName = path.basename(backupFilePath);

  // Build docker psql command with proper volume mounting
  const dockerArgs = [
    'docker',
    'run',
    '--rm',
    '-i',
    `--env=PGPASSWORD=${config.password}`,
    '-v',
    `${path.resolve(config.backupDir)}:/backup`,
    config.dockerImage || 'postgres:15-alpine',
    'psql',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.username}`,
    `--dbname=${config.database}`,
    `--file=/backup/${backupFileName}`,
  ];

  const dockerCmd = dockerArgs.join(' ');

  try {
    console.log(`Starting database restore using Docker...`);
    console.log(`Backup file: ${backupFilePath}`);
    console.log(`Host backup directory: ${path.resolve(config.backupDir)}`);
    console.log(`Target database: ${config.database}`);
    console.log(
      `Using Docker image: ${config.dockerImage || 'postgres:15-alpine'}`,
    );

    const { stderr } = await execAsync(dockerCmd);

    if (stderr) {
      console.warn('psql warnings:', stderr);
    }

    console.log('Database restore completed successfully!');
    console.log(`Restored from: ${backupFilePath}`);
  } catch (error) {
    console.error('Restore failed:', error);
    throw error;
  }
}

async function createDatabaseIfNotExists(config: RestoreConfig): Promise<void> {
  const dockerArgs = [
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
    '--dbname=postgres',
    '--command',
    `CREATE DATABASE "${config.database}";`,
  ];

  const dockerCmd = dockerArgs.join(' ');

  try {
    console.log(
      `Creating database '${config.database}' if it doesn't exist...`,
    );
    await execAsync(dockerCmd);
    console.log(`Database '${config.database}' is ready`);
  } catch {
    // Database might already exist, which is fine
    console.log(
      `Database '${config.database}' already exists or creation failed (this is usually OK)`,
    );
  }
}

async function main(): Promise<void> {
  console.log('=== Docker Database Restore Script ===\n');

  // Check if Docker is available
  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    console.error('Docker is not available. Please install Docker first.');
    console.error('Visit: https://docs.docker.com/get-docker/');
    process.exit(1);
  }

  let config: RestoreConfig;

  // Check if database URL is provided via environment variable
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    console.log('Using DATABASE_URL from environment variables');
    const dbConfig = parseDatabaseUrl(dbUrl);
    config = {
      ...dbConfig,
      backupDir: process.env.BACKUP_DIR || path.join(process.cwd(), 'db-backup'),
      dockerImage: process.env.DOCKER_IMAGE || 'postgres:15-alpine',
      backupFile: process.env.BACKUP_FILE,
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
  if (config.backupFile) {
    console.log(`  Specific backup file: ${config.backupFile}`);
  }

  try {
    // Create database if it doesn't exist
    await createDatabaseIfNotExists(config);

    // Perform restore
    await restoreDatabase(config);

    console.log('\n=== Restore completed successfully ===');
  } catch (error) {
    console.error('\n=== Restore failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}
