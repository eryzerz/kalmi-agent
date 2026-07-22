import dotenv from 'dotenv';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env'), override: true });

console.log('1');
const core = await import('@kalmi/core');
console.log('2', core.getCurrentSession().name);
