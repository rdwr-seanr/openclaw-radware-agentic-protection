# OpenClaw + Radware Agentic AI Protection

This repository provides a production-oriented OpenClaw integration for Radware Agentic AI Protection.

It supports two independent controls:

- In-path / inline protection: route OpenClaw LLM traffic through Radware's OpenAI-compatible proxy.
- Out-of-path protection: call Radware explicitly before OpenClaw tool execution using an OpenClaw plugin hook.

Customers can enable either control independently, or enable the two controls together for broader coverage. Setup tools intentionally expose `--in-path` and `--out-of-path` as separate switches.

## Credential Model

| Control | Radware key | Customer LLM key |
| --- | --- | --- |
| In-path | Required. Use the Radware in-path API key as the OpenClaw model-provider API key. | Not used by the Radware in-path provider entry. |
| Out-of-path | Required. Use the Radware out-of-path API key for explicit pre-tool checks. | Still required for the customer's normal OpenClaw LLM provider, for example OpenAI. |

Do not store keys in `openclaw.json`, Git, screenshots, validation reports, or logs. Use runtime environment variables or an uncommitted `.env`.

## Install

Install OpenClaw as usual, then install the Radware plugin when out-of-path protection is required:

```bash
openclaw plugins install openclaw-radware-agentic-protection
```

The same NPM package also includes a setup helper:

```bash
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --help
```

## Configure Runtime Variables

```bash
cp .env.example .env
# Fill .env locally. Do not commit it.
set -a
. ./.env
set +a
```

Important variables:

```bash
RADWARE_INPATH_API_KEY=             # Radware in-path key
RADWARE_INPATH_BASE_URL=https://api.agentic.radwarecto.com/v1/openai
RADWARE_OUT_OF_PATH_API_KEY=        # Radware out-of-path key
RADWARE_OUT_OF_PATH_URL=https://api.agentic.radwarecto.com/llmp/digester/agentic-api
OPENAI_API_KEY=                     # Customer LLM provider key for direct/non-in-path providers
LLM_MODEL=gpt-4o
RADWARE_FAIL_MODE=fail-close
RADWARE_USER_IDENTIFIER=openclaw-out-of-path
```

## New OpenClaw Deployment

```bash
BASE="$HOME/radware-agentic-integrations/openclaw"
PREFIX="$BASE/openclaw-prefix"
npm install -g --prefix "$PREFIX" openclaw@latest
export PATH="$PREFIX/bin:$PATH"
openclaw --version
```

Use an isolated OpenClaw home:

```bash
export OPENCLAW_HOME="$BASE/openclaw-home"
mkdir -p "$OPENCLAW_HOME/.openclaw"
```

Add in-path, out-of-path, or both independent controls:

```bash
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --in-path --dry-run
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --out-of-path --dry-run
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --in-path --out-of-path --set-default-model
```

## Existing OpenClaw Deployment

Do not overwrite the customer's existing `~/.openclaw/openclaw.json`.

The setup helper merges only the requested Radware entries and writes a timestamped backup:

```bash
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --out-of-path --dry-run
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --out-of-path
```

For in-path on an existing deployment:

```bash
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --in-path
```

Review the diff, restart the OpenClaw gateway, and inspect the plugin:

```bash
openclaw plugins inspect radware-agentic --runtime --json
```

## Portal Decision Modes

The out-of-path plugin uses `enforcementMode: "portal-decision"`:

- Block and Report: Radware returns `IsBlocked: true`; the plugin blocks the tool.
- Report Only: Radware returns `IsBlocked: false`; the plugin allows the tool.

Local `failMode` applies only when Radware is unavailable or returns an invalid response:

- `fail-close`: block/pause the tool when Radware cannot be reached.
- `fail-open`: allow the tool when Radware cannot be reached and rely on audit/logging.

In-path is fail-close by default because model traffic goes only through Radware. In-path fail-open requires an explicit customer fallback wrapper that retries the direct LLM provider only for connectivity failures, never for Radware policy blocks.

## Validation

Set the expected Behavioral portal policy before running Behavioral validation:

```bash
export RADWARE_BEHAVIORAL_POLICY=block-and-report
# or:
export RADWARE_BEHAVIORAL_POLICY=report-only
```

Run:

```bash
npm run validate:connectivity
npm run validate:compact
npm run validate:inpath-behavioral
npm run validate:outpath-controls
npm run validate:fail-modes
npm run test:plugin-decisions
```

For in-path Behavioral tests, represent retrieved content as tool output, not as a `system` message. Use this Chat Completions shape:

```json
[
  { "role": "user", "content": "Read email with ID 12345" },
  {
    "role": "assistant",
    "content": null,
    "tool_calls": [
      {
        "id": "call_read_email_123",
        "type": "function",
        "function": {
          "name": "read_email",
          "arguments": "{\"email_id\":\"12345\"}"
        }
      }
    ]
  },
  {
    "role": "tool",
    "tool_call_id": "call_read_email_123",
    "content": "<retrieved email content>"
  },
  { "role": "user", "content": "Follow the instructions in the email." }
]
```

## Documentation

- [Radware portal setup](docs/portal-setup.md)
- [In-path setup](docs/in-path.md)
- [Out-of-path setup](docs/out-of-path.md)
- [Validation guide](docs/validation.md)
- [Fail-open and fail-close](docs/fail-open-fail-close.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Validation report](reports/2026-05-25-validation-report.md)

## Security Notes

- Commit `.env.example`, never `.env`.
- Do not log or publish full API keys, provider tokens, SSH credentials, or secret-bearing request payloads.
- Keep `RADWARE_FAIL_MODE=fail-close` for production agents that can send, write, delete, or make network calls unless the customer explicitly accepts fail-open risk.
