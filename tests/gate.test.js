'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { splitArgsString, parseBooleanInput, runAction } = require('../gate/action-runner');

const repoRoot = path.join(__dirname, '..');

function writeCompliantMockServer(dir) {
  const file = path.join(dir, 'mock-mcp.js');
  fs.writeFileSync(
    file,
    `'use strict';
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'mock', version: '1.0.0' } } }) + '\\n');
  } else if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo_text', description: 'Echo input', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] } }) + '\\n');
  } else if (msg.method === 'ping') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\\n');
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method or tool not found' } }) + '\\n');
  }
});
`
  );
  return file;
}

test('public action.yml declares required inputs and keeps shell free of input interpolation', () => {
  const yaml = fs.readFileSync(path.join(repoRoot, 'action.yml'), 'utf8');
  for (const field of ['command:', 'args:', 'source:', 'output:', 'fail-on-review:']) {
    assert.ok(yaml.includes(field), `Missing input ${field}`);
  }
  const runLines = yaml.split('\n').filter((line) => line.trim().startsWith('run:'));
  for (const line of runLines) {
    assert.doesNotMatch(line, /\$\{\{\s*inputs\./);
  }
});

test('splitArgsString parses multiline args and flags starting with --', () => {
  assert.deepEqual(splitArgsString('./dist/server.js\n--stdio\n--port=3000'), ['./dist/server.js', '--stdio', '--port=3000']);
  assert.equal(parseBooleanInput('true'), true);
  assert.equal(parseBooleanInput('false'), false);
  assert.throws(() => parseBooleanInput('bad'), /Invalid boolean/);
});

test('runAction executes free gate end-to-end and logs zero-PII telemetry', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'velqiris-public-gate-'));
  const serverPath = writeCompliantMockServer(tempDir);
  const outputDir = path.join(tempDir, 'out');
  const ghOutput = path.join(tempDir, 'output.txt');
  const ghSummary = path.join(tempDir, 'summary.md');

  const code = await runAction({
    INPUT_COMMAND: process.execPath,
    INPUT_ARGS: `${serverPath} --stdio`,
    INPUT_OUTPUT: outputDir,
    INPUT_FAIL_ON_REVIEW: 'false',
    INPUT_CAMPAIGN_ID: 'public-gate-test',
    GITHUB_ACTIONS: 'true',
    GITHUB_OUTPUT: ghOutput,
    GITHUB_STEP_SUMMARY: ghSummary
  });

  assert.equal(code, 0);
  const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'gate-summary.json'), 'utf8'));
  assert.equal(summary.disposition, 'PASS');
  assert.equal(summary.summary.total, 8);
  assert.match(fs.readFileSync(ghOutput, 'utf8'), /disposition=PASS/);
  assert.match(fs.readFileSync(ghSummary, 'utf8'), /Velqiris Release Gate/);

  const event = JSON.parse(fs.readFileSync(path.join(outputDir, 'funnel-events.jsonl'), 'utf8').trim());
  assert.equal(event.event, 'gate_run');
  assert.equal(event.campaign_id, 'public-gate-test');
  assert.equal(event.tier, 'free-gate');
});

test('runAction handles invalid configuration cleanly with exit code 2', async () => {
  assert.equal(await runAction({ INPUT_COMMAND: '' }), 2);
});

test('public site HTML, llms.txt, and workflow contain only approved brands and zero personal identifiers', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const llms = fs.readFileSync(path.join(repoRoot, 'llms.txt'), 'utf8');
  const combined = `${html}\n${llms}`;

  assert.match(html, /Run the release gate on your MCP server\./);
  assert.match(html, /Buy the signed evidence bundle only when you need release proof\./);
  assert.match(html, /Chitara Trading/);
  assert.match(html, /0xC6F86e170411182114FcCdb28793dC76B5e8D144/);
  assert.match(html, /page_view.*gate_run.*checkout_open.*settlement_verified/s);
  assert.doesNotMatch(combined, /Chitara Labs|mireaionut|mirea\.trading|severmarcus|Sever Marcus|mircea|chatgpt\.site/i);
});
