# Radware Agentic AI Protection for OpenClaw

OpenClaw integration package for Radware Agentic AI Protection.

Use this package when OpenClaw is already installed and running. The package does not install or onboard OpenClaw.

Current customer release: `openclaw-radware-agentic-protection@0.2.0`. In install commands, `@latest` resolves to the current customer release.

## What This Package Provides

- **Out-of-path enforcement plugin**: registers OpenClaw lifecycle hooks and calls Radware for prompt, response, and tool-stage checks in new setup-generated configs.
- **In-path setup helper**: adds a Radware OpenAI-compatible model provider to an existing OpenClaw config.
- **Production-safe config merge**: updates the existing OpenClaw config, writes a backup, and stores no secrets in `openclaw.json`.
- **Portal-controlled policy**: Block and Report blocks, Report Only reports and allows.
- **Local fail behavior**: `fail-close` or `fail-open` for Radware API availability failures in out-of-path mode.
- **Sanitized diagnostics**: setup failures write a detailed support log, and out-of-path runtime failures can write JSONL diagnostics without storing secrets or full payloads.

## Before You Start

Run the commands as the same OS user that owns the OpenClaw config and runs the OpenClaw gateway.

Confirm the config exists and is already onboarded:

```bash
test -f "${OPENCLAW_HOME:-$HOME}/.openclaw/openclaw.json" && echo "OpenClaw config found"
```

If OpenClaw uses a custom config path, pass it with `--config /path/to/openclaw.json`.

The setup wizard can write runtime secrets to a chmod `600` env file. Do not write real keys into `openclaw.json`.

Out-of-path deployments keep the customer's existing OpenClaw LLM provider. This package does not ask for, store, or change the customer's LLM provider API key.

## Easy Setup

Choose exactly one integration path for a given OpenClaw deployment. Do not configure in-path and out-of-path together in the same OpenClaw deployment. To evaluate the two approaches, use separate OpenClaw environments or separate change windows.

Run the wizard as the same OS user that runs OpenClaw:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup
```

The wizard asks for:

- Deployment type: in-path or out-of-path.
- Radware API key and endpoint. The default endpoints are prefilled.
- Model, OpenClaw config path, and runtime env-file path.
- Out-of-path only: portal user identifier and fail-open/fail-close. The customer's existing OpenClaw LLM provider is left unchanged.
- Whether to apply immediately or only print the dry-run config.

The wizard updates `openclaw.json`, writes a backup, writes the env file with `0600` permissions, and for out-of-path can install the plugin with:

```bash
openclaw plugins install npm:openclaw-radware-agentic-protection@latest
```

If setup fails, the helper prints the reason, suggested next checks, and the path to a sanitized diagnostic log. The default failure-log location is:

```bash
~/.openclaw/logs/radware-openclaw-setup-<timestamp>.log
```

To always write a setup diagnostic log even when setup succeeds, add:

```bash
--log-file ~/.openclaw/logs/radware-openclaw-setup.log
```

Load the generated env file before starting OpenClaw:

```bash
set -a
. ~/.openclaw/radware.env
set +a
openclaw gateway run --force
```

`openclaw gateway run --force` is a foreground server process. Seeing `gateway] ready` means the gateway started successfully; the command is expected to keep running until stopped. Run it in the customer's normal service manager, terminal multiplexer, or a dedicated shell.

## Advanced Setup

Use this section for automation or formal change control. The interactive wizard above is the recommended customer path.

Before applying a non-interactive setup, export the relevant Radware values in the shell or service environment. The setup helper writes references to environment variables in `openclaw.json`; it never writes raw secrets there.

### Option A: In-Path Only

Use in-path when Radware should sit inline on OpenClaw provider traffic.

Set the Radware in-path values first:

```bash
export RADWARE_INPATH_API_KEY="sk-rdwr-..."
export RADWARE_INPATH_BASE_URL="https://api.agentic.radwarecto.com/v1/openai"
export LLM_MODEL="gpt-4o"
```

Dry-run the change:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model \
  --runtime-env-file ~/.openclaw/radware.env \
  --dry-run
```

