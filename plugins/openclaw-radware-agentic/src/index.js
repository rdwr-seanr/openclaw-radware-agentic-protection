import { appendFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

let definePluginEntry;
try {
  ({ definePluginEntry } = await import("openclaw/plugin-sdk/plugin-entry"));
} catch {
  definePluginEntry = (entry) => entry;
}

const DEFAULT_ENDPOINT = "https://api.agentic.radwarecto.com/llmp/digester/agentic-api";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_USER = "openclaw-out-of-path";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_DIAGNOSTIC_LOG_ENV = "RADWARE_AGENTIC_DIAGNOSTIC_LOG";
const DEFAULT_DIAGNOSTIC_LEVEL = "error";
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
  const diagnostics = cfg.diagnostics && typeof cfg.diagnostics === "object" && !Array.isArray(cfg.diagnostics)
    ? cfg.diagnostics
    : {};
  const diagnosticLogEnv = text(diagnostics.logFileEnv, DEFAULT_DIAGNOSTIC_LOG_ENV);
  const stages = cfg.stages && typeof cfg.stages === "object" && !Array.isArray(cfg.stages)
    ? {
        prompt: bool(cfg.stages.prompt, false),
        response: bool(cfg.stages.response, false),
        tool: bool(cfg.stages.tool, true),
      }
    : {
        prompt: false,
        response: false,
        tool: true,
      };

  return {
    apiKey,
    apiKeyEnv,
    endpoint: text(cfg.endpoint, process.env.RADWARE_OUT_OF_PATH_URL || DEFAULT_ENDPOINT),
    model: text(cfg.model, process.env.LLM_MODEL || DEFAULT_MODEL),
    userIdentifier: text(cfg.userIdentifier, process.env.RADWARE_USER_IDENTIFIER || DEFAULT_USER),
    timeoutMs: number(cfg.timeoutMs, DEFAULT_TIMEOUT_MS),
    failOpen: text(cfg.failMode, process.env.RADWARE_FAIL_MODE || "fail-close") === "fail-open",
    includeArgs: bool(cfg.includeArgs, true),
    stages,
    diagnostics: {
      level: text(diagnostics.level, process.env.RADWARE_AGENTIC_DIAGNOSTIC_LEVEL || DEFAULT_DIAGNOSTIC_LEVEL),
      logFileEnv: diagnosticLogEnv,
      logFile: text(process.env[diagnosticLogEnv]),
    },
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

function assistantTextFrom(event) {
  const texts = Array.isArray(event?.assistantTexts) ? event.assistantTexts : [];
  if (texts.length > 0) {
    return texts.join("\n\n");
  }
  return text(event?.text || event?.responseText || event?.content || event?.message);
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

function buildResponseContext(snapshot, event) {
  const parts = [];
  const toolContext = buildUserContext(snapshot);
  if (toolContext) {
    parts.push(toolContext);
  }
  const assistantText = assistantTextFrom(event);
  if (assistantText) {
    parts.push(`assistant_response: ${assistantText}`);
  }
  return tail(parts.join("\n\n"), MAX_USER_CONTEXT_CHARS);
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

function eventTools(event) {
  const tools = event?.tools || event?.availableTools || event?.toolSchemas;
  return Array.isArray(tools) ? tools : [];
}

function hashIdentifier(value) {
  const raw = text(value);
  return raw ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : "";
}

function redactString(value) {
  return String(value ?? "")
    .replace(/sk-rdwr-[A-Za-z0-9_-]+/g, "sk-rdwr-[redacted]")
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, "sk-proj-[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "sk-[redacted]")
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "AIza[redacted]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]");
}

function isSensitiveLogKey(key) {
  return /^(apiKey|apikey|authorization|password|secret|token|accessToken|refreshToken)$/i.test(key);
}

function sanitizeDiagnostic(value, depth = 0) {
  if (depth > 5) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value).slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeDiagnostic(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveLogKey(key)) {
        out[key] = item ? "[redacted]" : "";
      } else {
        out[key] = sanitizeDiagnostic(item, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function endpointSummary(endpoint) {
  try {
    const parsed = new URL(endpoint);
    return {
      host: parsed.host,
      path: parsed.pathname,
    };
  } catch {
    return {
      host: "invalid-url",
      path: "",
    };
  }
}

function payloadSummary(payload) {
  return {
    model: text(payload.ModelToUse),
    userIdentifierHash: hashIdentifier(payload.UserIdentifier),
    userPromptChars: text(payload.UserPrompt).length,
    userContextChars: text(payload.UserContext).length,
    toolName: text(payload.ToolName),
    hasArgsInput: payload.ArgsInput !== undefined,
    toolsCount: Array.isArray(payload.ToolsInput) ? payload.ToolsInput.length : 0,
  };
}

function shouldLogDiagnostics(cfg, level) {
  const configured = text(cfg?.diagnostics?.level, DEFAULT_DIAGNOSTIC_LEVEL).toLowerCase();
  if (configured === "off") return false;
  if (configured === "info") return true;
  return level === "error";
}

async function writeDiagnostic(cfg, level, message, details = {}) {
  if (!shouldLogDiagnostics(cfg, level)) {
    return;
  }
  const record = {
    at: new Date().toISOString(),
    component: "openclaw-radware-agentic",
    level,
    message,
    details: sanitizeDiagnostic(details),
  };
  const rendered = JSON.stringify(record);
  const printer = level === "error" ? console.error : console.warn;
  printer(`[radware-agentic] ${message} ${rendered}`);

  const logFile = text(cfg?.diagnostics?.logFile);
  if (!logFile) {
    return;
  }
  try {
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(logFile, `${rendered}\n`, { mode: 0o600 });
  } catch (error) {
    console.error(
      `[radware-agentic] failed to write diagnostic log ${JSON.stringify({
        logFile,
        error: error instanceof Error ? error.message : String(error),
      })}`,
    );
  }
}

async function enforceRadware(cfg, payload, unavailableLabel) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const common = {
    requestId,
    stage: unavailableLabel,
    endpoint: endpointSummary(cfg.endpoint),
    timeoutMs: cfg.timeoutMs,
    failMode: cfg.failOpen ? "fail-open" : "fail-close",
    payload: payloadSummary(payload),
  };

  if (!cfg.apiKey) {
    await writeDiagnostic(cfg, "error", "Radware API key is missing", {
      ...common,
      apiKeyEnv: cfg.apiKeyEnv,
      decision: cfg.failOpen ? "allow-fail-open" : "block-fail-close",
    });
    if (cfg.failOpen) {
      return;
    }
    return {
      block: true,
      blockReason: `Radware API key env var is missing: ${cfg.apiKeyEnv}`,
    };
  }

  let result;
  try {
    result = await callRadware(payload, cfg.endpoint, cfg.timeoutMs);
  } catch (error) {
    await writeDiagnostic(cfg, "error", "Radware API call failed", {
      ...common,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "unknown error",
      decision: cfg.failOpen ? "allow-fail-open" : "block-fail-close",
    });
    if (cfg.failOpen) {
      return;
    }
    return {
      block: true,
      blockReason: `Radware ${unavailableLabel} unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (!result.ok) {
    await writeDiagnostic(cfg, "error", "Radware API returned non-success HTTP status", {
      ...common,
      durationMs: Date.now() - startedAt,
      status: result.status,
      responseKeys: Object.keys(result.json || {}),
      responsePreview: JSON.stringify(result.json || {}).slice(0, 1000),
      decision: cfg.failOpen ? "allow-fail-open" : "block-fail-close",
    });
    if (cfg.failOpen) {
      return;
    }
    return {
      block: true,
      blockReason: `Radware ${unavailableLabel} HTTP ${result.status}`,
    };
  }

  const isBlocked = result.json?.IsBlocked ?? result.json?.isBlocked;
  if (typeof isBlocked !== "boolean") {
    await writeDiagnostic(cfg, "error", "Radware API returned invalid decision shape", {
      ...common,
      durationMs: Date.now() - startedAt,
      status: result.status,
      responseKeys: Object.keys(result.json || {}),
      responsePreview: JSON.stringify(result.json || {}).slice(0, 1000),
      decision: cfg.failOpen ? "allow-fail-open" : "block-fail-close",
    });
    if (cfg.failOpen) {
      return;
    }
    return {
      block: true,
      blockReason: `Radware ${unavailableLabel} returned an invalid response; see diagnostics.`,
    };
  }

  if (isBlocked === true) {
    const eventId = text(result.json?.EventId || result.json?.eventId, "unknown");
    await writeDiagnostic(cfg, "info", "Radware blocked protected stage", {
      ...common,
      durationMs: Date.now() - startedAt,
      status: result.status,
      eventId,
      decision: "block-policy",
    });
    return {
      block: true,
      blockReason: `Blocked by Radware Agentic AI Protection. Event ID: ${eventId}`,
    };
  }

  await writeDiagnostic(cfg, "info", "Radware allowed protected stage", {
    ...common,
    durationMs: Date.now() - startedAt,
    status: result.status,
    eventId: text(result.json?.EventId || result.json?.eventId),
    decision: "allow-policy",
  });
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
        const cfg = configFrom(event);
        if (!cfg.stages.prompt) {
          return;
        }
        const snapshot = snapshotFor(ctx, event);
        return enforceRadware(
          cfg,
          {
            UserPrompt: buildUserPrompt(snapshot, text(event?.prompt, "OpenClaw agent run")),
            UserIdentifier: cfg.userIdentifier,
            UserContext: buildUserContext(snapshot),
            ToolsInput: eventTools(event),
            ApiKey: cfg.apiKey,
            ModelToUse: text(snapshot.modelToUse, cfg.model),
          },
          "prompt enforcement",
        );
      },
      { priority: 20 },
    );

    api.on("before_prompt_build", (event, ctx) => appendPrompt(ctx, event), { priority: 20 });
    api.on("llm_input", (event, ctx) => updateModel(ctx, event), { priority: 20 });
    api.on("after_tool_call", (event, ctx) => appendToolOutput(ctx, event), { priority: 20 });
    api.on(
      "llm_output",
      async (event, ctx) => {
        appendAssistantResponse(ctx, event);
        const cfg = configFrom(event);
        if (!cfg.stages.response) {
          return;
        }
        const snapshot = snapshotFor(ctx, event);
        return enforceRadware(
          cfg,
          {
            UserPrompt: buildUserPrompt(snapshot, "OpenClaw assistant response"),
            UserIdentifier: cfg.userIdentifier,
            UserContext: buildResponseContext(snapshot, event),
            ToolsInput: eventTools(event),
            ApiKey: cfg.apiKey,
            ModelToUse: text(snapshot.modelToUse, cfg.model),
          },
          "response enforcement",
        );
      },
      { priority: 100, timeoutMs: DEFAULT_TIMEOUT_MS + 5000 },
    );
    api.on("session_end", (event, ctx) => sessions.delete(sessionKey(ctx, event)), { priority: 20 });

    api.on(
      "before_tool_call",
      async (event, ctx) => {
        const cfg = configFrom(event);
        if (!cfg.stages.tool) {
          return;
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

        return enforceRadware(cfg, payload, "tool enforcement");
      },
      { priority: 100, timeoutMs: DEFAULT_TIMEOUT_MS + 5000 },
    );
  },
});
