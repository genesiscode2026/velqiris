'use strict';

const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

const PROTOCOL_VERSION = '2025-06-18';
const FREE_GATE_VERSION = '1.1.0';
const HIGH_IMPACT_KEYWORDS = /(transfer|payment|payout|withdraw|wallet|sign|delete|destroy|drop|exec|shell|command|spawn|write|chmod|token|secret|credential|password)/i;

class StdioGateClient {
  constructor(command, args, { requestTimeoutMs = 5000, maxCaptureBytes = 262144 } = {}) {
    this.command = command;
    this.args = args;
    this.requestTimeoutMs = requestTimeoutMs;
    this.maxCaptureBytes = maxCaptureBytes;
    this.nextId = 1;
    this.pending = new Map();
    this.noiseLines = [];
    this.stderrChunks = [];
    this.capturedBytes = 0;
    this.captureTruncated = false;
    this.exited = false;
    this.exitInfo = null;
    this.buffer = '';
    this.stdoutDecoder = new StringDecoder('utf8');
    this.stderrDecoder = new StringDecoder('utf8');
  }

  recordBytes(chunk) {
    this.capturedBytes += chunk.length;
    if (this.capturedBytes > this.maxCaptureBytes) {
      this.captureTruncated = true;
    }
  }

  start() {
    return new Promise((resolve) => {
      try {
        this.child = spawn(this.command, this.args, {
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (error) {
        this.exited = true;
        this.exitInfo = { error: error.message };
        resolve({ started: false, reason: error.message });
        return;
      }

      let settled = false;
      const done = (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(grace);
          resolve(result);
        }
      };

      const grace = setTimeout(() => {
        done({ started: true });
      }, 150);

      this.child.on('error', (error) => {
        this.exited = true;
        this.exitInfo = { error: error.message };
        this.failPending(new Error(`Spawn error: ${error.message}`));
        done({ started: false, reason: error.message });
      });

      this.child.on('exit', (code, signal) => {
        this.exited = true;
        this.exitInfo = { code, signal };
        const remainder = this.stdoutDecoder.end();
        if (remainder) this.consumeStdoutText(remainder);
        const stderrTail = this.stderrDecoder.end();
        if (stderrTail) this.stderrChunks.push(stderrTail);
        this.failPending(new Error(`Process exited unexpectedly (code=${code}, signal=${signal})`));
        done({ started: false, reason: `Exited during startup (code=${code}, signal=${signal})` });
      });

      this.child.stdout.on('data', (chunk) => {
        this.recordBytes(chunk);
        if (!this.captureTruncated) {
          this.consumeStdoutText(this.stdoutDecoder.write(chunk));
        }
      });

      this.child.stderr.on('data', (chunk) => {
        this.recordBytes(chunk);
        if (!this.captureTruncated) {
          this.stderrChunks.push(this.stderrDecoder.write(chunk));
        }
      });
    });
  }

  consumeStdoutText(text) {
    this.buffer += text;
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        if (this.noiseLines.length < 10) this.noiseLines.push(line.slice(0, 120));
        continue;
      }
      if (parsed && parsed.id !== undefined && this.pending.has(parsed.id)) {
        const entry = this.pending.get(parsed.id);
        this.pending.delete(parsed.id);
        clearTimeout(entry.timer);
        entry.resolve(parsed);
      }
    }
  }

