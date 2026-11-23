'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

test('public site, metadata, and license use the canonical product claims', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const llms = fs.readFileSync(path.join(repoRoot, 'llms.txt'), 'utf8');
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const license = fs.readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8');
  const combined = `${html}\n${llms}\n${readme}`;

  assert.match(html, /Block risky MCP releases before they ship\./);
  assert.match(html, /Standard commercial license/);
  assert.match(html, /29 <small>USDC<\/small>/);
  assert.doesNotMatch(html, /Founding cohort|19 USDC|49 USDC|79 USDC/);
  assert.match(html, /Chitara Trading/);
  assert.match(license, /MIT License/);
  assert.match(combined, /Node\.js 20\+/);
  assert.match(combined, /SHA-256/);
  assert.doesNotMatch(combined, /signed evidence|signed bundle/i);
  assert.doesNotMatch(combined, /acquisition|buyout|no-KYC|escrow/i);
  assert.doesNotMatch(combined, /0x[a-fA-F0-9]{40}/);
  assert.doesNotMatch(combined, /Chitara Labs|mireaionut|mirea\.trading|severmarcus|Sever Marcus|mircea|chatgpt\.site/i);
});

test('public demonstrations preserve expected broken and fixed outcomes with valid hashes', () => {
  const expected = {
    'schema-drift': { broken: 'FAIL', fixed: 'PASS' },
    'stdout-framing': { broken: 'REVIEW', fixed: 'PASS' },
    'secret-exposure': { broken: 'FAIL', fixed: 'PASS' }
  };

  for (const [name, outcomes] of Object.entries(expected)) {
    for (const [variant, disposition] of Object.entries(outcomes)) {
      const dir = path.join(repoRoot, 'demos', name, 'captured', variant);
      const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.sha256.json'), 'utf8'));
      assert.equal(report.disposition, disposition, `${name}/${variant}`);
      assert.equal(report.product.version, '2.2.2');
      for (const [file, metadata] of Object.entries(manifest.files)) {
        const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex');
        assert.equal(digest, metadata.sha256, `${name}/${variant}/${file}`);
      }
    }
  }
});
