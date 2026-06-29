# Out-Of-Path OpenClaw Integration

Out-of-path protection keeps the customer's normal OpenClaw LLM provider and adds explicit Radware checks from OpenClaw lifecycle hooks. New setup-generated configs enable prompt-stage, response-stage, and tool-stage checks. Existing configs that do not define `config.stages` remain tool-stage only until upgraded intentionally.

Assumption: OpenClaw is already installed, onboarded, and has an existing `openclaw.json`. Run setup commands as the same OS user that runs the OpenClaw gateway.

## Required Credentials

- `RADWARE_OUT_OF_PATH_API_KEY`: Radware out-of-path API key.
- `RADWARE_OUT_OF_PATH_URL`: Radware agentic API endpoint.
- Customer LLM provider credentials remain part of the customer's existing OpenClaw model provider. This package does not ask for, store, or change those keys.

## Install

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup
```

Choose `out-of-path` when prompted. The wizard can install the OpenClaw plugin, write a backup of `openclaw.json`, and write runtime variables to a chmod `600` env file.

For manual plugin installation, use the deterministic NPM source spec:

```bash
openclaw plugins install npm:openclaw-radware-agentic-protection@latest
```

## Configure

```bash
export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"
export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
export RADWARE_AGENTIC_DIAGNOSTIC_LOG="$HOME/.openclaw/logs/radware-agentic-runtime.jsonl"
```

Use the setup helper:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --out-of-path --dry-run
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --out-of-path --runtime-env-file ~/.openclaw/radware.env
```

If OpenClaw uses a custom config path, add `--config /path/to/openclaw.json`.

The setup helper edits only the Radware plugin entry and preserves existing OpenClaw channels, agents, tools, and model providers.

Out-of-path does not proxy or replace the LLM call. OpenClaw continues to call the customer's configured model provider, such as OpenAI, Gemini, NVIDIA, or another OpenAI-compatible endpoint. The plugin only sends the model identifier to Radware as `ModelToUse` so the Radware event has model context.

Examples of direct OpenAI-compatible provider endpoints that customers may already have configured:

| Provider | Base URL | Example model |
| --- | --- | --- |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| NVIDIA NIM / Nemotron | `https://integrate.api.nvidia.com/v1` | `nvidia/nemotron-3-nano-30b-a3b` |

## What The Plugin Sends

At protected stages, the plugin sends the Radware out-of-path API fields relevant to that stage:

- `UserPrompt`: accumulated trusted user intent.
- `UserIdentifier`: mode-specific portal identity, default `openclaw-out-of-path`.
- `UserContext`: accumulated tool outputs and relevant conversation context.
- `ToolName`: proposed OpenClaw tool for tool-stage checks.
- `ArgsInput`: proposed tool arguments for tool-stage checks, unless `includeArgs=false`.
- `ToolsInput`: inferred tool schema.
- `ApiKey`: Radware out-of-path API key from the configured environment variable.
- `ModelToUse`: model captured from OpenClaw or `LLM_MODEL`.

New setup-generated configs include:

```json
"stages": {
  "prompt": true,
  "response": true,
  "tool": true
},
"diagnostics": {
  "level": "error",
  "logFileEnv": "RADWARE_AGENTIC_DIAGNOSTIC_LOG"
}
```

Legacy configs without `stages` are treated as:

```json
"stages": {
  "prompt": false,
  "response": false,
  "tool": true
}
```

## Policy Modes

The connector follows Radware's portal decision:

- Block and Report returns `IsBlocked: true`; the plugin blocks.
- Report Only returns `IsBlocked: false`; the plugin allows.

Local `failMode` controls only Radware API unavailability:

- `fail-close`: block/pause the protected stage if Radware cannot be reached.
- `fail-open`: allow the protected stage and rely on audit/logging if Radware cannot be reached.

## Diagnostics

When the generated env file is loaded, the plugin writes sanitized runtime diagnostics to:

```bash
~/.openclaw/logs/radware-agentic-runtime.jsonl
```

The log captures runtime integration failures such as missing API key env vars, Radware timeouts, non-success HTTP statuses, and invalid Radware response shapes. Records include stage, endpoint host/path, model identifier, payload sizes, HTTP status, Event ID when present, and the fail-open/fail-close decision. They do not include API keys, full prompts, tool arguments, or full payload bodies.

For support, also capture gateway output during validation:

```bash
openclaw gateway run --force 2>&1 | tee ~/.openclaw/logs/openclaw-gateway.log
```
