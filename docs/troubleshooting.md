# Troubleshooting

## In-Path Requests Fail Immediately

Check that the OpenClaw provider uses the Radware in-path API key and Radware in-path base URL. Do not use the customer's OpenAI API key in the Radware in-path provider entry.

## Out-Of-Path Checks Run But LLM Calls Fail

Out-of-path protection does not replace the LLM provider. Confirm the customer has configured their normal OpenClaw model provider and LLM provider key, such as `OPENAI_API_KEY`.

## Report Only Still Allows The Tool

That is expected. Report Only should allow execution and record the finding in the Radware portal. Use Block and Report when enforcement should stop the action.

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
