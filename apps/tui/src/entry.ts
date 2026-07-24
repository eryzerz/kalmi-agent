import dotenv from 'dotenv';
import path from 'node:path';
import { render } from 'ink';
import React from 'react';
import * as readline from 'node:readline/promises';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env'), override: true });

let core: any;
try {
  core = await import('@kalmi/core');
} catch (err) {
  console.error('Failed to load @kalmi/core:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const { initTelemetry } = core;
let startError: string | null = null;

try {
  initTelemetry();
} catch (err) {
  startError = `Telemetry init failed (non-critical): ${err instanceof Error ? err.message : String(err)}`;
}

try {
  const { createAgent } = await import('@kalmi/core/agent');
  const { buildTools } = await import('@kalmi/core/tools');
  const { getCurrentSession, getCheckpoint, clearCheckpoint, getLog } = core;

  const { App } = await import('./app.js');

  if (startError) console.warn(startError);

  const args = process.argv.slice(2);

  const session = getCurrentSession();
  console.log(`Session: ${session.name}  |  Model: ${session.model}`);

  const history = getLog(session.id).slice(-10);
  const initialMessages: any[] = [];

  for (const entry of history as Record<string, unknown>[]) {
    const user = typeof entry.user === 'string' ? entry.user : undefined;
    if (user) {
      initialMessages.push({ id: crypto.randomUUID(), role: 'user', content: user });
    }
    const toolCalls = Array.isArray(entry.toolCalls) ? entry.toolCalls : [];
    if (toolCalls.length) {
      for (const tc of toolCalls) {
        const tcName = (tc as any)?.name ?? 'unknown';
        initialMessages.push({
          id: crypto.randomUUID(),
          role: 'tool',
          content: `  ✓ ${tcName}`,
        });
      }
    }
    const assistant = typeof entry.assistant === 'string' ? entry.assistant : undefined;
    if (assistant !== undefined) {
      initialMessages.push({ id: crypto.randomUUID(), role: 'assistant', content: assistant });
    }
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

  let exiting = false;
  process.on('SIGINT', async () => {
    if (exiting) {
      process.exit(1);
    }
    exiting = true;
    unmount();
    try {
      await cleanup();
    } finally {
      process.exit(0);
    }
  });

  await waitUntilExit();
  await cleanup();
} catch (err) {
  console.error('Failed to start kalmi:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
