import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DEFAULT_ENDPOINT = "https://api.agentic.radwarecto.com/llmp/digester/agentic-api";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_USER = "openclaw-out-of-path";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_USER_PROMPTS = 50;
const MAX_TOOL_OUTPUTS = 200;
const MAX_ASSISTANT_RESPONSES = 50;
const MAX_USER_PROMPT_CHARS = 800_000;
const MAX_USER_CONTEXT_CHARS = 800_000;

const sessions = new Map();

function text(value, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function configFrom(event) {
  const cfg = event?.context?.pluginConfig ?? {};
  const apiKeyEnv = text(cfg.apiKeyEnv, "RADWARE_OUT_OF_PATH_API_KEY");
  const apiKey = text(process.env[apiKeyEnv]);

  return {
    apiKey,
    apiKeyEnv,
    endpoint: text(cfg.endpoint, process.env.RADWARE_OUT_OF_PATH_URL || DEFAULT_ENDPOINT),
    model: text(cfg.model, process.env.LLM_MODEL || DEFAULT_MODEL),
    userIdentifier: text(cfg.userIdentifier, process.env.RADWARE_USER_IDENTIFIER || DEFAULT_USER),
    timeoutMs: number(cfg.timeoutMs, DEFAULT_TIMEOUT_MS),
    failOpen: text(cfg.failMode, process.env.RADWARE_FAIL_MODE || "fail-close") === "fail-open",
    includeArgs: bool(cfg.includeArgs, true),
  };
}

function sessionKey(ctx = {}, event = {}) {
  return ctx.sessionId || event.sessionId || ctx.sessionKey || ctx.runId || "default";
}

function trimArray(items, max) {
  if (items.length > max) {
    items.splice(0, items.length - max);
  }
}

function json(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function tail(value, maxChars) {
  const str = text(value);
  return str.length > maxChars ? str.slice(str.length - maxChars) : str;
}

function snapshotFor(ctx = {}, event = {}) {
  const key = sessionKey(ctx, event);
  let snapshot = sessions.get(key);
  if (!snapshot) {
    snapshot = {
      at: Date.now(),
      userIdentifier: text(ctx.agentId, DEFAULT_USER),
      modelToUse: "",
      userPrompts: [],
      toolOutputs: [],
      assistantResponses: [],
    };
    sessions.set(key, snapshot);
  }
  snapshot.at = Date.now();
  return snapshot;
}

function cleanupSessions() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of sessions) {
    if (value.at < cutoff) {
      sessions.delete(key);
    }
  }
}

function appendPrompt(ctx, event) {
  const prompt = text(event?.prompt);
  if (!prompt) {
    return;
  }
  const snapshot = snapshotFor(ctx, event);
  snapshot.userPrompts.push(prompt);
  trimArray(snapshot.userPrompts, MAX_USER_PROMPTS);
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  return messages
    .slice(-8)
    .map((message) => {
      const role = text(message?.role, "unknown");
      const content = typeof message?.content === "string" ? message.content : JSON.stringify(message?.content ?? "");
      return `${role}: ${content.slice(0, 1200)}`;
    })
    .join("\n");
}

function appendAgentRun(ctx, event) {
  const snapshot = snapshotFor(ctx, event);
  const prompt = text(event?.prompt);
  if (prompt) {
    snapshot.userPrompts.push(prompt);
    trimArray(snapshot.userPrompts, MAX_USER_PROMPTS);
  }
  const context = summarizeMessages(event?.messages);
  if (context) {
    snapshot.toolOutputs.push({ toolName: "conversation_context", result: context });
    trimArray(snapshot.toolOutputs, MAX_TOOL_OUTPUTS);
  }
}

function updateModel(ctx, event) {
  const snapshot = snapshotFor(ctx, event);
  snapshot.modelToUse = text(event?.model, snapshot.modelToUse);
}

function appendToolOutput(ctx, event) {
  const snapshot = snapshotFor(ctx, event);
  snapshot.toolOutputs.push({
    toolName: text(event?.toolName, "unknown"),
    params: event?.params ?? {},
    ...(event?.result !== undefined ? { result: event.result } : {}),
    ...(event?.error !== undefined ? { error: event.error } : {}),
  });
  trimArray(snapshot.toolOutputs, MAX_TOOL_OUTPUTS);
}

