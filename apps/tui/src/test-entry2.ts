import dotenv from 'dotenv';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env'), override: true });

console.log('a');
const core = await import('@kalmi/core');
console.log('b', core.getCurrentSession().name);
const agent = await import('@kalmi/core/agent');
console.log('c');
const app = await import('./app.js');
console.log('d', typeof app.App);
