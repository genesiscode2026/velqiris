# Velqiris Release Gate

**Run the release gate on your MCP server.**  
**Buy the signed evidence bundle only when you need release proof.**

Public free GitHub Actions runtime gate and documentation for **Velqiris** — by **Chitara Trading**.

- Live Release Gate page & benchmarks: https://genesiscode2026.github.io/velqiris/
- Commercial signed bundle (`v2.2.0`, 79 USDC on Base): https://x402git.com/genesiscode2026/genesis-mcp-production-readiness
- Public pre-purchase manifest: https://x402git.com/api/label/genesiscode2026/genesis-mcp-production-readiness
- Commercial support: `chitara.trading@proton.me`

## Free 5-Minute GitHub Actions Gate

Add `.github/workflows/velqiris-release-gate.yml` to any MCP server repository:

```yaml
name: Velqiris MCP Release Gate
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
          fail-on-review: "false"
```

All inputs are passed via environment variables (`shell: false` child spawn) with zero shell string concatenation.
