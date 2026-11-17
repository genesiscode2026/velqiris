#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runFreeGate } = require('./mcp-gate');

const DEFAULT_CAMPAIGN_ID = 'velqiris-release-gate-v1';

function splitArgsString(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return [];
  const tokens = [];
  let current = '';
  let quote = null;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (escaping) current += '\\';
  if (quote) throw new Error('Unterminated quote in args input');
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function parseBooleanInput(raw, fallback = false) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  throw new Error(`Invalid boolean value: ${raw}`);
}

function renderSummaryMarkdown(result, campaignId) {
  const rows = result.checks
    .map((c) => `| \`${c.id}\` | **${c.status}** | ${String(c.summary).replace(/\|/g, '\\|')} |`)
    .join('\n');
  return `# Velqiris Release Gate (Free Runtime Tier)

- **Disposition:** **${result.disposition}**
- **Checks:** ${result.summary.passed} passed, ${result.summary.warned} warned, ${result.summary.failed} failed (${result.summary.total} total)
- **Campaign:** \`${campaignId}\`

| Check | Status | Details |
| :--- | :--- | :--- |
${rows}

> Need full **static source analysis** (\`--source\`), **10-pattern secret redaction**, signed **\`manifest.sha256.json\`**, and a **Chitara Trading** commercial license?  
> Open instant Base USDC checkout (79 USDC): https://x402git.com/genesiscode2026/genesis-mcp-production-readiness?campaign_id=${encodeURIComponent(campaignId)}
`;
}

async function runAction(env = process.env) {
  const command = String(env.INPUT_COMMAND ?? '').trim();
  if (!command) {
    console.error('Configuration error: input "command" is required');
    return 2;
  }

  let args;
  let failOnReview;
  try {
    args = splitArgsString(env.INPUT_ARGS);
    failOnReview = parseBooleanInput(env.INPUT_FAIL_ON_REVIEW, false);
  } catch (error) {
    console.error(`Configuration error: ${error.message}`);
    return 2;
  }

  const source = String(env.INPUT_SOURCE ?? '').trim();
  const outputDir = path.resolve(String(env.INPUT_OUTPUT ?? '').trim() || 'velqiris-gate-summary');
  const campaignId = String(env.INPUT_CAMPAIGN_ID ?? '').trim().replace(/[^a-zA-Z0-9._:/-]/g, '').slice(0, 80) || DEFAULT_CAMPAIGN_ID;

  const result = await runFreeGate({ command, args, source });
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });

  const summaryJsonPath = path.join(outputDir, 'gate-summary.json');
  const summaryMdPath = path.join(outputDir, 'gate-summary.md');
  const telemetryPath = path.join(outputDir, 'funnel-events.jsonl');

  const markdown = renderSummaryMarkdown(result, campaignId);
  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(summaryMdPath, markdown, { mode: 0o600 });

  const telemetryEvent = {
    schemaVersion: '1.0',
    event: 'gate_run',
    campaign_id: campaignId,
    surface: env.GITHUB_ACTIONS === 'true' ? 'github-action' : 'cli',
    tier: 'free-gate',
    status: result.disposition,
    timestamp_utc: new Date().toISOString(),
    metadata: {
      passed: result.summary.passed,
      warned: result.summary.warned,
      failed: result.summary.failed,
      total: result.summary.total,
      source_requested: Boolean(source)
    }
  };
  fs.appendFileSync(telemetryPath, `${JSON.stringify(telemetryEvent)}\n`, { mode: 0o600 });

  if (env.GITHUB_OUTPUT) {
    const outLines = [
      `disposition=${result.disposition}`,
      `passed=${result.summary.passed}`,
      `warned=${result.summary.warned}`,
      `failed=${result.summary.failed}`,
      `total=${result.summary.total}`,
      `output-dir=${outputDir}`,
      `summary-path=${summaryJsonPath}`,
      `telemetry-path=${telemetryPath}`
    ];
    fs.appendFileSync(env.GITHUB_OUTPUT, `${outLines.join('\n')}\n`);
  }

  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  console.log(`Disposition: ${result.disposition} (${result.summary.passed}/${result.summary.total} PASS)`);
  console.log(`Summary: ${summaryJsonPath}`);
  return result.disposition === 'FAIL' || (failOnReview && result.disposition === 'REVIEW') ? 1 : 0;
}

if (require.main === module) {
  runAction().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { splitArgsString, parseBooleanInput, runAction };
