# Troubleshooting

## In-Path Requests Fail Immediately

Check that the OpenClaw provider uses the Radware in-path API key and Radware in-path base URL. Do not use the customer's OpenAI API key in the Radware in-path provider entry.

## Setup Helper Says Config Is Missing

Run the helper as the same OS user that runs OpenClaw. If OpenClaw uses a custom home or config path, set `OPENCLAW_HOME` or pass `--config`:

```bash
npx -p openclaw-radware-agentic-protection radware-openclaw-setup \
  --out-of-path \
  --config /path/to/openclaw.json \
  --dry-run
```

## Setup Helper Says `gateway.mode` Is Missing

The helper expects an existing, onboarded OpenClaw config. This usually means OpenClaw was not onboarded yet, the wrong OS user was used, or the wrong config path was selected.

For production, do not let the helper create a new OpenClaw config from scratch. Run it against the existing customer config.

If this happened in a fresh lab after running version `0.1.0`, move the partial config aside, onboard OpenClaw, and rerun the latest setup helper:

```bash
mv ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bad-partial
openclaw onboard --mode local
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --help
```

## Out-Of-Path Checks Run But LLM Calls Fail

Out-of-path protection does not replace the LLM provider. Confirm the customer has configured their normal OpenClaw model provider and LLM provider key, such as `OPENAI_API_KEY`.

## Report Only Still Allows The Tool

That is expected. Report Only should allow execution and record the finding in the Radware portal. Use Block and Report when enforcement should stop the action.

## Gateway Looks Stuck After Start

`openclaw gateway --force` starts the gateway in the foreground. It is healthy when the log shows `gateway] ready`; leave it running in that terminal, run it under the customer's service manager, or stop it with `Ctrl+C`.

## Plugin Does Not Register Hooks

Run:

```bash
openclaw plugins inspect radware-agentic --runtime --json
```

Confirm:

- The plugin is enabled.
- `hooks.allowConversationAccess` is true.
- `before_tool_call` is listed.

## Behavioral In-Path Does Not Trigger

Provider refusals before tool emission are not Radware Behavioral blocks. Use a deterministic tool-call transcript for validation:

1. `user` asks to read a record.
2. `assistant` emits the read tool call.
3. `tool` returns the untrusted content.
4. `user` asks the agent to follow the retrieved instructions.

Do not put retrieved malicious content in a `system` message.
