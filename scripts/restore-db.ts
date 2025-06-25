#!/usr/bin/env bun

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface RestoreConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  backupDir: string;
  backupFile?: string;
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

function selectBackupFile(
  backupDir: string,
  backupFile?: string,
): string | null {
  if (backupFile) {
    const fullPath = path.join(backupDir, backupFile);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    } else {
      console.error(`Backup file not found: ${fullPath}`);
      return null;
    }
  }

  const files = listBackupFiles(backupDir);
  if (files.length === 0) {
    console.error('No backup files found in directory');
    return null;
  }

  console.log('Available backup files:');
  files.forEach((file, index) => {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(
      `  ${index + 1}. ${file} (${fileSizeInMB} MB, ${stats.mtime.toISOString()})`,
    );
  });

  // For now, use the most recent backup
  // In a real implementation, you might want to prompt the user
  const selectedFile = files[0];
  console.log(`\nUsing most recent backup: ${selectedFile}`);

  return path.join(backupDir, selectedFile);
}

async function restoreDatabase(config: RestoreConfig): Promise<void> {
  const backupFilePath = selectBackupFile(config.backupDir, config.backupFile);

  if (!backupFilePath) {
    throw new Error('No valid backup file found');
  }

  // Set environment variables for psql
  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  // Build psql command
  const psqlCmd = [
    'psql',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.username}`,
    `--dbname=${config.database}`,
    `--file=${backupFilePath}`,
  ].join(' ');

  try {
    console.log(`Starting database restore...`);
    console.log(`Backup file: ${backupFilePath}`);
    console.log(`Target database: ${config.database}`);
    console.log('');

    const { stderr } = await execAsync(psqlCmd, { env });

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
  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  // First, try to connect to postgres database to create our target database
  const createDbCmd = [
    'psql',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.username}`,
    '--dbname=postgres',
    '--command',
    `CREATE DATABASE "${config.database}";`,
  ].join(' ');

  try {
    console.log(
      `Creating database '${config.database}' if it doesn't exist...`,
    );
    await execAsync(createDbCmd, { env });
    console.log(`Database '${config.database}' is ready`);
  } catch {
    // Database might already exist, which is fine
    console.log(
      `Database '${config.database}' already exists or creation failed (this is usually OK)`,
    );
  }
}

async function main(): Promise<void> {
  // Configuration - you can override these with environment variables
  const config: RestoreConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'posthog',
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    backupDir: process.env.BACKUP_DIR || path.join(process.cwd(), 'db-backup'),
    backupFile: process.env.BACKUP_FILE, // Optional: specific backup file to restore
  };

  console.log('=== Database Restore Script ===');
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`Backup directory: ${config.backupDir}`);
  if (config.backupFile) {
    console.log(`Specific backup file: ${config.backupFile}`);
  }
  console.log('');

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
