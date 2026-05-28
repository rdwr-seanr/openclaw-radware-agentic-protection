# In-Path OpenClaw Integration

In-path protection routes OpenClaw model traffic through Radware's OpenAI-compatible proxy.

## Required Credentials

- `RADWARE_INPATH_API_KEY`: Radware in-path API key.
- `RADWARE_INPATH_BASE_URL`: Radware in-path endpoint, for example `https://api.agentic.radwarecto.com/v1/openai`.

The OpenClaw provider API key must be the Radware in-path key. The customer OpenAI key is not used by this provider entry.

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

```bash
npx -p @radware/openclaw-agentic-protection radware-openclaw-setup --in-path --dry-run
npx -p @radware/openclaw-agentic-protection radware-openclaw-setup --in-path
```

To also set OpenClaw's default model:

```bash
npx -p @radware/openclaw-agentic-protection radware-openclaw-setup --in-path --set-default-model
```

## Validation

Run a benign prompt through the Radware provider, then run AI Guardrails tests for credit-card PII, HAPBlocker, and blocked medical/medicine topics.

In-path Behavioral validation requires the model/proxy flow to emit a tool call. For deterministic validation, use a proper Chat Completions tool transcript: `user`, `assistant` with `tool_calls`, `tool`, then a follow-up `user`.

## Fail-Open / Fail-Close

In-path is fail-close by default: if the Radware proxy is unavailable, the model call fails. Fail-open requires a customer-owned fallback wrapper that retries the direct LLM provider only for connectivity failures, never for Radware policy blocks.
