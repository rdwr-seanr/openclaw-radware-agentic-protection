# In-Path OpenClaw Integration

In-path protection routes OpenClaw provider traffic through Radware's OpenAI-compatible proxy. It can protect prompt, response, and tool/action context when OpenClaw sends that context through the provider request.

Assumption: OpenClaw is already installed, onboarded, and has an existing `openclaw.json`. Run setup commands as the same OS user that runs the OpenClaw gateway.

## Required Credentials

- `RADWARE_INPATH_API_KEY`: Radware in-path API key.
- `RADWARE_INPATH_BASE_URL`: Radware in-path endpoint, for example `https://api.agentic.radwarecto.com/v1/openai`.

The OpenClaw provider API key must be the Radware in-path key. The customer OpenAI key is not used by this provider entry.

The endpoint path after `/v1/` must match the provider configured in the Radware portal. OpenAI has been validated with `/v1/openai`. Do not change this to `/v1/gemini`, `/v1/google`, or another provider path unless Radware confirms and validates that path for the customer's portal deployment.

## Provider Path Notes

Validated Radware in-path endpoint:

| Portal provider | Radware base URL | Example model | Status |
| --- | --- | --- | --- |
| OpenAI | `https://api.agentic.radwarecto.com/v1/openai` | `gpt-4o` | Validated |

Provider checks from 2026-06-29:

- Direct Gemini OpenAI-compatible API worked at `https://generativelanguage.googleapis.com/v1beta/openai` with model `gemini-2.5-flash`.
- Direct NVIDIA OpenAI-compatible API worked at `https://integrate.api.nvidia.com/v1` with model `nvidia/nemotron-3-nano-30b-a3b`.
- Radware Gemini in-path still needs portal/Radware review. Tested Radware paths including `/v1/gemini`, `/v1/google`, `/v1/google-gemini`, and `/v1/openai`; none produced a valid proxied Gemini result. `/v1/openai` routed to OpenAI and rejected the Gemini upstream key, so it is not the Gemini path.

## Example Provider

```json
{
  "models": {
    "providers": {
      "radware-openai": {
        "baseUrl": "${RADWARE_INPATH_BASE_URL}",
        "apiKey": "${RADWARE_INPATH_API_KEY}",
        "auth": "api-key",
        "api": "openai-completions",
        "timeoutSeconds": 180,
        "models": [
          {
            "id": "gpt-4o",
            "name": "Radware-proxied OpenAI GPT-4o",
            "api": "openai-completions",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 4096
          }
        ]
      }
    }
  }
}
```

## Setup Helper

Recommended wizard:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup
```

Choose `in-path` when prompted.

Manual or change-control setup:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --in-path --dry-run
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --in-path --runtime-env-file ~/.openclaw/radware.env
```

If OpenClaw uses a custom config path, add `--config /path/to/openclaw.json`.

To also set OpenClaw's default model:

```bash
npx -y -p openclaw-radware-agentic-protection@latest radware-openclaw-setup --in-path --set-default-model --runtime-env-file ~/.openclaw/radware.env
```

Load the generated env file before starting OpenClaw:

```bash
set -a
. ~/.openclaw/radware.env
set +a
openclaw gateway run --force
```

## Validation

Run a benign prompt through the Radware provider, then run AI Guardrails tests for credit-card PII, HAPBlocker, and blocked medical/medicine topics.

In-path Behavioral validation requires the model/proxy flow to include the tool/action context. For deterministic validation, use a proper Chat Completions tool transcript: `user`, `assistant` with `tool_calls`, `tool`, then a follow-up `user`.

## Fail-Open / Fail-Close

In-path is fail-close by default: if the Radware proxy is unavailable, the model call fails. Fail-open requires a customer-owned fallback wrapper that retries the direct LLM provider only for connectivity failures, never for Radware policy blocks.
