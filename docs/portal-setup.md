# Radware Portal Setup

Use the Radware Agentic AI Protection portal to create the protections before configuring OpenClaw.

## In-Path Protection

1. Create a homegrown-agent or OpenAI-compatible in-path protection.
2. Attach the required AI Guardrails template.
3. Configure Behavioral / Agentic Protection as needed.
4. Copy the generated Radware in-path API key.
5. Paste it into the setup wizard, or set it at runtime as `RADWARE_INPATH_API_KEY`.
6. Use the Radware in-path endpoint as `RADWARE_INPATH_BASE_URL`.

OpenClaw must use the Radware in-path API key as the model-provider API key. Do not put the customer OpenAI API key in the Radware in-path provider entry.

The Radware in-path endpoint must match the provider configured in the portal. The validated OpenAI endpoint is:

```bash
https://api.agentic.radwarecto.com/v1/openai
```

Other providers need a confirmed Radware provider path before they are documented as supported. Direct Gemini and NVIDIA OpenAI-compatible endpoints worked in lab testing, but Radware Gemini in-path did not work with the tested candidate paths on 2026-06-29 and needs portal/Radware review.

## Out-Of-Path Protection

1. Create a homegrown-agent out-of-path protection.
2. Attach the required AI Guardrails template.
3. Configure Behavioral / Agentic Protection as Block and Report or Report Only.
4. Copy the generated Radware out-of-path API key.
5. Paste it into the setup wizard, or set it at runtime as `RADWARE_OUT_OF_PATH_API_KEY`.
6. Keep the customer's own LLM provider configured separately in OpenClaw.

The included out-of-path plugin sends explicit checks to Radware at the stages enabled in plugin config. New setup-generated configs enable prompt, response, and tool checks. Existing configs without `stages` remain tool-stage only. Out-of-path does not replace the customer's normal LLM provider.

Because out-of-path does not proxy model traffic, the setup wizard does not ask for the customer's OpenAI, Gemini, NVIDIA, or other LLM provider key. The customer's normal OpenClaw provider continues to own that endpoint and credential.

## Policy Modes

- Block and Report: Radware should return `IsBlocked: true` for blocked findings, and the OpenClaw plugin blocks the tool call.
- Report Only: Radware should return `IsBlocked: false`; the OpenClaw plugin allows the tool call and the portal records the finding.

When validating Report Only, confirm the event in the Radware portal if the client/API response does not include an Event ID.