Apply the change:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model \
  --runtime-env-file ~/.openclaw/radware.env
```

For a custom Radware provider path confirmed in the portal:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --in-path-provider custom \
  --in-path-endpoint /v1/<provider-path> \
  --set-default-model \
  --runtime-env-file ~/.openclaw/radware.env
```

The OpenAI preset adds a provider named `radware-openai`. A custom in-path provider defaults to `radware-inpath` unless `--provider-name` is set. The provider uses:

- `apiKey`: `${RADWARE_INPATH_API_KEY}`
- `baseUrl`: `${RADWARE_INPATH_BASE_URL}`
- model: `${LLM_MODEL}` or `gpt-4o`

The customer's direct LLM provider key is not used by this in-path provider entry.

The Radware in-path base URL must match the provider configured in the Radware portal. OpenAI was validated with:

```bash
RADWARE_INPATH_BASE_URL="https://api.agentic.radwarecto.com/v1/openai"
```

For any other in-path provider, choose `custom` in the setup wizard and enter the Radware provider path confirmed in the Radware portal. The helper accepts a full Radware URL, a path such as `/v1/<provider-path>`, or a short provider path such as `<provider-path>` and normalizes path inputs under `https://api.agentic.radwarecto.com`.

Do not use the direct LLM provider base URL as `RADWARE_INPATH_BASE_URL`. In-path must use a Radware proxy endpoint.

Restart the OpenClaw gateway with the env file loaded.

### Option B: Out-Of-Path Only

Use out-of-path when the customer wants to keep the existing OpenClaw LLM provider and have Radware check prompt, response, and tool stages explicitly.

Out-of-path does not route model traffic through Radware. The plugin sends the model identifier to Radware as `ModelToUse` for context, while OpenClaw continues calling the customer's configured provider endpoint.

Set the Radware out-of-path values first. Keep the customer's normal LLM provider key in the existing OpenClaw provider configuration.

```bash
export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"
export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
```

Install the plugin:

```bash
openclaw plugins install npm:openclaw-radware-agentic-protection@latest
```

Dry-run the config merge:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --runtime-env-file ~/.openclaw/radware.env \
  --dry-run
```

Apply the config merge:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --runtime-env-file ~/.openclaw/radware.env
```

This adds:

```json
{
  "plugins": {
    "entries": {
      "radware-agentic": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true
        },
        "config": {
          "apiKeyEnv": "RADWARE_OUT_OF_PATH_API_KEY",
          "endpoint": "${RADWARE_OUT_OF_PATH_URL}",
          "model": "${LLM_MODEL}",
          "userIdentifier": "openclaw-out-of-path",
          "failMode": "fail-close",
          "enforcementMode": "portal-decision",
          "stages": {
            "prompt": true,
            "response": true,
            "tool": true
          },
          "diagnostics": {
            "level": "error",
            "logFileEnv": "RADWARE_AGENTIC_DIAGNOSTIC_LOG"
          }
        }
      }
    }
  }
}
```

Restart the OpenClaw gateway with the env file loaded.

Inspect the plugin:

```bash
openclaw plugins inspect radware-agentic --runtime --json
```

The customer's existing OpenClaw provider configuration owns the direct LLM endpoint and provider credential.

## Manual Change-Control Installation

For production environments that require manual review:

1. Run the relevant `--dry-run` command.
2. Review the generated JSON.
3. Merge the generated provider or plugin entry into the existing `openclaw.json`.
4. Keep all secrets in environment variables.
5. Restart OpenClaw through the customer's normal process.

Existing out-of-path configs without `config.stages` remain tool-stage only. Add `stages.prompt`, `stages.response`, and `stages.tool` intentionally when upgrading an existing deployment.

## Diagnostics And Support Logs

Setup logs and runtime logs are intentionally sanitized:

