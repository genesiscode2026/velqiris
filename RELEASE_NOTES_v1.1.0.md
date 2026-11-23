# VELQIRIS MCP Release Gate v1.1.0

## What changed

- Added an explicit MIT license and security reporting policy.
- Replaced ambiguous "signed evidence" language with "SHA-256 evidence manifest".
- Added reproducible broken/fixed demonstrations for schema drift, stdout framing pollution, and secret exposure.
- Clarified the exact split between the eight-check public gate and nine-check commercial bundle.
- Clarified the Node.js 20+ requirement and the limitations of the release decision.
- Removed wallet, acquisition, and unrelated portfolio promotion from the product funnel.

## Verification

```bash
node --check gate/mcp-gate.js
node --check gate/action-runner.js
node --test tests/*.test.js
```

For higher supply-chain assurance, pin this release's full commit SHA in production workflows. The moving `v1` tag is provided for users who prefer automatic compatible updates.
