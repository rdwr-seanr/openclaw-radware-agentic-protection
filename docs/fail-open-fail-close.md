# Fail-Open And Fail-Close

## Out-Of-Path

Out-of-path enforcement can support both modes directly in the plugin because the protected prompt, response, or tool stage is paused while Radware is called.

- `fail-close`: if Radware returns an error, times out, or is unreachable, block or pause the protected stage.
- `fail-open`: if Radware is unreachable, allow the protected stage and emit a clear audit log/metric.

Default recommendation: `fail-close` for production agents that can perform sensitive writes, sends, deletes, or network calls.

This is separate from portal enforcement mode:

- Portal Block and Report should return `IsBlocked: true`; the plugin blocks.
- Portal Report Only should return `IsBlocked: false`; the plugin allows and the portal records/report events.
- Local fail-open/fail-close is used only when Radware is unavailable, times out, or returns an invalid response.

## In-Path

In-path enforcement routes the LLM call through Radware.

- `fail-close`: configure only the Radware base URL. If Radware or the upstream provider path fails, the model turn fails.
- `fail-open`: implement an explicit fallback wrapper that retries the direct provider only for connectivity failures, 5xx responses, or timeouts.

Important constraints:

- Never fallback on a Radware policy block.
- Preserve audit logs when fallback is used.
- Make fallback opt-in and visible in config.
- Keep a short timeout budget so fail-open does not hide a degraded protection path.

## OpenClaw Implementation Options

Out-of-path:

- Existing plugin supports `failMode: "fail-close"` or `failMode: "fail-open"`.
- Validation command: `npm run validate:fail-modes`.

In-path:

- Current config is fail-close by default.
- A future fail-open implementation should be a small local provider proxy or OpenClaw provider wrapper:
  - primary target: Radware in-path base URL
  - fallback target: direct OpenAI base URL
  - fallback only on transport/availability errors
  - no fallback on Radware block responses
