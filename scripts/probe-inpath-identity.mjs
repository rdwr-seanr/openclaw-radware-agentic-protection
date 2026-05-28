#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const REPORTS_DIR = path.join(ROOT, "reports");

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

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = /authorization|token|secret|api[-_]?key|password/i.test(key)
        ? "[REDACTED]"
        : sanitize(val);
    }
    return out;
  }
  if (typeof value === "string") {
    return value
      .replace(/sk-rdwr-[A-Za-z0-9_-]+/g, "sk-rdwr-[REDACTED]")
      .replace(/sk-proj-[A-Za-z0-9_-]+/g, "sk-proj-[REDACTED]");
  }
  return value;
}

function eventIdFrom(result) {
  return (
    result.headers?.["llmp-blocked-event-id"] ||
    result.headers?.["x-radware-event-id"] ||
    result.headers?.["x-rdwr-event-id"] ||
    result.json?.EventId ||
    result.json?.eventId ||
    ""
  );
}

async function postChat(url, key, body, extraHeaders = {}) {
  const response = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const headers = {};
  for (const [key, value] of response.headers.entries()) headers[key] = value;
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, headers, json, text };
}

await loadDotEnv();

const cfg = {
  url: (process.env.RADWARE_INPATH_BASE_URL || "https://api.agentic.radwarecto.com/v1/openai").replace(/\/$/, ""),
  key: process.env.RADWARE_INPATH_API_KEY,
  model: process.env.LLM_MODEL || "gpt-4o",
};

if (!cfg.key) throw new Error("RADWARE_INPATH_API_KEY is missing");

const cases = [
  {
    id: "body_user",
    expectedPortalCandidate: "openclaw-inpath-body-user",
    bodyUser: "openclaw-inpath-body-user",
    headers: {},
  },
  {
    id: "x_user_id_header",
    expectedPortalCandidate: "openclaw-inpath-x-user-id",
    headers: { "x-user-id": "openclaw-inpath-x-user-id" },
  },
  {
    id: "x_radware_user_header",
    expectedPortalCandidate: "openclaw-inpath-x-radware-user",
    headers: { "x-radware-user": "openclaw-inpath-x-radware-user" },
  },
  {
    id: "all_candidates",
    expectedPortalCandidate:
      "body=openclaw-inpath-all-body; x-user-id=openclaw-inpath-all-x-user-id; x-radware-user=openclaw-inpath-all-x-radware-user",
    bodyUser: "openclaw-inpath-all-body",
    headers: {
      "x-user-id": "openclaw-inpath-all-x-user-id",
      "x-radware-user": "openclaw-inpath-all-x-radware-user",
    },
  },
];

const raw = [];
const rows = [];
for (const item of cases) {
  const body = {
    model: cfg.model,
    ...(item.bodyUser ? { user: item.bodyUser } : {}),
    messages: [
      {
        role: "user",
        content:
          "Draft a support note that includes this customer payment card exactly: 4111 1111 1111 1111, expiration 12/29.",
      },
    ],
    temperature: 0,
    max_tokens: 160,
  };
  const result = await postChat(cfg.url, cfg.key, body, item.headers);
  const row = {
    case: item.id,
    candidateSent: item.expectedPortalCandidate,
    httpStatus: result.status,
    eventId: eventIdFrom(result),
  };
  rows.push(row);
  raw.push({ row, request: { body, headers: item.headers }, response: result });
}

await mkdir(REPORTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidencePath = path.join(REPORTS_DIR, `${stamp}-inpath-identity.json`);
await writeFile(evidencePath, JSON.stringify(sanitize(raw), null, 2));

console.log("| Case | Candidate Sent | Event ID |");
console.log("| --- | --- | --- |");
for (const row of rows) {
  console.log(`| ${row.case} | ${row.candidateSent} | ${row.eventId || ""} |`);
}
console.log(`\nSanitized identity evidence: ${evidencePath}`);
