# Radware Agentic AI Protection for OpenClaw

OpenClaw integration package for Radware Agentic AI Protection.

Use this package when OpenClaw is already installed and running. The package does not install or onboard OpenClaw.

## What This Package Provides

- **Out-of-path enforcement plugin**: registers OpenClaw lifecycle hooks and calls Radware before tool execution.
- **In-path setup helper**: adds a Radware OpenAI-compatible model provider to an existing OpenClaw config.
- **Production-safe config merge**: updates the existing OpenClaw config, writes a backup, and stores no secrets in `openclaw.json`.
- **Portal-controlled policy**: Block and Report blocks, Report Only reports and allows.
- **Local fail behavior**: `fail-close` or `fail-open` for Radware API availability failures in out-of-path mode.

## Before You Start

Run the commands as the same OS user that owns the OpenClaw config and runs the OpenClaw gateway.

Confirm the config exists and is already onboarded:

```bash
test -f "${OPENCLAW_HOME:-$HOME}/.openclaw/openclaw.json" && echo "OpenClaw config found"
```

If OpenClaw uses a custom config path, pass it with `--config /path/to/openclaw.json`.

Set runtime secrets through your shell, systemd `EnvironmentFile`, Kubernetes Secret, or secret manager. Do not write real keys into `openclaw.json`.

```bash
export RADWARE_INPATH_API_KEY="sk-rdwr-..."
export RADWARE_INPATH_BASE_URL="https://api.agentic.radwarecto.com/v1/openai"

export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"

export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
```

Out-of-path deployments also require the customer's normal LLM provider credentials, such as `OPENAI_API_KEY`, because Radware does not replace the LLM provider in out-of-path mode.

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

## Choose One Integration Path

Choose exactly one integration path for a given OpenClaw deployment. Do not configure in-path and out-of-path together in the same OpenClaw deployment. To evaluate the two approaches, use separate OpenClaw environments or separate change windows.

### Option A: In-Path Only

Use in-path when Radware should sit inline on OpenClaw provider traffic.

Dry-run the change:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model \
  --dry-run
```

Apply the change:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --in-path \
  --set-default-model
```

This adds a provider named `radware-openai` that uses:

- `apiKey`: `${RADWARE_INPATH_API_KEY}`
- `baseUrl`: `${RADWARE_INPATH_BASE_URL}`
- model: `${LLM_MODEL}` or `gpt-4o`

The customer OpenAI API key is not used by this in-path provider entry.

Restart the OpenClaw gateway with the environment variables loaded.

`openclaw gateway --force` is a foreground server process. Seeing `gateway] ready` means the gateway started successfully; the command is expected to keep running until stopped. Run it in the customer's normal service manager, terminal multiplexer, or a dedicated shell.

### Option B: Out-Of-Path Only

Use out-of-path when the customer wants to keep the existing OpenClaw LLM provider and have Radware check tool actions before execution.

Install the plugin:

```bash
openclaw plugins install openclaw-radware-agentic-protection@latest
```

Dry-run the config merge:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --dry-run
```

Apply the config merge:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path
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
          "enforcementMode": "portal-decision"
        }
      }
    }
  }
}
```

Restart the OpenClaw gateway with the environment variables loaded.

`openclaw gateway --force` is a foreground server process. Seeing `gateway] ready` means the gateway started successfully; the command is expected to keep running until stopped. Run it in the customer's normal service manager, terminal multiplexer, or a dedicated shell.

Inspect the plugin:

```bash
openclaw plugins inspect radware-agentic --runtime --json
```

## Manual Change-Control Installation

For production environments that require manual review:

1. Run the relevant `--dry-run` command.
2. Review the generated JSON.
3. Merge the generated provider or plugin entry into the existing `openclaw.json`.
4. Keep all secrets in environment variables.
5. Restart OpenClaw through the customer's normal process.

## Portal Policy Semantics

`enforcementMode: "portal-decision"` means the Radware portal controls the decision:

- **Block and Report**: Radware returns `IsBlocked: true`; the plugin blocks the tool call.
- **Report Only**: Radware returns `IsBlocked: false`; the plugin allows the tool call and the portal records the event.

`failMode` applies only when Radware is unavailable or returns an invalid response:

- `fail-close`: block/pause the tool action if Radware cannot be reached.
- `fail-open`: allow the tool action if Radware cannot be reached.

Policy blocks are never bypassed by `fail-open`.

## Non-Destructive Validation

Validate from an OpenClaw staging channel or a low-risk test agent.

Minimum checks:

- Benign prompt: should be allowed.
- AI Guardrails credit-card PII test: should follow the portal policy.
- HAPBlocker test: should follow the portal policy.
- Blocked medical/medicine topic: should follow the portal policy.
- Behavioral tool/action test: use an existing low-risk tool, such as a test email or dry-run write action. Out-of-path enforcement only runs when OpenClaw is about to execute a tool.

Recommended flow:

1. Start the OpenClaw gateway and wait for `gateway] ready`.
2. Send a benign prompt through the customer's normal OpenClaw channel or Control UI.
3. Send the AI Guardrails prompts through the same channel and verify Radware portal events.
4. For out-of-path Behavioral validation, trigger a real low-risk tool action. A chat-only prompt will not call the plugin.
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
npx -p openclaw-radware-agentic-protection radware-openclaw-setup \
  --out-of-path \
  --config /path/to/openclaw.json \
  --dry-run
```

### Setup Fails With Missing `gateway.mode`

The helper expects an already onboarded OpenClaw config. This usually means the wrong OS user or config path was used, or OpenClaw was not onboarded yet.

For a lab-only fresh install, onboard OpenClaw first, then rerun the helper.

### Out-Of-Path Does Not Generate Events

Out-of-path enforcement runs before tool execution. If the OpenClaw workflow only chats with the LLM and does not call a tool, the plugin has nothing to enforce.

### Gateway Looks Stuck After Start

`openclaw gateway --force` starts the gateway in the foreground. It is healthy when the log shows `gateway] ready`; leave it running in that terminal, run it under the customer's service manager, or stop it with `Ctrl+C`.

### In-Path Does Not Show Expected Behavioral Result

For Behavioral validation, the provider request must include tool/action context. A normal chat prompt without a tool/action context may only exercise AI Guardrails.
