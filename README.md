# OpenClaw + Radware Agentic AI Protection

This repository provides a production-oriented OpenClaw integration for Radware Agentic AI Protection.

For customer deployment, use the NPM package. GitHub is for source review, detailed documentation, and advanced validation assets.

Current customer release: `@radware/openclaw-radware-agentic-protection@0.2.2`. In install commands, `@latest` resolves to the current customer release.

It supports two deployment options. Choose exactly one option for a given OpenClaw deployment:

- In-path / inline protection: route OpenClaw provider traffic through Radware's OpenAI-compatible proxy, including prompt, response, and tool-call context when OpenClaw sends that context through the provider request.
- Out-of-path protection: call Radware explicitly from OpenClaw lifecycle hooks. New setup-generated configs enable prompt, response, and tool-stage checks while preserving the customer's existing LLM provider.

Each deployment type can support AI Guardrails and Behavioral / Agentic Protection when the relevant prompt, response, tool, and context payloads are sent to Radware. Do not configure in-path and out-of-path together in the same OpenClaw deployment. To evaluate the two approaches, test them in separate OpenClaw environments or separate change windows.

## Credential Model

| Control | Radware key | Customer LLM key |
| --- | --- | --- |
| In-path | Required. Use the Radware in-path API key as the OpenClaw model-provider API key. | Not used by the Radware in-path provider entry. |
| Out-of-path | Required. Use the Radware out-of-path API key for explicit Radware checks. | Not collected or changed by this package. The customer's existing OpenClaw LLM provider keeps using its own key and endpoint. |

Do not store keys in `openclaw.json`, Git, screenshots, validation reports, or logs. Use runtime environment variables, a secret manager, or the setup-generated chmod `600` env file.

## One-Command Customer Setup

Assumption: OpenClaw is already installed, onboarded, and has a valid `openclaw.json`.

Run all commands as the same OS user that owns the OpenClaw config and runs the OpenClaw gateway. If OpenClaw uses a custom config path, pass `--config /path/to/openclaw.json`.

Run the setup wizard:

```bash
npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup
```

The wizard asks for the deployment type, Radware API key, Radware endpoint, model, OpenClaw config path, runtime env-file path, and whether to apply or dry-run. For out-of-path, it also asks for the portal user identifier, fail-open/fail-close behavior, and whether to install the OpenClaw plugin.

The wizard pre-fills Radware endpoints, writes a backup of `openclaw.json`, and writes runtime variables to an env file with `0600` permissions. For out-of-path, plugin installation uses the deterministic OpenClaw source spec `npm:@radware/openclaw-radware-agentic-protection@latest`. It does not ask for the customer's LLM provider API key in out-of-path mode because that provider should already be configured in OpenClaw.

If setup fails, the helper prints a short failure summary and writes a sanitized diagnostic log under the OpenClaw config directory, usually `~/.openclaw/logs/radware-openclaw-setup-<timestamp>.log`. The log includes versions, selected mode, config path, actions attempted, plugin-install output, and the error stack. It redacts API-key-looking values and does not include request payloads.

Load the generated env file before starting OpenClaw:

```bash
set -a
. ~/.openclaw/radware.env
set +a
openclaw gateway run --force
```

## Advanced Non-Interactive Setup

Use these commands for automation or formal change control. The wizard above is the recommended customer path.

Before applying a non-interactive setup, export the relevant Radware values in the shell or service environment. The setup helper writes references to environment variables in `openclaw.json`; it never writes raw secrets there.

### In-Path Only

Set the Radware in-path values first:

```bash
export RADWARE_INPATH_API_KEY="sk-rdwr-..."
export RADWARE_INPATH_BASE_URL="https://api.agentic.radwarecto.com/v1/openai"
export LLM_MODEL="gpt-4o"
```

```bash
npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model \
  --runtime-env-file ~/.openclaw/radware.env \
  --dry-run

npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model \
  --runtime-env-file ~/.openclaw/radware.env
```

For a custom Radware provider path confirmed in the portal:

```bash
npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --in-path-provider custom \
  --in-path-endpoint /v1/<provider-path> \
  --set-default-model \
  --runtime-env-file ~/.openclaw/radware.env
```

Restart OpenClaw with the env file loaded.

`openclaw gateway run --force` is a foreground server process. Seeing `gateway] ready` means the gateway started successfully; the command is expected to keep running until stopped.

### Out-Of-Path Only

Set the Radware out-of-path values first. Keep the customer's normal LLM provider key in the existing OpenClaw provider configuration.

