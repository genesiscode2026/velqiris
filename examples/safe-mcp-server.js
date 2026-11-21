#!/usr/bin/env node
'use strict';

const readline = require('node:readline');

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { protocolVersion: '2025-06-18', serverInfo: { name: 'velqiris-example-mcp', version: '1.0.0' } }
      })}\n`
    );
  } else if (msg.method === 'tools/list') {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'echo_text',
              description: 'Echo input text deterministically.',
              inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
            }
          ]
        }
      })}\n`
    );
  } else if (msg.method === 'ping') {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n`);
  } else {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: 'Method or tool not found' }
      })}\n`
    );
  }
});
