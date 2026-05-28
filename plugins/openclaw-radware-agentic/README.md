# Radware Agentic AI Protection for OpenClaw

OpenClaw plugin for Radware Agentic AI Protection out-of-path tool enforcement.

## What This Package Does

- Registers OpenClaw lifecycle hooks and calls Radware before tool execution.
- Sends accumulated user intent, untrusted tool output context, tool name, tool arguments, tool schema, model, and user identifier to Radware.
- Blocks the OpenClaw tool call when Radware returns `IsBlocked: true`.
- Allows the tool call when Radware returns `IsBlocked: false`, including portal Report Only policies.
- Supports local `fail-close` and `fail-open` behavior for Radware API unavailability.

## Install

```bash
openclaw plugins install @radware/openclaw-agentic-protection
```

## Configure Out-Of-Path Enforcement

Set runtime environment variables. Do not put secrets in `openclaw.json`.

```bash
export RADWARE_OUT_OF_PATH_API_KEY="sk-rdwr-..."
export RADWARE_OUT_OF_PATH_URL="https://api.agentic.radwarecto.com/llmp/digester/agentic-api"
export LLM_MODEL="gpt-4o"
export RADWARE_USER_IDENTIFIER="openclaw-out-of-path"
export RADWARE_FAIL_MODE="fail-close"
```

Add the plugin entry:

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

Or use the setup helper:

```bash
npx -p @radware/openclaw-agentic-protection radware-openclaw-setup --out-of-path --dry-run
npx -p @radware/openclaw-agentic-protection radware-openclaw-setup --out-of-path
```

## In-Path Is Configured Separately

For in-path protection, configure an OpenAI-compatible OpenClaw model provider that uses:

- `apiKey`: the Radware in-path API key
- `baseUrl`: the Radware in-path OpenAI-compatible endpoint

The in-path provider does not use the customer's OpenAI API key directly. For out-of-path-only deployments, the customer still configures their normal LLM provider separately with their own LLM provider key.

## Portal Policy Semantics

`enforcementMode: "portal-decision"` means the Radware portal controls the decision:

- Block and Report: Radware returns `IsBlocked: true`; this plugin blocks the tool call.
- Report Only: Radware returns `IsBlocked: false`; this plugin allows the tool call.

`failMode` applies only when Radware is unavailable or returns an invalid response.
