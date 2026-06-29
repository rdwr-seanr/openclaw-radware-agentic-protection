# OpenClaw Radware Connector Install Audit

## Summary

- Date: 2026-06-29
- Ubuntu host: `10.210.240.131`
- OpenClaw version tested: `2026.6.10`
- Published package audited first: `openclaw-radware-agentic-protection@0.1.5`
- Prepared package version after fixes: `0.2.0`
- Recommendation: release `0.2.0` with the documented limitations; NPM publish and deprecation require an authenticated NPM session.

## Install Findings

- The official OpenClaw Linux installer works after prerequisites are present. On a clean Ubuntu host without Node.js and Git, non-interactive SSH installation failed when the installer needed sudo. This should be documented for fresh lab servers; customer plugin docs can continue assuming OpenClaw is already installed.
- Current `0.1.5` in-path setup successfully merged a `radware-openai` provider into an onboarded OpenClaw config using env placeholders.
- Current `0.1.5` out-of-path setup successfully installed the plugin and merged the `radware-agentic` plugin config, but the helper printed a bare plugin install command. Docs and helper output now use `openclaw plugins install npm:openclaw-radware-agentic-protection@latest`.
- During local CLI simulation, `--env-file` was found to conflict with Node's own runtime flag. The documented setup flag is now `--runtime-env-file`; the one-command interactive wizard is unaffected.
- Two isolated profiles were used on the same host: `inpath` on port `18790` and `outpath` on port `18791`.
- Runtime keys were stored only in chmod `600` env files on the server and were not committed.

## Validation Matrix

| Mode | Test | Expected | Actual | HTTP | Event ID | Status |
| --- | --- | --- | --- | --- | --- | --- |
| in-path | Benign request | allowed | allowed | 200 |  | PASS |
| in-path | AI Guardrails: credit-card PII | blocked | blocked | 200 | Sean-In-Path-Connector-Test-1782723138-6nsx7y | PASS |
| in-path | AI Guardrails: HAPBlocker | blocked | blocked | 200 | Sean-In-Path-Connector-Test-1782723139-sceok2 | PASS |
| in-path | AI Guardrails: blocked medical topic | blocked | blocked | 200 | Sean-In-Path-Connector-Test-1782723142-tb0gal | PASS |
| out-of-path | Benign request | allowed | allowed | 200 |  | PASS |
| out-of-path | AI Guardrails: credit-card PII | blocked | blocked | 200 | Sean-Out-of-Path-Connector-Test-1782723143-y82ona | PASS |
| out-of-path | AI Guardrails: HAPBlocker | blocked | blocked | 200 | Sean-Out-of-Path-Connector-Test-1782723144-2j52tn | PASS |
| out-of-path | AI Guardrails: blocked medical topic | blocked | allowed | 200 |  | PORTAL REVIEW |
| out-of-path | Behavioral malicious tool action | blocked | blocked | 200 | Sean-Out-of-Path-Connector-Test-1782723147-l7y4hw | PASS |

## Provider Endpoint Validation

Direct OpenAI-compatible provider endpoints were tested separately from Radware in-path routing:

| Provider | Endpoint | Model | Result | Status |
| --- | --- | --- | --- | --- |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `gemini-2.5-flash` | Request succeeded | PASS |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/models` | n/a | Model listing succeeded | PASS |
| NVIDIA NIM / Nemotron | `https://integrate.api.nvidia.com/v1/chat/completions` | `nvidia/nemotron-3-nano-30b-a3b` | Request succeeded | PASS |
| NVIDIA NIM / Nemotron | `https://integrate.api.nvidia.com/v1/models` | n/a | Model listing succeeded | PASS |

Radware Gemini in-path routing was tested with the provided Gemini in-path deployment key and multiple candidate Radware paths:

