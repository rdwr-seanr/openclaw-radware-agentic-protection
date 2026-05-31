# Out-Of-Path OpenClaw Integration

Out-of-path protection keeps the customer's normal OpenClaw LLM provider and adds explicit Radware checks from OpenClaw lifecycle hooks. The included plugin enforces before tool execution; the same explicit API pattern can also be wired to prompt/response stages if the OpenClaw environment exposes suitable hooks.

Assumption: OpenClaw is already installed, onboarded, and has an existing `openclaw.json`. Run setup commands as the same OS user that runs the OpenClaw gateway.

## Required Credentials

- `RADWARE_OUT_OF_PATH_API_KEY`: Radware out-of-path API key.
- `RADWARE_OUT_OF_PATH_URL`: Radware agentic API endpoint.
- Customer LLM provider credentials, such as `OPENAI_API_KEY`, remain required for the normal OpenClaw model provider.

## Install

```bash
openclaw plugins install openclaw-radware-agentic-protection
```

## Configure

```bash
export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"
export OPENAI_API_KEY="sk-..."
export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
```

Use the setup helper:

```bash
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --out-of-path --dry-run
npx -p openclaw-radware-agentic-protection radware-openclaw-setup --out-of-path
```

If OpenClaw uses a custom config path, add `--config /path/to/openclaw.json`.

The setup helper edits only the Radware plugin entry and preserves existing OpenClaw channels, agents, tools, and model providers.

## What The Plugin Sends

Before tool execution, the included plugin sends:

- `UserPrompt`: accumulated trusted user intent.
- `UserIdentifier`: mode-specific portal identity, default `openclaw-out-of-path`.
- `UserContext`: accumulated tool outputs and relevant conversation context.
- `ToolName`: proposed OpenClaw tool.
- `ArgsInput`: proposed tool arguments, unless `includeArgs=false`.
- `ToolsInput`: inferred tool schema.
- `ApiKey`: Radware out-of-path API key from the configured environment variable.
- `ModelToUse`: model captured from OpenClaw or `LLM_MODEL`.

## Policy Modes

The connector follows Radware's portal decision:

- Block and Report returns `IsBlocked: true`; the plugin blocks.
- Report Only returns `IsBlocked: false`; the plugin allows.

Local `failMode` controls only Radware API unavailability:

- `fail-close`: block/pause the tool if Radware cannot be reached.
- `fail-open`: allow the tool and rely on audit/logging if Radware cannot be reached.
