# Radware Portal Setup

Use the Radware Agentic AI Protection portal to create the protections before configuring OpenClaw.

## In-Path Protection

1. Create a homegrown-agent or OpenAI-compatible in-path protection.
2. Attach the required AI Guardrails template.
3. Configure Behavioral / Agentic Protection as needed.
4. Copy the generated Radware in-path API key.
5. Set it at runtime as `RADWARE_INPATH_API_KEY`.
6. Use the Radware in-path endpoint as `RADWARE_INPATH_BASE_URL`.

OpenClaw must use the Radware in-path API key as the model-provider API key. Do not put the customer OpenAI API key in the Radware in-path provider entry.

## Out-Of-Path Protection

1. Create a homegrown-agent out-of-path protection.
2. Attach the required AI Guardrails template.
3. Configure Behavioral / Agentic Protection as Block and Report or Report Only.
4. Copy the generated Radware out-of-path API key.
5. Set it at runtime as `RADWARE_OUT_OF_PATH_API_KEY`.
6. Keep the customer's own LLM provider configured separately in OpenClaw.

The out-of-path plugin sends explicit pre-tool checks to Radware. It does not replace the LLM provider.

## Policy Modes

- Block and Report: Radware should return `IsBlocked: true` for blocked findings, and the OpenClaw plugin blocks the tool call.
- Report Only: Radware should return `IsBlocked: false`; the OpenClaw plugin allows the tool call and the portal records the finding.

When validating Report Only, confirm the event in the Radware portal if the client/API response does not include an Event ID.