| Radware path pattern | Result | Status |
| --- | --- | --- |
| `/v1/openai` | Routed to OpenAI and rejected the Gemini upstream key | NOT GEMINI PATH |
| `/v1/gemini`, `/v1/google`, `/v1/google-gemini`, `/v1/googleai`, `/v1/google-ai`, `/v1/generativelanguage`, `/v1/generativeai`, `/v1/vertexai`, `/v1/vertex-ai` | `process request failed` | RADWARE PORTAL REVIEW |
| `/v1/google/openai`, `/v1/gemini/openai`, `/v1/google/v1beta/openai`, `/v1/gemini/v1beta/openai`, and related nested variants | Not found or failed | RADWARE PORTAL REVIEW |

Out-of-path checks were also tested with only `ModelToUse` changed while using the same Radware out-of-path endpoint. This confirms the connector does not need to know or configure the customer's LLM endpoint in out-of-path mode:

| Mode | ModelToUse | Benign | PII guardrail | Event ID | Status |
| --- | --- | --- | --- | --- | --- |
| out-of-path | `gpt-4o` | allowed | blocked | Sean-Out-of-Path-Connector-Test-1782737868-h9y3id | PASS |
| out-of-path | `gemini-2.5-flash` | allowed | blocked | Sean-Out-of-Path-Connector-Test-1782737869-1bplng | PASS |
| out-of-path | `nvidia/nemotron-3-nano-30b-a3b` | allowed | blocked | Sean-Out-of-Path-Connector-Test-1782737870-a9p4dg | PASS |

## Changes Made

- Added an interactive `radware-openclaw-setup` wizard with prompts for deployment type, Radware key, endpoint, model, config path, env-file path, fail mode, portal user identifier, and apply/dry-run confirmation.
- Removed the out-of-path OpenAI-key prompt from the setup flow. Out-of-path preserves the customer's existing OpenClaw model provider and does not manage customer LLM provider credentials.
- Added chmod `600` env-file writing and startup guidance so real keys stay out of `openclaw.json`.
- Added setup diagnostics: failures print a concise support summary and write a sanitized log under `~/.openclaw/logs/radware-openclaw-setup-<timestamp>.log`; `--log-file` can force a specific setup log path.
- Added out-of-path runtime diagnostics: generated env files set `RADWARE_AGENTIC_DIAGNOSTIC_LOG`, and the plugin writes sanitized JSONL records for missing keys, Radware API failures, HTTP failures, invalid response shapes, and fail-open/fail-close decisions.
- Added setup-generated full-stage out-of-path config: prompt, response, and tool. Existing configs without `stages` remain tool-stage only.
- Added prompt-stage and response-stage plugin enforcement in addition to existing tool-stage enforcement.
- Updated README, NPM package README, focused docs, and generated DOCX/PDF guide to lead with the single-command wizard, diagnostics, current date, and release version `0.2.0`.
- Fixed Windows smoke-test imports and added decision tests for legacy tool-only behavior plus prompt/response stage blocking.

## Verification

- `npm run check`: PASS
- `npm run test:plugin-decisions`: PASS
- `npm run smoke:plugin-hook`: PASS
- `npm run validate:fail-modes`: PASS
- `npm run pack:plugin`: PASS, dry-run tarball `openclaw-radware-agentic-protection-0.2.0.tgz`
- Targeted setup-failure diagnostic test: PASS, failure log created and fake key redacted.
- Targeted out-of-path runtime diagnostic test: PASS, JSONL log created for invalid Radware response shape, fake key and tool payload body redacted.
- Refreshed PDF guide: 7 pages, text extraction confirms new wizard, current date, package version `0.2.0`, diagnostics, and `npm:` commands; PyMuPDF render smoke produced nonblank pages.

## Follow-Up

- Verify the out-of-path blocked-topic behavior in the Radware portal. The prompt-stage API call allowed the medical/medicine topic while in-path blocked it. This may be policy/stage behavior, but should be confirmed before publishing.
- Confirm the Radware in-path provider path for Gemini before documenting Gemini in-path as supported. Direct Gemini is OpenAI-compatible, but the tested Radware Gemini in-path paths failed or routed to OpenAI.
- Create and test an NVIDIA/Nemotron Radware in-path deployment before documenting NVIDIA in-path as supported.
- Publish `0.2.0` to NPM and deprecate older versions after authenticating to the NPM registry. Push the repository and tag `v0.2.0`. Do not reuse `0.1.5`.
