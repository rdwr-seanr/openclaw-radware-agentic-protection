# Validation Guide

Run validation after configuring the Radware portal, OpenClaw, and runtime environment variables.

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

## Commands

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
