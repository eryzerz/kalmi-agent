import dotenv from 'dotenv';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env'), override: true });

console.log('importing app...');
const { App } = await import('./app.js');
console.log('App loaded:', typeof App);