  failPending(error) {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  notify(method, params = {}) {
    if (!this.child || this.exited) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  request(method, params = {}) {
    if (!this.child || this.exited) return Promise.reject(new Error('Process is not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout after ${this.requestTimeoutMs}ms waiting for ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async stop() {
    this.failPending(new Error('Client stopped'));
    if (!this.child || this.exited) return;
    try {
      this.child.stdin.end();
      this.child.kill('SIGTERM');
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (!this.exited) {
      try {
        this.child.kill('SIGKILL');
      } catch {
        // Ignore already-exited child.
      }
    }
  }
}

async function runFreeGate({ command, args = [], requestTimeoutMs = 5000, concurrency = 5, source = '' } = {}) {
  const checks = [];
  const client = new StdioGateClient(command, args, { requestTimeoutMs });

  try {
    const started = await client.start();
    if (!started.started) {
      checks.push({ id: 'PROC_START', status: 'FAIL', summary: started.reason || 'Failed to spawn process.' });
    } else {
      checks.push({ id: 'PROC_START', status: 'PASS', summary: 'Process spawned with shell: false and stayed alive.' });

      try {
        const initRes = await client.request('initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'velqiris-release-gate', version: FREE_GATE_VERSION }
        });
        if (initRes.error || !initRes.result) {
          checks.push({ id: 'PROTO_INIT', status: 'FAIL', summary: 'initialize returned JSON-RPC error or empty result.' });
        } else {
          client.notify('notifications/initialized', {});
          checks.push({
            id: 'PROTO_INIT',
            status: 'PASS',
            summary: `Negotiated protocol ${initRes.result.protocolVersion || 'unknown'}.`
          });
        }
      } catch (error) {
        checks.push({ id: 'PROTO_INIT', status: 'FAIL', summary: error.message });
      }

      let tools = [];
      try {
        const listRes = await client.request('tools/list', {});
        if (listRes.error || !listRes.result || !Array.isArray(listRes.result.tools)) {
          checks.push({ id: 'TOOLS_SCHEMA', status: 'FAIL', summary: 'tools/list did not return a tools array.' });
        } else {
          tools = listRes.result.tools;
          const names = new Set();
          let invalidCount = 0;
          for (const tool of tools) {
            if (!tool || typeof tool.name !== 'string' || !tool.name.trim() || names.has(tool.name)) invalidCount += 1;
            else names.add(tool.name);
            if (!tool.inputSchema || typeof tool.inputSchema !== 'object' || tool.inputSchema.type !== 'object') invalidCount += 1;
          }
          checks.push({
            id: 'TOOLS_SCHEMA',
            status: invalidCount === 0 ? 'PASS' : 'FAIL',
            summary: invalidCount === 0 ? `${tools.length} tool(s) valid.` : `${invalidCount} schema defect(s) across ${tools.length} tool(s).`
          });
        }
      } catch (error) {
        checks.push({ id: 'TOOLS_SCHEMA', status: 'FAIL', summary: error.message });
      }

      const flagged = tools
        .filter((tool) => HIGH_IMPACT_KEYWORDS.test(`${tool?.name || ''} ${tool?.description || ''}`))
        .map((tool) => tool.name);
      checks.push({
        id: 'TOOL_RISK_REVIEW',
        status: flagged.length === 0 ? 'PASS' : 'WARN',
        summary: flagged.length === 0 ? 'No high-impact tool keywords flagged.' : `${flagged.length} tool(s) flagged for review.`
      });

      try {
        const unknownRes = await client.request('tools/call', { name: '__velqiris_nonexistent_tool__', arguments: {} });
        checks.push({
          id: 'UNKNOWN_TOOL',
          status: unknownRes.error ? 'PASS' : 'WARN',
          summary: unknownRes.error ? 'Returned JSON-RPC error for unknown tool.' : 'Unknown tool call did not return JSON-RPC error.'
        });
      } catch (error) {
        checks.push({ id: 'UNKNOWN_TOOL', status: 'FAIL', summary: error.message });
      }

      try {
        const responses = await Promise.all(
          Array.from({ length: concurrency }, (_, idx) => client.request(idx % 2 === 0 ? 'ping' : 'tools/list', {}))
        );
        const valid = responses.every((res) => res && (res.result !== undefined || res.error !== undefined));
        checks.push({
          id: 'CONCURRENCY',
          status: valid ? 'PASS' : 'FAIL',
          summary: valid ? `${concurrency} concurrent requests correlated.` : 'Malformed response envelope in concurrent calls.'
        });
      } catch (error) {
        checks.push({ id: 'CONCURRENCY', status: 'FAIL', summary: error.message });
      }

      checks.push({
        id: 'PROTOCOL_PURITY',
        status: client.noiseLines.length === 0 ? 'PASS' : 'WARN',
        summary: client.noiseLines.length === 0 ? 'No non-JSON stdout framing noise.' : `${client.noiseLines.length} non-JSON stdout line(s) observed.`
      });

      checks.push({
        id: 'CAPTURE_BOUNDS',
        status: client.captureTruncated ? 'WARN' : 'PASS',
        summary: client.captureTruncated ? 'Capture exceeded 256 KiB bound.' : `Captured ${client.capturedBytes} bytes within bounds.`
      });
    }
  } finally {
    await client.stop();
  }

  const passed = checks.filter((c) => c.status === 'PASS').length;
  const warned = checks.filter((c) => c.status === 'WARN').length;
  const failed = checks.filter((c) => c.status === 'FAIL').length;
  const disposition = failed > 0 ? 'FAIL' : warned > 0 ? 'REVIEW' : 'PASS';

  return {
    schemaVersion: '1.0',
    tier: 'free-gate',
    product: { name: 'VELQIRIS MCP Release Gate', edition: 'free-runtime-gate', version: FREE_GATE_VERSION },
    generatedAt: new Date().toISOString(),
    disposition,
    summary: { passed, warned, failed, total: checks.length },
    checks,
    commercialUpgrade: {
      sourceRequested: Boolean(source),
      includedInPaidBundle: ['bounded static source audit (--source)', '10-pattern secret redaction', 'SHA-256 manifest.sha256.json', 'Chitara Trading commercial license'],
      checkoutUrl: 'https://x402git.com/genesiscode2026/genesis-mcp-production-readiness'
    }
  };
}

module.exports = { runFreeGate };