function appendAssistantResponse(ctx, event) {
  const texts = Array.isArray(event?.assistantTexts) ? event.assistantTexts : [];
  if (texts.length === 0) {
    return;
  }
  const snapshot = snapshotFor(ctx, event);
  snapshot.assistantResponses.push(texts.join("\n\n"));
  trimArray(snapshot.assistantResponses, MAX_ASSISTANT_RESPONSES);
}

function buildUserPrompt(snapshot, fallback) {
  return tail(snapshot.userPrompts.join("\n\n").trim() || fallback, MAX_USER_PROMPT_CHARS);
}

function serializeToolOutput(output) {
  const lines = [`tool: ${output.toolName}`, `params: ${json(output.params ?? {})}`];
  if (output.result !== undefined) {
    lines.push(`result: ${json(output.result)}`);
  }
  if (output.error !== undefined) {
    lines.push(`error: ${text(output.error)}`);
  }
  return lines.join("\n");
}

function buildUserContext(snapshot) {
  return tail(snapshot.toolOutputs.map(serializeToolOutput).join("\n\n"), MAX_USER_CONTEXT_CHARS);
}

function inferJsonSchema(value) {
  if (value === null) {
    return { type: "null" };
  }
  if (Array.isArray(value)) {
    return { type: "array" };
  }
  if (typeof value === "object") {
    return { type: "object", additionalProperties: true };
  }
  return { type: typeof value };
}

function toolSchema(event) {
  const properties = {};
  for (const [key, value] of Object.entries(event.params ?? {})) {
    properties[key] = inferJsonSchema(value);
  }

  return [
    {
      type: "function",
      name: event.toolName,
      description: `OpenClaw tool action: ${event.toolName}`,
      parameters: {
        type: "object",
        properties,
        additionalProperties: true,
      },
    },
  ];
}

async function callRadware(payload, endpoint, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const textBody = await response.text();
    let json;
    try {
      json = textBody ? JSON.parse(textBody) : {};
    } catch {
      json = { raw: textBody.slice(0, 1000) };
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export default definePluginEntry({
  id: "radware-agentic",
  name: "Radware Agentic AI Protection",
  register(api) {
    api.on(
      "before_agent_run",
      async (event, ctx) => {
        appendAgentRun(ctx, event);
        cleanupSessions();
      },
      { priority: 20 },
    );

    api.on("before_prompt_build", (event, ctx) => appendPrompt(ctx, event), { priority: 20 });
    api.on("llm_input", (event, ctx) => updateModel(ctx, event), { priority: 20 });
    api.on("after_tool_call", (event, ctx) => appendToolOutput(ctx, event), { priority: 20 });
    api.on("llm_output", (event, ctx) => appendAssistantResponse(ctx, event), { priority: 20 });
    api.on("session_end", (event, ctx) => sessions.delete(sessionKey(ctx, event)), { priority: 20 });

    api.on(
      "before_tool_call",
      async (event, ctx) => {
        const cfg = configFrom(event);
        if (!cfg.apiKey) {
          if (cfg.failOpen) {
            return;
          }
          return {
            block: true,
            blockReason: `Radware API key env var is missing: ${cfg.apiKeyEnv}`,
          };
        }

        const snapshot = snapshotFor(ctx, event);
        const payload = {
          UserPrompt: buildUserPrompt(snapshot, `OpenClaw tool execution: ${event.toolName}`),
          UserIdentifier: cfg.userIdentifier,
          UserContext: buildUserContext(snapshot),
          ToolName: event.toolName,
          ArgsInput: cfg.includeArgs ? event.params : {},
          ToolsInput: toolSchema(event),
          ApiKey: cfg.apiKey,
          ModelToUse: text(snapshot.modelToUse, cfg.model),
        };

        let result;
        try {
          result = await callRadware(payload, cfg.endpoint, cfg.timeoutMs);
        } catch (error) {
          if (cfg.failOpen) {
            return;
          }
          return {
            block: true,
            blockReason: `Radware enforcement unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
          };
        }

        if (!result.ok && !cfg.failOpen) {
          return {
            block: true,
            blockReason: `Radware enforcement HTTP ${result.status}`,
          };
        }

        if (result.json?.IsBlocked === true || result.json?.isBlocked === true) {
          const eventId = text(result.json?.EventId || result.json?.eventId, "unknown");
          return {
            block: true,
            blockReason: `Blocked by Radware Agentic AI Protection. Event ID: ${eventId}`,
          };
        }
      },
      { priority: 100, timeoutMs: DEFAULT_TIMEOUT_MS + 5000 },
    );
  },
});
