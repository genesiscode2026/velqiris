# VELQIRIS MCP Release Gate

A deterministic, zero-cloud GitHub Actions release gate for Node.js MCP stdio servers.

VELQIRIS runs eight runtime checks before an MCP server is released and emits a reproducible `PASS`, `REVIEW`, or `FAIL` decision. It runs on the repository's own GitHub runner and does not send source code or captured server output to a VELQIRIS service.

- Live documentation and evidence examples: https://genesiscode2026.github.io/velqiris/
- Commercial self-hosted CI evidence bundle: https://x402git.com/genesiscode2026/genesis-mcp-production-readiness
- Public pre-purchase manifest: https://x402git.com/api/label/genesiscode2026/genesis-mcp-production-readiness
- Security contact: `chitara.trading@proton.me`

## Use it in five minutes

Requirements: Node.js 20 or newer and an MCP server that communicates over stdio.

```yaml
name: VELQIRIS MCP Release Gate
on: [push, pull_request]

jobs:
  mcp-release-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: genesiscode2026/velqiris@v1
        with:
          command: node
          args: ./dist/server.js --stdio
          fail-on-review: "true"
```

For supply-chain-sensitive workflows, pin the full commit SHA behind the current `v1` release instead of using a moving major tag.

## What the free gate checks

| Check | Decision evidence |
| :--- | :--- |
| `PROC_START` | The process starts directly with `shell: false` and remains alive. |
| `PROTO_INIT` | The MCP `initialize` handshake succeeds. |
| `TOOLS_SCHEMA` | Tool names are unique and every `inputSchema` is an object. |
| `TOOL_RISK_REVIEW` | High-impact capability words are surfaced for human review. |
| `UNKNOWN_TOOL` | An unknown tool call returns a JSON-RPC error. |
| `CONCURRENCY` | Concurrent requests retain correct response correlation. |
| `PROTOCOL_PURITY` | Non-JSON stdout framing noise is detected. |
| `CAPTURE_BOUNDS` | Captured output remains inside an explicit 256 KiB bound. |

The free gate writes `gate-summary.json` and `gate-summary.md`. A `FAIL` blocks the workflow; a `REVIEW` blocks it when `fail-on-review: "true"` is selected.

## Commercial bundle: what is added

The commercial bundle adds:

- a ninth runtime check for secret exposure in stdout and stderr;
- ten secret-pattern classes with redacted evidence;
- five bounded static source rules plus the secret-pattern checks;
- `report.json`, `report.md`, and `manifest.sha256.json`;
- a self-hosted composite GitHub Action;
- a commercial internal-use source license.

`manifest.sha256.json` is a reproducible checksum manifest. It is not described as a cryptographic signature or third-party attestation.

## Reproducible failure demonstrations

[`demos/README.md`](./demos/README.md) contains three before-and-after cases:

1. invalid tool-schema drift;
2. stdout framing pollution;
3. runtime secret exposure.

Each case includes the intentionally broken server, corrected server, and captured commercial report artifacts. The examples contain synthetic credentials only.

## Scope and limitations

VELQIRIS evaluates observable local stdio behavior and bounded source patterns. It is not a penetration test, compliance certification, dependency/SBOM audit, proof of absence of vulnerabilities, or replacement for MCP Inspector and dedicated security scanners.

## Privacy and telemetry

The public Action does not phone home. Its optional funnel event is written only into the local workflow artifact. The landing page stores limited interaction events in the visitor's browser until an explicitly disclosed, privacy-preserving aggregate collector is configured.

## License

The public Action is licensed under the [MIT License](./LICENSE). The commercial bundle has a separate Chitara Trading commercial license.
