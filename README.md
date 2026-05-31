# OpenClaw + Radware Agentic AI Protection

This repository provides a production-oriented OpenClaw integration for Radware Agentic AI Protection.

For customer deployment, use the NPM package. GitHub is for source review, detailed documentation, and advanced validation assets.

It supports two deployment options. Choose exactly one option for a given OpenClaw deployment:

- In-path / inline protection: route OpenClaw provider traffic through Radware's OpenAI-compatible proxy, including prompt, response, and tool-call context when OpenClaw sends that context through the provider request.
- Out-of-path protection: call Radware explicitly from OpenClaw lifecycle hooks at the stages the customer chooses. The included plugin enforces before tool execution and preserves the customer's existing LLM provider.

Each deployment type can support AI Guardrails and Behavioral / Agentic Protection when the relevant prompt, response, tool, and context payloads are sent to Radware. Do not configure in-path and out-of-path together in the same OpenClaw deployment. To evaluate the two approaches, test them in separate OpenClaw environments or separate change windows.

## Credential Model

| Control | Radware key | Customer LLM key |
| --- | --- | --- |
| In-path | Required. Use the Radware in-path API key as the OpenClaw model-provider API key. | Not used by the Radware in-path provider entry. |
| Out-of-path | Required. Use the Radware out-of-path API key for explicit Radware checks. | Still required for the customer's normal OpenClaw LLM provider, for example OpenAI. |

Do not store keys in `openclaw.json`, Git, screenshots, validation reports, or logs. Use runtime environment variables or an uncommitted `.env`.

## Customer Deployment

Assumption: OpenClaw is already installed, onboarded, and has a valid `openclaw.json`.

Run all commands as the same OS user that owns the OpenClaw config and runs the OpenClaw gateway. If OpenClaw uses a custom config path, pass `--config /path/to/openclaw.json`.

Set runtime variables through the customer's normal secret mechanism. Do not put real keys in `openclaw.json`.

```bash
export RADWARE_INPATH_API_KEY="sk-rdwr-..."
export RADWARE_INPATH_BASE_URL="https://api.agentic.radwarecto.com/v1/openai"

export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"

export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
```

## Upgrade From 0.1.0

Version `0.1.1` and later are production-safe by default:

- The setup helper expects an existing onboarded OpenClaw config.
- The setup helper refuses `--in-path --out-of-path` and also refuses adding one Radware path to a config that already contains the other Radware path.
- The docs present in-path and out-of-path as mutually exclusive deployment options.

If you previously ran the `0.1.0` setup helper on a fresh server before OpenClaw onboarding, it may have created a partial `openclaw.json`. If OpenClaw reports `existing config is missing gateway.mode`, move that partial file aside and onboard OpenClaw first:

```bash
mv ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bad-partial
openclaw onboard --mode local
```

Then rerun setup with the latest package and choose exactly one path:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --in-path --set-default-model
```

or:

```bash
openclaw plugins install openclaw-radware-agentic-protection@latest
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --out-of-path
```

### In-Path Only

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model \
  --dry-run

npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model
```

Restart OpenClaw with the environment variables loaded.

### Out-Of-Path Only

```bash
openclaw plugins install openclaw-radware-agentic-protection@latest

npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --dry-run

npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path
```

Restart OpenClaw with the environment variables loaded, then inspect:

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

## Customer Validation

Validate through the customer's existing OpenClaw channel or a staging agent. Do not run destructive actions against production tools.

Minimum checks:

- Benign prompt: should be allowed.
- AI Guardrails credit-card PII: should follow portal policy.
- HAPBlocker: should follow portal policy.
- Blocked medical/medicine topic: should follow portal policy.
- Behavioral tool/action attempt: use a low-risk test tool action. Out-of-path enforcement only runs when OpenClaw is about to execute a tool.

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
