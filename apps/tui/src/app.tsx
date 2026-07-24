import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ToolLoopAgent } from 'ai';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { classifyError, TransientError, PermanentError } from '@kalmi/core';

marked.setOptions({
  renderer: new TerminalRenderer(),
});

interface AppProps {
  agent: ToolLoopAgent;
  sessionName: string;
  isResuming: boolean;
  initialMessages: Message[];
  onExit: () => Promise<void>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolDone?: boolean;
}

export function App({ agent, sessionName, isResuming, initialMessages, onExit }: AppProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [exiting, setExiting] = useState(false);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      try {
        const result = await agent.generate({
          prompt,
          onToolExecutionStart: ({ toolCall }) => {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'tool',
                content: `  ⏳ ${toolCall.toolName}...`,
                toolName: toolCall.toolName,
                toolDone: false,
              },
            ]);
          },
          onToolExecutionEnd: ({ toolCall, toolOutput }) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.role === 'tool' &&
                m.toolName === toolCall.toolName &&
                !m.toolDone
                  ? {
                      ...m,
                      content: `  ${toolOutput.type === 'tool-result' ? '✓' : '✗'} ${toolCall.toolName}`,
                      toolDone: true,
                    }
                  : m,
              ),
            );
          },
        });

        const text = result.text ?? '';

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: text,
          },
        ]);
      } catch (err: unknown) {
        const classified = classifyError(err);

        if (classified instanceof TransientError) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Connection issue — the LLM or a tool didn't respond in time. Please try again.\n\n(${classified.message})`,
            },
          ]);
        } else if (err instanceof Error && 'partial' in err) {
          const partialErr = err as Error & { partial?: Record<string, unknown>; missingFields?: string[] };
          const partialText = partialErr.partial?.text as string | undefined;
          if (partialText) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `${partialText}\n\n[Response was truncated]`,
              },
            ]);
          }
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Partial response received. ${classified.message}`,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Error: ${classified.message}`,
            },
          ]);
        }
      } finally {
        setStreaming(false);
      }
    },
    [agent],
  );

  useEffect(() => {
    if (isResuming) {
      sendMessage('continue');
    }
  }, [isResuming]);

  const handleSubmit = useCallback(
    (value: string) => {
      if (streaming) return;
      sendMessage(value);
      setInput('');
    },
    [streaming, sendMessage],
  );

  useInput(
    async (_input, key) => {
      if (key.escape) {
        setExiting(true);
        await onExit();
        process.exit(0);
      }
    },
    { isActive: true },
  );

  if (exiting) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Goodbye.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          kalmi — {sessionName}
        </Text>
        {isResuming && messages.length === 0 && (
          <Text color="yellow"> (resuming...)</Text>
        )}
      </Box>

      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' && (
            <Text>
              <Text color="green" bold>
                You:{' '}
              </Text>
              <Text>{msg.content}</Text>
            </Text>
          )}
          {msg.role === 'assistant' && (
            <Text>{marked.parse(msg.content) as string}</Text>
          )}
          {msg.role === 'tool' && (
            <Text color={msg.toolDone === false ? 'yellow' : 'gray'}>
              {msg.content}
            </Text>
          )}
          {msg.role === 'system' && (
            <Text color="red">{msg.content}</Text>
          )}
        </Box>
      ))}

      {streaming && (
        <Box marginTop={1}>
          <Text color="gray">Thinking...</Text>
        </Box>
      )}

      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray">{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={streaming ? 'Waiting...' : 'Type a message...'}
          focus={!streaming}
        />
      </Box>
    </Box>
  );
}
