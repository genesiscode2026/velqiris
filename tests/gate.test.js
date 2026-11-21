'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { splitArgsString, parseBooleanInput, runAction } = require('../gate/action-runner');

const repoRoot = path.join(__dirname, '..');
const exampleServerPath = path.join(repoRoot, 'examples', 'safe-mcp-server.js');

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
  const outputDir = path.join(tempDir, 'out');
  const ghOutput = path.join(tempDir, 'output.txt');
  const ghSummary = path.join(tempDir, 'summary.md');

  const code = await runAction({
    INPUT_COMMAND: process.execPath,
    INPUT_ARGS: `${exampleServerPath} --stdio`,
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
  assert.match(html, /4qsbTJavjQvHqU5ZoV3UndPBb9RHNp7YZMTNpAiR4oZk/);
  assert.match(html, /bc1q9m69vwxhn3xkuq97arnnkavj46vj8rk3kssxcr/);
  assert.match(html, /raQkD9nkG9UYA56aexbfiuhNZGDDLuSWs9/);
  assert.match(html, /page_view.*gate_run.*checkout_open.*settlement_verified/s);
  assert.doesNotMatch(combined, /Chitara Labs|mireaionut|mirea\.trading|severmarcus|Sever Marcus|mircea|chatgpt\.site/i);
});
