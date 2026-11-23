# Velqiris — Evidence Report

- Disposition: **PASS**
- Generated: 2026-11-23T21:42:19.490Z
- Product version: 2.2.2
- Runtime target: node (1 argument(s))

## Runtime summary

Passed: 9; warnings: 0; failed: 0; total: 9.

| ID | Status | Check | Evidence |
|---|---|---|---|
| PROC_START | PASS | Process startup and stdio binding | Process spawned without a shell and remained alive through the startup grace period. |
| PROTO_INIT | PASS | MCP protocol handshake | Server 'secret-exposure-fixed' negotiated protocol '2025-06-18'. |
| TOOLS_SCHEMA | PASS | Tool discovery and schema structure | Discovered 1 tool(s) with structurally valid input schemas. |
| TOOL_RISK_REVIEW | PASS | High-impact tool metadata review | No high-impact capability keywords were identified in tool metadata. |
| UNKNOWN_TOOL | PASS | Unknown tool rejection | Server returned a JSON-RPC error for an unknown tool. |
| CONCURRENCY | PASS | Concurrent request correlation | Resolved 5 concurrent requests without timeout or identifier mismatch. |
| PROTOCOL_PURITY | PASS | Stdout protocol purity | No non-JSON stdout lines were observed. |
| SECRET_EXPOSURE | PASS | Runtime secret exposure scan | No supported credential patterns were detected in captured stdout or stderr. |
| CAPTURE_BOUNDS | PASS | Evidence capture bounds | Captured output stayed within configured byte limits. |

## Static source review

Not requested.

## Interpretation

- **PASS**: no failure or review condition was observed by these bounded checks.
- **REVIEW**: one or more conditions require human assessment before production use.
- **FAIL**: at least one tested control failed.

## Scope and limitations

This is technical evidence, not a certification, warranty, penetration test, legal opinion, or guarantee of security. Static rules are intentionally bounded and may produce false positives or miss vulnerabilities. Runtime checks observe one local execution under the supplied configuration; they do not prove behavior under every input, dependency, deployment, identity, or network condition. Review high-impact tools, authorization, data handling, dependency provenance, and deployment controls separately.
