import dotenv from 'dotenv';
import path from 'node:path';
import { render } from 'ink';
import React from 'react';
import * as readline from 'node:readline/promises';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env'), override: true });

const core = await import('@kalmi/core');
const { createAgent } = await import('@kalmi/core/agent');
const { buildTools } = await import('@kalmi/core/tools');
const { getCurrentSession, getCheckpoint, clearCheckpoint, initTelemetry, getLog } = core;

const { App } = await import('./app.js');

initTelemetry();

const args = process.argv.slice(2);

const session = getCurrentSession();
console.log(`Session: ${session.name}  |  Model: ${session.model}`);

const history = getLog(session.id).slice(-10);
const initialMessages: any[] = [];

for (const entry of history) {
  initialMessages.push({ id: crypto.randomUUID(), role: 'user', content: entry.user });
  if (entry.toolCalls?.length) {
    for (const tc of entry.toolCalls) {
      initialMessages.push({ id: crypto.randomUUID(), role: 'tool', content: `  ✓ ${tc.name}` });
    }
  }
  initialMessages.push({ id: crypto.randomUUID(), role: 'assistant', content: entry.assistant });
}

const checkpointMessages = getCheckpoint(session.id);
let resumeFrom: any[] | undefined;

if (checkpointMessages) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Interrupted run detected. Resume? [y/N] ');
  rl.close();
  if (answer.toLowerCase().startsWith('y')) {
    resumeFrom = checkpointMessages;
    console.log('Resuming...');
  } else {
    resumeFrom = undefined;
    clearCheckpoint(session.id);
  }
}
console.log('');

const { agent, cleanup } = await createAgent({ session, resumeFrom });

const { unmount, waitUntilExit } = render(
  React.createElement(App, {
    agent,
    sessionName: session.name,
    isResuming: !!resumeFrom,
    initialMessages,
    onExit: async () => {
      await cleanup();
    },
  }),
);

process.on('SIGINT', async () => {
  unmount();
  await cleanup();
  process.exit(0);
});

await waitUntilExit();
await cleanup();
