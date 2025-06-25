#!/usr/bin/env bun

console.log('=== Test Script ===');
console.log('Bun is working correctly!');
console.log('Node.js version:', process.version);
console.log('Current directory:', process.cwd());
console.log('Script arguments:', process.argv.slice(2));

// Test basic imports
import * as fs from 'fs';

console.log('File system imports work!');
console.log('Current directory contents:', fs.readdirSync('.').slice(0, 5));

console.log('=== Test completed successfully ===');
