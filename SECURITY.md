# Security Policy

Free Jarvis — **Your Personal AI. Your Device. Your Rules.**

Free Jarvis is designed to keep inference and personal data on your device by
default. This policy describes what is supported, how to report a vulnerability
privately, and the security controls built into the product.

---

## Supported Versions

| Version | Supported |
|---|---|
| Latest published release | Yes — security fixes target this release |
| Older releases | No — upgrade to the latest published release |
| Development / unreleased builds | No — use a published release |

Security fixes are delivered in new published releases. Before reporting an
issue, upgrade to the latest release in case it has already been fixed.

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue, discussion, or pull request for a
security vulnerability.**

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability** (GitHub private vulnerability reporting).
3. If that option is unavailable, enable private vulnerability reporting in the
   repository settings. This is the designated reporting channel placeholder.

No security email address is published for this repository. Do not send
vulnerability details to personal addresses or disclose them publicly before a
fix is available.

When reporting, include as much of the following as you can: the affected
version and platform, the component involved, steps to reproduce, the impact
you observed, and any suggested mitigation. Please allow maintainers a
reasonable opportunity to investigate and prepare a fix before public
disclosure.

---

## Security Architecture

- **Local-first by default.** Inference uses a local Ollama endpoint on
  `localhost` / `127.0.0.1`. Cloud providers are optional integrations and are
  never required to run Free Jarvis; enabling one is an explicit choice that
  sends the corresponding prompts to that provider.
- **Loopback bind by default.** The API server binds `127.0.0.1` unless told
  otherwise. An API key (`OPENJARVIS_API_KEY` or `[server.auth].api_key`) is
  required for a non-loopback bind, and the server refuses to start on a
  non-loopback address without one. HTTP clients authenticate with
  `Authorization: Bearer <key>`; browser WebSocket clients use the
  `openjarvis.auth.v1` subprotocol and send a marked, base64url-encoded
  credential in `Sec-WebSocket-Protocol`. That encoding is transport syntax,
  not encryption — use `wss://` for remote connections.
- **Sandbox.** `SandboxedAgent` / `ContainerRunner` can run an agent in a
  container started with `--rm` and `--network none`, with read-only mounts
  validated against an allowlist. Blocked mount patterns include `.ssh`,
  `.env`, `*.pem`, and `*.key`.
- **Capability policy.** Tool dispatch and agent operations are subject to
  capability checks. The `shared` and `server` security profiles enable
  capabilities with `default_deny = true`; an explicit policy file receives no
  automatic baseline grants, and built-in requirements cannot be weakened by
  omitting them from tool metadata. Capability grants never bypass a tool's
  confirmation requirement, and capability-policy initialization failures stop
  startup rather than silently disabling enforcement.
- **Audit logs.** The `AuditLogger` records security events, tool completions,
  and capability / rate-limit denials (including the policy identity) to an
  append-only SQLite database at `~/.openjarvis/audit.db` by default,
  configurable via `security.audit_log_path`. Retention is managed externally.
- **Approvals.** Tools marked `requires_confirmation` (for example `shell_exec`,
  `git_commit`, and `agent_kill`) prompt before execution in interactive
  `jarvis chat`. Other entry points (`jarvis ask`, the HTTP server, and the
  desktop app) auto-approve them; agents embedded without a confirmation
  callback fail closed. Do not rely on the legacy
  `security.enforce_tool_confirmation` setting for enforcement — the upstream
  loader accepts it but does not enforce it.
- **Guardrails.** `GuardrailsEngine` can scan prompts and outputs for secrets
  and PII in WARN, REDACT, or BLOCK mode, and the file policy blocks sensitive
  paths for file-reading tools. Scanning of streamed output is post-hoc, so
  BLOCK mode protects the input side only. These are guardrails, not a
  complete isolation boundary; use the sandbox for untrusted content.

---

## Safe Defaults

- Keep the server bound to `127.0.0.1`. Expose it only when needed, with a
  generated API key, network restrictions, and TLS/`wss://` for remote clients.
- Do not put real credentials in source control. Keep `.env` untracked, generate
  your own keys locally, rotate any key that may have leaked, and leave
  `.env.example` placeholder-only.
- Keep runtime state in the data directory (`~/.openjarvis`, or the configured
  `FREE_JARVIS_HOME` / legacy `OPENJARVIS_HOME`) — never inside the source tree.
- No cloud API key is needed for local use. Add cloud credentials only for
  engines you intentionally enable.
- Use `jarvis scan` and `jarvis scan --data-boundaries` to check host posture and
  data boundaries before storing sensitive data or enabling channels.
- Prefer sandboxed execution when an agent handles untrusted documents or code,
  and enable stricter guardrail modes for those workflows.

---

## Upstream Disclosure Note

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. Free Jarvis adds local-first defaults,
product branding, setup tooling, and interface changes; it does not claim
authorship of the upstream implementation.

Issues in inherited upstream code should also be reported to the upstream
project through its own private reporting channel. Where a vulnerability
affects both projects, coordinate disclosure with upstream rather than
disclosing details publicly first.
