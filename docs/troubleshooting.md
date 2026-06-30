# Troubleshooting

## Setup Helper Fails

The setup helper prints a concise error and writes a sanitized diagnostic log. The default failure-log location is:

```bash
~/.openclaw/logs/radware-openclaw-setup-<timestamp>.log
```

The log includes runtime versions, selected integration path, config path, actions attempted, plugin-install output, and error stack. It redacts API-key-looking values. Use `--log-file /path/to/log` to choose a specific setup log path.

## Runtime Diagnostics

For out-of-path deployments created by the setup helper, the generated env file sets:

```bash
RADWARE_AGENTIC_DIAGNOSTIC_LOG=~/.openclaw/logs/radware-agentic-runtime.jsonl
```

The runtime log captures missing API key env vars, Radware API timeouts, non-success HTTP statuses, invalid Radware response shapes, and fail-open/fail-close decisions. It does not include API keys, full prompts, tool arguments, or full request payloads.

Capture OpenClaw gateway output during validation with:

```bash
openclaw gateway run --force 2>&1 | tee ~/.openclaw/logs/openclaw-gateway.log
```

## In-Path Requests Fail Immediately

Check that the OpenClaw provider uses the Radware in-path API key and Radware in-path base URL. Do not use the customer's direct LLM provider key in the Radware in-path provider entry.

For OpenAI in-path, use the validated Radware endpoint:

```bash
https://api.agentic.radwarecto.com/v1/openai
```

For any non-OpenAI provider, do not guess the Radware `/v1/<provider>` path. Confirm the provider path in the Radware portal or with Radware support before using it in production docs. The direct LLM provider base URL is not valid as `RADWARE_INPATH_BASE_URL`.

## Setup Helper Says Config Is Missing

Run the helper as the same OS user that runs OpenClaw. If OpenClaw uses a custom home or config path, set `OPENCLAW_HOME` or pass `--config`:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup \
  --out-of-path \
  --config /path/to/openclaw.json \
  --dry-run
```

## Setup Helper Says `gateway.mode` Is Missing

The helper expects an existing, onboarded OpenClaw config. This usually means OpenClaw was not onboarded yet, the wrong OS user was used, or the wrong config path was selected.

For production, do not let the helper create a new OpenClaw config from scratch. Run it against the existing customer config.

If setup was run before OpenClaw onboarding and created a partial config, move the partial config aside, onboard OpenClaw, and rerun the latest setup helper:

```bash
mv ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bad-partial
openclaw onboard --mode local
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --help
```

## Out-Of-Path Checks Run But LLM Calls Fail

Out-of-path protection does not replace the LLM provider. Confirm the customer has configured their normal OpenClaw model provider, base URL, and provider API key. The Radware setup wizard does not ask for or manage that provider key.

## Report Only Still Allows The Tool

That is expected. Report Only should allow execution and record the finding in the Radware portal. Use Block and Report when enforcement should stop the action.

## Gateway Looks Stuck After Start

`openclaw gateway run --force` starts the gateway in the foreground. It is healthy when the log shows `gateway] ready`; leave it running in that terminal, run it under the customer's service manager, or stop it with `Ctrl+C`.

## Plugin Does Not Register Hooks

Run:

```bash
openclaw plugins inspect radware-agentic --runtime --json
```

Confirm:

- The plugin is enabled.
- `hooks.allowConversationAccess` is true.
- `before_agent_run` is listed for prompt-stage context/checks.
- `llm_output` is listed for response-stage context/checks.
- `before_tool_call` is listed.

Configs created before full-stage support may be tool-stage only. To enable all out-of-path stages, add:

```json
"stages": {
  "prompt": true,
  "response": true,
  "tool": true
}
```

## Behavioral In-Path Does Not Trigger

Provider refusals before tool emission are not Radware Behavioral blocks. Use a deterministic tool-call transcript for validation:

1. `user` asks to read a record.
2. `assistant` emits the read tool call.
3. `tool` returns the untrusted content.
4. `user` asks the agent to follow the retrieved instructions.

Do not put retrieved malicious content in a `system` message.

## Official OpenClaw Installer Needs Sudo

On a fresh Ubuntu server without Node.js or Git, the official OpenClaw installer may ask for sudo. In non-interactive SSH sessions, run it from a real terminal or install the prerequisites first:

```bash
sudo apt-get update
sudo apt-get install -y git
```

OpenClaw currently requires Node.js `>=22.19.0`; after installation, confirm `node --version`, `npm --version`, and `openclaw --version`.