- Setup failure log: `~/.openclaw/logs/radware-openclaw-setup-<timestamp>.log`.
- Explicit setup log: pass `--log-file /path/to/radware-openclaw-setup.log`.
- Out-of-path runtime log: the generated env file sets `RADWARE_AGENTIC_DIAGNOSTIC_LOG=~/.openclaw/logs/radware-agentic-runtime.jsonl`.
- Gateway log: capture `openclaw gateway run --force` output through the customer's service manager, or during validation run `openclaw gateway run --force 2>&1 | tee ~/.openclaw/logs/openclaw-gateway.log`.

Runtime diagnostics include the protected stage, endpoint host/path, model identifier, payload sizes, HTTP status, Event ID when present, and fail-open/fail-close decision. They do not include API keys, full prompts, tool arguments, or full provider payloads.

Set `RADWARE_AGENTIC_DIAGNOSTIC_LEVEL=info` to include allow/block policy decisions. Keep the default `error` level in production unless Radware support asks for more detail.

## Portal Policy Semantics

`enforcementMode: "portal-decision"` means the Radware portal controls the decision:

- **Block and Report**: Radware returns `IsBlocked: true`; the plugin blocks the protected stage.
- **Report Only**: Radware returns `IsBlocked: false`; the plugin allows the protected stage and the portal records the event.

`failMode` applies only when Radware is unavailable or returns an invalid response:

- `fail-close`: block/pause the protected stage if Radware cannot be reached.
- `fail-open`: allow the protected stage if Radware cannot be reached.

Policy blocks are never bypassed by `fail-open`.

## Non-Destructive Validation

Validate from an OpenClaw staging channel or a low-risk test agent.

Minimum checks:

- Benign prompt: should be allowed.
- AI Guardrails credit-card PII test: should follow the portal policy.
- HAPBlocker test: should follow the portal policy.
- Blocked medical/medicine topic: should follow the portal policy.
- Behavioral tool/action test: use an existing low-risk tool, such as a test email or dry-run write action.

Recommended flow:

1. Start the OpenClaw gateway and wait for `gateway] ready`.
2. Send a benign prompt through the customer's normal OpenClaw channel or Control UI.
3. Send the AI Guardrails prompts through the same channel and verify Radware portal events.
4. For out-of-path Behavioral validation, trigger a real low-risk tool action. Prompt and response checks do not prove Behavioral tool-action enforcement by themselves.
5. For in-path Behavioral validation, make sure the provider request includes tool/action context. A normal chat prompt may only validate AI Guardrails.

For each event, record:

- OpenClaw integration path: in-path or out-of-path.
- Radware portal User Name.
- Model.
- Expected result.
- Actual result.
- Event ID.
- Module: AI Guardrails or Behavioral / Agentic Protection.

## Troubleshooting

### Setup Fails With Missing Config

Run the helper as the same user that runs OpenClaw, or pass the exact config path:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --config /path/to/openclaw.json \
  --dry-run
```

### Setup Fails With Missing `gateway.mode`

The helper expects an already onboarded OpenClaw config. This usually means the wrong OS user or config path was used, or OpenClaw was not onboarded yet.

For a lab-only fresh install, onboard OpenClaw first, then rerun the helper.

### Out-Of-Path Does Not Generate Events

Confirm which stages are enabled in `plugins.entries.radware-agentic.config.stages`. New setup-generated configs check prompt, response, and tool stages. Legacy configs without `stages` are tool-stage only, so chat-only prompts will not call Radware until the config is upgraded.

### Gateway Looks Stuck After Start

`openclaw gateway run --force` starts the gateway in the foreground. It is healthy when the log shows `gateway] ready`; leave it running in that terminal, run it under the customer's service manager, or stop it with `Ctrl+C`.

### In-Path Does Not Show Expected Behavioral Result

For Behavioral validation, the provider request must include tool/action context. A normal chat prompt without a tool/action context may only exercise AI Guardrails.
