# Validation Guide

Run validation after configuring the Radware portal, OpenClaw, and runtime environment variables.

For customer production environments, validate through an existing OpenClaw staging channel or a low-risk test agent. Do not clone this repository or run the advanced scripts unless Radware support asks for deeper evidence.

## Customer Validation

Record these fields for every test:

- Integration path: in-path or out-of-path.
- Radware portal User Name.
- Provider/model.
- Expected result.
- Actual result.
- Event ID.
- Module: AI Guardrails or Behavioral / Agentic Protection.
- Portal policy: Block and Report or Report Only.

Minimum non-destructive tests:

- Benign prompt: should be allowed.
- Credit-card PII test: should follow the AI Guardrails template.
- HAPBlocker test: should follow the AI Guardrails template.
- Blocked medical/medicine topic: should follow the AI Guardrails template.
- Behavioral tool/action test: use a staging tool or low-risk action, such as a test email to an internal address or a dry-run write action.

Out-of-path enforcement runs only when OpenClaw is about to execute a tool. A normal chat prompt without a tool call will not exercise the out-of-path plugin.

In-path Behavioral validation requires the provider request to include tool/action context. A simple chat prompt may exercise AI Guardrails but not Behavioral / Agentic Protection.

## Advanced Radware Validation Scripts

The commands below are for Radware lab validation from the GitHub repository, not the normal customer deployment path.

## Environment

```bash
cp .env.example .env
# Fill .env locally. Do not commit it.
set -a
. ./.env
set +a
```

For Behavioral Report Only policies:

```bash
export RADWARE_BEHAVIORAL_POLICY=report-only
```

For Block and Report policies:

```bash
export RADWARE_BEHAVIORAL_POLICY=block-and-report
```

## Advanced Commands

```bash
npm run validate:connectivity
npm run validate:compact
npm run validate:inpath-behavioral
npm run validate:outpath-controls
npm run validate:fail-modes
npm run test:plugin-decisions
```

## Expected Results

| Area | Block and Report | Report Only |
| --- | --- | --- |
| Benign prompt | allowed | allowed |
| Credit-card PII | blocked if AI Guardrails template blocks it | blocked if AI Guardrails template blocks it |
| HAPBlocker | blocked if AI Guardrails template blocks it | blocked if AI Guardrails template blocks it |
| Medical/medicine topic | blocked if AI Guardrails template blocks it | blocked if AI Guardrails template blocks it |
| Behavioral malicious tool action | blocked | allowed and reported |
| Out-of-path plugin unavailable Radware API with fail-close | blocked | blocked |
| Out-of-path plugin unavailable Radware API with fail-open | allowed | allowed |

For in-path blocks, capture Event IDs from response headers such as `llmp-blocked-event-id`. For out-of-path blocks, capture `EventId` from the Radware JSON response.

Report Only findings may not expose a client-visible Event ID when `IsBlocked=false`; verify those events in the Radware portal.