```bash
export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"
export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
```

```bash
openclaw plugins install npm:@radware/openclaw-radware-agentic-protection@latest

npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --runtime-env-file ~/.openclaw/radware.env \
  --dry-run

npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --runtime-env-file ~/.openclaw/radware.env
```

Restart OpenClaw with the env file loaded, then inspect:

```bash
openclaw plugins inspect radware-agentic --runtime --json
```

`openclaw gateway run --force` is a foreground server process. Seeing `gateway] ready` means the gateway started successfully; the command is expected to keep running until stopped.

Out-of-path does not route model traffic through Radware and does not configure the customer's LLM endpoint. The plugin sends `ModelToUse` to Radware as context for the check; the customer's existing OpenClaw provider remains responsible for calling the configured LLM endpoint.

## Provider Endpoint Notes

In-path uses a Radware proxy endpoint that must match the provider configured in the Radware portal:

```bash
RADWARE_INPATH_BASE_URL="https://api.agentic.radwarecto.com/v1/<provider-path>"
```

Validated in-path preset:

- OpenAI: `https://api.agentic.radwarecto.com/v1/openai`

For any other provider, choose `custom` in the setup wizard and enter the Radware provider path confirmed in the Radware portal. The helper accepts a full Radware URL, a path such as `/v1/<provider-path>`, or a short provider path such as `<provider-path>` and normalizes path inputs under `https://api.agentic.radwarecto.com`.

Do not use the direct LLM provider base URL as `RADWARE_INPATH_BASE_URL`. In-path must use a Radware proxy endpoint.

## Portal Decision Modes

The out-of-path plugin uses `enforcementMode: "portal-decision"`:

- Block and Report: Radware returns `IsBlocked: true`; the plugin blocks the protected stage.
- Report Only: Radware returns `IsBlocked: false`; the plugin allows the protected stage.

Local `failMode` applies only when Radware is unavailable or returns an invalid response:

- `fail-close`: block/pause the protected stage when Radware cannot be reached.
- `fail-open`: allow the protected stage when Radware cannot be reached and rely on audit/logging.

In-path is fail-close by default because model traffic goes only through Radware. In-path fail-open requires an explicit customer fallback wrapper that retries the direct LLM provider only for connectivity failures, never for Radware policy blocks.

## Diagnostics And Logs

The setup helper keeps logs short on screen and detailed on disk:

- Setup failure log: `~/.openclaw/logs/radware-openclaw-setup-<timestamp>.log`.
- Optional explicit setup log: add `--log-file /path/to/radware-openclaw-setup.log`.
- Out-of-path runtime log: when using the generated env file, runtime diagnostics are written to `~/.openclaw/logs/radware-agentic-runtime.jsonl`.
- Gateway log: capture the OpenClaw gateway output through the customer's service manager, or run `openclaw gateway run --force 2>&1 | tee ~/.openclaw/logs/openclaw-gateway.log` during validation.

Runtime diagnostics are sanitized. They include stage, endpoint host/path, model identifier, payload sizes, HTTP status, Event ID when present, and fail-open/fail-close decision. They do not include API keys, full prompts, tool arguments, or full model/provider payloads.

## Customer Validation

Validate through the customer's existing OpenClaw channel or a staging agent. Do not run destructive actions against production tools.

Minimum checks:

- Benign prompt: should be allowed.
- AI Guardrails credit-card PII: should follow portal policy.
- HAPBlocker: should follow portal policy.
- Blocked medical/medicine topic: should follow portal policy.
- Behavioral tool/action attempt: use a low-risk test tool action.

Recommended flow:

1. Start the OpenClaw gateway and wait for `gateway] ready`.
2. Send a benign prompt through the customer's normal OpenClaw channel or Control UI.
3. Send the AI Guardrails prompts through the same channel and verify Radware portal events.
4. For out-of-path Behavioral validation, trigger a real low-risk tool action.
5. For in-path Behavioral validation, make sure the provider request includes tool/action context. A normal chat prompt may only validate AI Guardrails.

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
- [Package version policy](docs/package-version-policy.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Scoped NPM migration report](reports/2026-06-30-scoped-npm-migration.md)

## Security Notes

- Commit `.env.example`, never `.env`.
- Do not log or publish full API keys, provider tokens, SSH credentials, or secret-bearing request payloads.
- Keep `RADWARE_FAIL_MODE=fail-close` for production agents that can send, write, delete, or make network calls unless the customer explicitly accepts fail-open risk.
