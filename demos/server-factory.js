#!/usr/bin/env node
'use strict';

const readline = require('node:readline');

function runServer({ name, invalidSchema = false, stdoutNoise = false, stderrSecret = false }) {
  if (stdoutNoise) process.stdout.write('debug: server starting\n');
  if (stderrSecret) {
    const synthetic = ['sk', 'demo000000000000000000000000'].join('-');
    process.stderr.write(`synthetic test token: ${synthetic}\n`);
  }

  const inputSchema = invalidSchema
    ? { type: 'string' }
    : { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    const request = JSON.parse(line);
    let response;

    if (request.method === 'initialize') {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: request.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name, version: '1.0.0' }
        }
      };
    } else if (request.method === 'tools/list') {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [{ name: 'echo_text', description: 'Echo text.', inputSchema }]
        }
      };
    } else if (request.method === 'ping') {
      response = { jsonrpc: '2.0', id: request.id, result: {} };
    } else {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method or tool not found' }
      };
    }

    if (request.id !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
}

module.exports = { runServer };
