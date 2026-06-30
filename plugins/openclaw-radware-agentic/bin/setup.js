#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";

const RADWARE_INPATH_ORIGIN = "https://api.agentic.radwarecto.com";
const DEFAULT_INPATH_PROVIDER = "openai";
const DEFAULT_INPATH_BASE_URL = `${RADWARE_INPATH_ORIGIN}/v1/${DEFAULT_INPATH_PROVIDER}`;
const DEFAULT_OUTPATH_URL = "https://api.agentic.radwarecto.com/llmp/digester/agentic-api";
const PACKAGE_SPEC = "npm:openclaw-radware-agentic-protection@latest";
const SETUP_VERSION = "0.2.0";
const INPATH_PROVIDER_PRESETS = {
  openai: {
    label: "OpenAI",
    providerName: "radware-openai",
    endpoint: DEFAULT_INPATH_BASE_URL,
  },
};

function usage(exitCode = 0) {
  console.log(`Radware OpenClaw setup

Usage:
  radware-openclaw-setup
  radware-openclaw-setup --in-path [options]
  radware-openclaw-setup --out-of-path [options]

Integration path:
  No path flag              Start an interactive setup wizard.
  --in-path                 Add the Radware in-path OpenAI-compatible provider.
  --out-of-path             Add the Radware out-of-path plugin entry.

Options:
  --config <path>           OpenClaw config path. Defaults to OPENCLAW_HOME/.openclaw/openclaw.json or ~/.openclaw/openclaw.json.
  --provider-name <name>    In-path provider name. Default: radware-openai for OpenAI, radware-inpath for custom.
  --in-path-provider <id>   In-path provider preset: openai or custom. Default: openai.
  --in-path-endpoint <url>  In-path Radware endpoint or path. Accepts full URL, /v1/<path>, or <path>.
  --model <id>              Model id to configure/use. Default: gpt-4o.
  --set-default-model       Set agents.defaults.model.primary to the Radware in-path provider.
  --user-identifier <id>    Out-of-path Radware UserIdentifier. Default: openclaw-out-of-path.
  --fail-mode <mode>        fail-close or fail-open for out-of-path API unavailability. Default: fail-close.
  --runtime-env-file <path> Write runtime variables to this chmod 600 env file.
  --log-file <path>         Write a sanitized setup diagnostic log. A log is always written on failure.
  --install-plugin          Install the out-of-path OpenClaw plugin with: openclaw plugins install ${PACKAGE_SPEC}
  --skip-plugin-install     Do not install the OpenClaw plugin during interactive out-of-path setup.
  --allow-unconfigured      Advanced/lab only: allow writing a config without gateway.mode.
  --dry-run                 Print the merged config without writing.
  --help                    Show this help.

Secrets are not written into the OpenClaw config. The generated config references environment variables:
  RADWARE_INPATH_API_KEY, RADWARE_INPATH_BASE_URL
  RADWARE_OUT_OF_PATH_API_KEY, RADWARE_OUT_OF_PATH_URL
  LLM_MODEL, RADWARE_USER_IDENTIFIER, RADWARE_FAIL_MODE

Out-of-path setup does not configure the customer's LLM provider or ask for the customer's LLM API key.
Keep the customer's existing OpenClaw model provider configured separately.

On failure, setup writes a sanitized diagnostic log and prints the log path.

For in-path custom providers, use the Radware proxy path confirmed in the Radware portal.
Do not use the direct LLM provider base URL as RADWARE_INPATH_BASE_URL.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    inPath: false,
    outOfPath: false,
    configPath: "",
    providerName: "",
    providerNameExplicit: false,
    inPathProvider: DEFAULT_INPATH_PROVIDER,
    inPathEndpoint: process.env.RADWARE_INPATH_BASE_URL || "",
    inPathProviderLabel: INPATH_PROVIDER_PRESETS[DEFAULT_INPATH_PROVIDER].label,
    model: process.env.LLM_MODEL || "gpt-4o",
    setDefaultModel: false,
    userIdentifier: process.env.RADWARE_USER_IDENTIFIER || "openclaw-out-of-path",
    failMode: process.env.RADWARE_FAIL_MODE || "fail-close",
    envFile: "",
    logFile: "",
    writeEnvFile: false,
    installPlugin: false,
    skipPluginInstall: false,
    interactive: false,
    allowUnconfigured: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--in-path":
        args.inPath = true;
        break;
      case "--out-of-path":
        args.outOfPath = true;
        break;
      case "--config":
        args.configPath = next();
        break;
      case "--provider-name":
        args.providerName = next();
        args.providerNameExplicit = true;
        break;
      case "--in-path-provider":
        args.inPathProvider = next();
        break;
      case "--in-path-endpoint":
      case "--in-path-provider-path":
      case "--radware-in-path-endpoint":
        args.inPathEndpoint = next();
        break;
      case "--model":
        args.model = next();
        break;
      case "--set-default-model":
        args.setDefaultModel = true;
        break;
      case "--user-identifier":
        args.userIdentifier = next();
        break;
      case "--fail-mode":
        args.failMode = next();
        break;
      case "--env-file":
      case "--runtime-env-file":
      case "--radware-env-file":
        args.envFile = next();
        args.writeEnvFile = true;
        break;
      case "--log-file":
      case "--diagnostic-log-file":
        args.logFile = next();
        break;
      case "--install-plugin":
        args.installPlugin = true;
        break;
      case "--skip-plugin-install":
        args.skipPluginInstall = true;
        break;
      case "--allow-unconfigured":
        args.allowUnconfigured = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        usage(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.inPath && !args.outOfPath) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      args.interactive = true;
    } else {
      throw new Error("Choose exactly one integration path: --in-path or --out-of-path");
    }
  }
  if (args.inPath && args.outOfPath) {
    throw new Error(
      "Choose exactly one integration path per OpenClaw deployment. Do not configure --in-path and --out-of-path together.",
    );
  }
  if (!["fail-close", "fail-open"].includes(args.failMode)) {
    throw new Error("--fail-mode must be fail-close or fail-open");
  }
  return args;
}

function defaultConfigPath() {
  if (process.env.OPENCLAW_HOME) {
    return path.join(process.env.OPENCLAW_HOME, ".openclaw", "openclaw.json");
  }
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function expandHome(value) {
  if (!value || value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function normalizeInPathProvider(value) {
  const normalized = String(value || DEFAULT_INPATH_PROVIDER).trim().toLowerCase().replace(/_/g, "-");
  if (INPATH_PROVIDER_PRESETS[normalized]) {
    return normalized;
  }
  if (["custom", "other", "own", "manual"].includes(normalized)) {
    return "custom";
  }
  throw new Error("--in-path-provider must be openai or custom");
}

function normalizeInPathEndpoint(value, provider) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (provider === "custom") {
      throw new Error("Custom in-path provider requires --in-path-endpoint or a RADWARE_INPATH_BASE_URL value");
    }
    return INPATH_PROVIDER_PRESETS[provider]?.endpoint || DEFAULT_INPATH_BASE_URL;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }
  if (raw.startsWith("/")) {
    return `${RADWARE_INPATH_ORIGIN}${raw.replace(/\/+$/, "")}`;
  }
  if (raw.startsWith("v1/")) {
    return `${RADWARE_INPATH_ORIGIN}/${raw.replace(/\/+$/, "")}`;
  }
  return `${RADWARE_INPATH_ORIGIN}/v1/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function defaultProviderName(args) {
  if (args.providerNameExplicit && args.providerName) {
    return args.providerName;
  }
  const preset = INPATH_PROVIDER_PRESETS[args.inPathProvider];
  return preset?.providerName || "radware-inpath";
}

function prepareInPathArgs(args) {
  if (!args.inPath) {
    return args;
  }
  args.inPathProvider = normalizeInPathProvider(args.inPathProvider);
  args.inPathEndpoint = normalizeInPathEndpoint(args.inPathEndpoint, args.inPathProvider);
  process.env.RADWARE_INPATH_BASE_URL = args.inPathEndpoint;
  args.inPathProviderLabel =
    INPATH_PROVIDER_PRESETS[args.inPathProvider]?.label || "Custom LLM";
  args.providerName = defaultProviderName(args);
  return args;
}

function quoteEnv(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

function defaultEnvFile(configPath) {
  return path.join(path.dirname(configPath), "radware.env");
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function defaultSetupLogFile(configPath) {
  return path.join(path.dirname(configPath), "logs", `radware-openclaw-setup-${timestampForFile()}.log`);
}

function defaultRuntimeDiagnosticLog(envFile) {
  return path.join(path.dirname(envFile), "logs", "radware-agentic-runtime.jsonl");
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

function sanitizeForLog(value, depth = 0) {
  if (depth > 6) {
    return "[max-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveLogKey(key)) {
        out[key] = item ? "[redacted]" : "";
      } else {
        out[key] = sanitizeForLog(item, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function commandSummary(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout: redactString((result.stdout || "").trim()).slice(0, 2000),
    stderr: redactString((result.stderr || "").trim()).slice(0, 2000),
    error: result.error ? redactString(result.error.message) : "",
  };
}

function runtimeSummary() {
  return {
    setupVersion: SETUP_VERSION,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    openclaw: commandSummary("openclaw", ["--version"]),
    npm: commandSummary("npm", ["--version"]),
    envPresence: {
      OPENCLAW_HOME: Boolean(process.env.OPENCLAW_HOME),
      RADWARE_INPATH_API_KEY: Boolean(process.env.RADWARE_INPATH_API_KEY),
      RADWARE_OUT_OF_PATH_API_KEY: Boolean(process.env.RADWARE_OUT_OF_PATH_API_KEY),
      RADWARE_INPATH_BASE_URL: Boolean(process.env.RADWARE_INPATH_BASE_URL),
      RADWARE_OUT_OF_PATH_URL: Boolean(process.env.RADWARE_OUT_OF_PATH_URL),
      LLM_MODEL: Boolean(process.env.LLM_MODEL),
      RADWARE_AGENTIC_DIAGNOSTIC_LOG: Boolean(process.env.RADWARE_AGENTIC_DIAGNOSTIC_LOG),
    },
  };
}

class DiagnosticLog {
  constructor() {
    this.events = [];
  }

  add(event, details = {}) {
    this.events.push({
      at: new Date().toISOString(),
      event,
      details: sanitizeForLog(details),
    });
  }

  addError(error) {
    this.add("error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : "",
    });
  }

  async write(logFile) {
    const rendered = [
      "# Radware OpenClaw Setup Diagnostic Log",
      `created_at=${new Date().toISOString()}`,
      `setup_version=${SETUP_VERSION}`,
      "",
      ...this.events.map((event) => JSON.stringify(event)),
      "",
    ].join("\n");
    await mkdir(path.dirname(logFile), { recursive: true });
    await writeFile(logFile, rendered, { mode: 0o600 });
    return logFile;
  }
}

function supportHints(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/config not found/i.test(message)) {
    return [
      "Run the setup as the same OS user that runs OpenClaw.",
      "If OpenClaw uses a custom location, pass --config /path/to/openclaw.json.",
      "On a fresh lab server, onboard OpenClaw first, then rerun this helper.",
    ];
  }
  if (/gateway\.mode/i.test(message)) {
    return [
      "The selected file does not look like an onboarded OpenClaw config.",
      "Run openclaw onboard first, or choose the real OpenClaw config path.",
    ];
  }
  if (/already contains/i.test(message) || /Choose exactly one/i.test(message)) {
    return [
      "Use exactly one Radware integration path per OpenClaw deployment.",
      "Use a separate OpenClaw environment if you need to test both in-path and out-of-path.",
    ];
  }
  if (/plugin install/i.test(message)) {
    return [
      "Confirm openclaw is on PATH for this OS user.",
      `Retry the plugin install manually: openclaw plugins install ${PACKAGE_SPEC}`,
    ];
  }
  return [
    "Open the diagnostic log and share it with Radware support after removing any local file paths you do not want to share.",
    "Run with --dry-run first if you need to review the config change before applying it.",
  ];
}

function printFailure(error, logFile) {
  console.error("Radware OpenClaw setup failed.");
  console.error(`Reason: ${redactString(error instanceof Error ? error.message : String(error))}`);
  console.error(`Diagnostic log: ${logFile}`);
  console.error("Suggested next checks:");
  for (const hint of supportHints(error)) {
    console.error(`- ${hint}`);
  }
}

async function askLine(rl, prompt, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const value = (await rl.question(`${prompt}${suffix}: `)).trim();
  return value || fallback;
}

async function askSecret(prompt, fallback = "") {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return fallback;
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;
    let value = "";

    function cleanup() {
      stdin.off("data", onData);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\n");
    }

    function onData(buffer) {
      for (const byte of buffer) {
        if (byte === 3) {
          cleanup();
          reject(new Error("Interrupted"));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          resolve(value || fallback);
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        value += String.fromCharCode(byte);
      }
    }

    stdout.write(`${prompt}${fallback ? " [keep existing]" : ""}: `);
    stdin.resume();
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

async function askYesNo(rl, prompt, fallback = true) {
  const label = fallback ? "Y/n" : "y/N";
  const value = (await rl.question(`${prompt} [${label}]: `)).trim().toLowerCase();
  if (!value) return fallback;
  return value === "y" || value === "yes";
}

async function completeInteractiveArgs(args) {
  if (!args.interactive) {
    return args;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Radware OpenClaw interactive setup");
    const mode = (
      await askLine(rl, "Deployment type: in-path or out-of-path", "in-path")
    )
      .toLowerCase()
      .replace(/_/g, "-");
    if (["in-path", "inpath", "inline"].includes(mode)) {
      args.inPath = true;
      args.outOfPath = false;
    } else if (["out-of-path", "outpath", "off-path", "offpath"].includes(mode)) {
      args.inPath = false;
      args.outOfPath = true;
    } else {
      throw new Error("Deployment type must be in-path or out-of-path");
    }

    args.configPath = await askLine(rl, "OpenClaw config path", defaultConfigPath());
    const resolvedConfigPath = path.resolve(expandHome(args.configPath));
    args.envFile = await askLine(rl, "Runtime env file", defaultEnvFile(resolvedConfigPath));
    args.writeEnvFile = true;
    args.model = await askLine(rl, "Model", args.model);

    if (args.inPath) {
      args.inPathProvider = normalizeInPathProvider(
        await askLine(
          rl,
          "Radware in-path provider preset: openai or custom",
          args.inPathProvider || DEFAULT_INPATH_PROVIDER,
        ),
      );
      const endpointPrompt =
        args.inPathProvider === "custom"
          ? "Custom Radware in-path endpoint or provider path"
          : "Radware OpenAI in-path endpoint";
      const endpointFallback =
        args.inPathProvider === "custom"
          ? process.env.RADWARE_INPATH_BASE_URL || ""
          : process.env.RADWARE_INPATH_BASE_URL || DEFAULT_INPATH_BASE_URL;
      args.inPathEndpoint = await askLine(rl, endpointPrompt, endpointFallback);
      prepareInPathArgs(args);
      process.env.RADWARE_INPATH_API_KEY = await askSecret(
        "Radware in-path API key",
        process.env.RADWARE_INPATH_API_KEY || "",
      );
      args.setDefaultModel = await askYesNo(rl, "Set Radware as the default OpenClaw model", true);
    } else {
      process.env.RADWARE_OUT_OF_PATH_URL = await askLine(
        rl,
        "Radware out-of-path endpoint",
        process.env.RADWARE_OUT_OF_PATH_URL || DEFAULT_OUTPATH_URL,
      );
      process.env.RADWARE_OUT_OF_PATH_API_KEY = await askSecret(
        "Radware out-of-path API key",
        process.env.RADWARE_OUT_OF_PATH_API_KEY || "",
      );
      args.userIdentifier = await askLine(rl, "Radware portal user identifier", args.userIdentifier);
      args.failMode = await askLine(rl, "Failure mode: fail-close or fail-open", args.failMode);
      if (!["fail-close", "fail-open"].includes(args.failMode)) {
        throw new Error("Failure mode must be fail-close or fail-open");
      }
      args.installPlugin = !args.skipPluginInstall && (await askYesNo(rl, "Install the OpenClaw plugin now", true));
    }

    args.dryRun = !(await askYesNo(rl, "Apply changes now", true));
    return args;
  } finally {
    rl.close();
  }
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function addInPath(config, args) {
  const models = ensureObject(config, "models");
  const providers = ensureObject(models, "providers");
  providers[args.providerName] = {
    baseUrl: "${RADWARE_INPATH_BASE_URL}",
    apiKey: "${RADWARE_INPATH_API_KEY}",
    auth: "api-key",
    api: "openai-completions",
    timeoutSeconds: 180,
    models: [
      {
        id: args.model,
        name: `Radware-proxied ${args.inPathProviderLabel} ${args.model}`,
        api: "openai-completions",
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  };

  if (args.setDefaultModel) {
    const agents = ensureObject(config, "agents");
    const defaults = ensureObject(agents, "defaults");
    defaults.model = { ...(defaults.model || {}), primary: `${args.providerName}/${args.model}` };
  }
}

function addOutOfPath(config, args) {
  const plugins = ensureObject(config, "plugins");
  const entries = ensureObject(plugins, "entries");
  entries["radware-agentic"] = {
    enabled: true,
    hooks: {
      allowConversationAccess: true,
    },
    config: {
      apiKeyEnv: "RADWARE_OUT_OF_PATH_API_KEY",
      endpoint: "${RADWARE_OUT_OF_PATH_URL}",
      model: "${LLM_MODEL}",
      userIdentifier: args.userIdentifier,
      failMode: args.failMode,
      enforcementMode: "portal-decision",
      stages: {
        prompt: true,
        response: true,
        tool: true,
      },
      diagnostics: {
        level: "error",
        logFileEnv: "RADWARE_AGENTIC_DIAGNOSTIC_LOG",
      },
    },
  };
}

async function writeRuntimeEnvFile(args, envFile) {
  const lines = [];
  if (args.inPath) {
    lines.push(
      `RADWARE_INPATH_API_KEY=${quoteEnv(process.env.RADWARE_INPATH_API_KEY || "")}`,
      `RADWARE_INPATH_BASE_URL=${quoteEnv(args.inPathEndpoint || process.env.RADWARE_INPATH_BASE_URL || DEFAULT_INPATH_BASE_URL)}`,
      `LLM_MODEL=${quoteEnv(args.model)}`,
      `RADWARE_INPATH_USER_IDENTIFIER=${quoteEnv(process.env.RADWARE_INPATH_USER_IDENTIFIER || "openclaw-in-path")}`,
    );
  } else {
    lines.push(
      `RADWARE_OUT_OF_PATH_API_KEY=${quoteEnv(process.env.RADWARE_OUT_OF_PATH_API_KEY || "")}`,
      `RADWARE_OUT_OF_PATH_URL=${quoteEnv(process.env.RADWARE_OUT_OF_PATH_URL || DEFAULT_OUTPATH_URL)}`,
      `LLM_MODEL=${quoteEnv(args.model)}`,
      `RADWARE_USER_IDENTIFIER=${quoteEnv(args.userIdentifier)}`,
      `RADWARE_FAIL_MODE=${quoteEnv(args.failMode)}`,
      `RADWARE_AGENTIC_DIAGNOSTIC_LOG=${quoteEnv(process.env.RADWARE_AGENTIC_DIAGNOSTIC_LOG || defaultRuntimeDiagnosticLog(envFile))}`,
    );
  }

  await mkdir(path.dirname(envFile), { recursive: true });
  await writeFile(envFile, `${lines.join("\n")}\n`, { mode: 0o600 });
}

function installPlugin(configPath, diagnostics) {
  diagnostics?.add("plugin_install_started", {
    command: `openclaw plugins install ${PACKAGE_SPEC}`,
    configPath,
  });
  const result = spawnSync("openclaw", ["plugins", "install", PACKAGE_SPEC], {
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCLAW_CONFIG_PATH: configPath,
    },
    shell: process.platform === "win32",
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (stdout) process.stdout.write(redactString(stdout));
  if (stderr) process.stderr.write(redactString(stderr));
  diagnostics?.add("plugin_install_finished", {
    status: result.status,
    stdout: stdout.slice(0, 12000),
    stderr: stderr.slice(0, 12000),
    error: result.error?.message || "",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`OpenClaw plugin install failed with exit code ${result.status}`);
  }
}

function hasRadwareInPathProvider(config) {
  const providers = config?.models?.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return false;
  }
  return Object.values(providers).some((provider) => {
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
      return false;
    }
    return (
      provider.apiKey === "${RADWARE_INPATH_API_KEY}" ||
      provider.baseUrl === "${RADWARE_INPATH_BASE_URL}"
    );
  });
}

function hasRadwareOutOfPathPlugin(config) {
  const entry = config?.plugins?.entries?.["radware-agentic"];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false;
  }
  const pluginConfig = entry.config || {};
  return (
    entry.enabled !== false &&
    (pluginConfig.apiKeyEnv === "RADWARE_OUT_OF_PATH_API_KEY" ||
      pluginConfig.endpoint === "${RADWARE_OUT_OF_PATH_URL}")
  );
}

async function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(
      `OpenClaw config not found: ${configPath}\n` +
        "This setup helper is production-safe by default and expects an existing OpenClaw deployment. " +
        "Run it as the OpenClaw service user, set OPENCLAW_HOME or --config to the existing config path, " +
        "or run OpenClaw onboarding first in a lab environment.",
    );
  }
  const content = await readFile(configPath, "utf8");
  return JSON.parse(content.replace(/^\uFEFF/, ""));
}

function validateExistingConfig(config, configPath, args) {
  if (args.allowUnconfigured) {
    return;
  }
  if (!config.gateway || typeof config.gateway !== "object" || !config.gateway.mode) {
    throw new Error(
      `OpenClaw config at ${configPath} is missing gateway.mode.\n` +
        "This usually means OpenClaw was not onboarded yet, the wrong user/config path was used, " +
        "or the config was created from scratch. For production, run this helper against the existing " +
        "OpenClaw config after OpenClaw has already been configured. For a lab-only fresh install, run " +
        "`openclaw onboard --mode local` first or pass --allow-unconfigured intentionally.",
    );
  }
}

function validateSingleIntegrationPath(config, configPath, args) {
  if (args.inPath && hasRadwareOutOfPathPlugin(config)) {
    throw new Error(
      `OpenClaw config at ${configPath} already contains the Radware out-of-path plugin.\n` +
        "Choose exactly one Radware integration path for this OpenClaw deployment. " +
        "Use a separate OpenClaw environment or remove the out-of-path plugin entry before configuring in-path.",
    );
  }
  if (args.outOfPath && hasRadwareInPathProvider(config)) {
    throw new Error(
      `OpenClaw config at ${configPath} already contains a Radware in-path provider.\n` +
        "Choose exactly one Radware integration path for this OpenClaw deployment. " +
        "Use a separate OpenClaw environment or remove the in-path provider before configuring out-of-path.",
    );
  }
}

async function backupExisting(configPath) {
  if (!existsSync(configPath)) {
    return "";
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${configPath}.bak-${stamp}`;
  await writeFile(backupPath, await readFile(configPath, "utf8"), { mode: 0o600 });
  return backupPath;
}

const diagnostics = new DiagnosticLog();
let configPathForFailure = path.resolve(expandHome(defaultConfigPath()));
let logFileForFailure = "";

try {
  diagnostics.add("start", {
    argv: process.argv.slice(2),
    runtime: runtimeSummary(),
  });
  const args = prepareInPathArgs(await completeInteractiveArgs(parseArgs(process.argv.slice(2))));
  const configPath = path.resolve(expandHome(args.configPath || defaultConfigPath()));
  configPathForFailure = configPath;
  const envFile = path.resolve(expandHome(args.envFile || defaultEnvFile(configPath)));
  const logFile = path.resolve(expandHome(args.logFile || defaultSetupLogFile(configPath)));
  logFileForFailure = logFile;
  diagnostics.add("resolved_inputs", {
    mode: args.inPath ? "in-path" : "out-of-path",
    configPath,
    envFile,
    logFile,
    providerName: args.providerName,
    inPathProvider: args.inPathProvider,
    inPathProviderLabel: args.inPathProviderLabel,
    inPathEndpoint: args.inPathEndpoint,
    model: args.model,
    setDefaultModel: args.setDefaultModel,
    userIdentifier: args.userIdentifier,
    failMode: args.failMode,
    writeEnvFile: args.writeEnvFile,
    installPlugin: args.installPlugin,
    dryRun: args.dryRun,
  });
  const config = await loadConfig(configPath);
  diagnostics.add("config_loaded", {
    hasGatewayMode: Boolean(config?.gateway?.mode),
    hasModels: Boolean(config?.models),
    hasPlugins: Boolean(config?.plugins),
  });
  validateExistingConfig(config, configPath, args);
  validateSingleIntegrationPath(config, configPath, args);
  diagnostics.add("config_validated");

  if (args.inPath) {
    addInPath(config, args);
    diagnostics.add("in_path_config_merged", {
      providerName: args.providerName,
      inPathProvider: args.inPathProvider,
      inPathProviderLabel: args.inPathProviderLabel,
      inPathEndpoint: args.inPathEndpoint,
      model: args.model,
      setDefaultModel: args.setDefaultModel,
    });
  }
  if (args.outOfPath) {
    addOutOfPath(config, args);
    diagnostics.add("out_of_path_config_merged", {
      pluginId: "radware-agentic",
      model: args.model,
      userIdentifier: args.userIdentifier,
      failMode: args.failMode,
      stages: { prompt: true, response: true, tool: true },
    });
  }

  const rendered = `${JSON.stringify(config, null, 2)}\n`;
  if (args.dryRun) {
    console.log(rendered);
    if (args.writeEnvFile) {
      console.log(`Runtime env file would be written: ${envFile}`);
    }
    if (args.logFile) {
      await diagnostics.write(logFile);
      console.log(`Diagnostic log written: ${logFile}`);
    }
    process.exit(0);
  }

  if (args.outOfPath && args.installPlugin) {
    installPlugin(configPath, diagnostics);
  }

  await mkdir(path.dirname(configPath), { recursive: true });
  const backupPath = await backupExisting(configPath);
  diagnostics.add("backup_written", { backupPath });
  const tempPath = `${configPath}.tmp-${process.pid}`;
  await writeFile(tempPath, rendered, { mode: 0o600 });
  await rename(tempPath, configPath);
  diagnostics.add("config_written", { configPath, tempPath });

  console.log(`Updated OpenClaw config: ${configPath}`);
  if (backupPath) {
    console.log(`Backup written: ${backupPath}`);
  }
  if (args.writeEnvFile) {
    await writeRuntimeEnvFile(args, envFile);
    console.log(`Runtime env file written: ${envFile}`);
    diagnostics.add("runtime_env_file_written", {
      envFile,
      includesRuntimeDiagnosticLog: args.outOfPath,
    });
  }
  if (args.logFile) {
    await diagnostics.write(logFile);
    console.log(`Diagnostic log written: ${logFile}`);
  }
  console.log("Next steps:");
  if (args.inPath) {
    console.log(`- Export RADWARE_INPATH_API_KEY and RADWARE_INPATH_BASE_URL=${args.inPathEndpoint || DEFAULT_INPATH_BASE_URL}`);
  }
  if (args.outOfPath) {
    console.log(`- Export RADWARE_OUT_OF_PATH_API_KEY and RADWARE_OUT_OF_PATH_URL=${DEFAULT_OUTPATH_URL}`);
    console.log(`- Install the plugin with: openclaw plugins install ${PACKAGE_SPEC}`);
    console.log("- Keep the customer's existing OpenClaw LLM provider and provider API key configured separately.");
  }
  if (args.writeEnvFile) {
    console.log(`- Load runtime variables before starting OpenClaw: set -a; . ${envFile}; set +a`);
    if (args.outOfPath) {
      console.log(`- Runtime diagnostic log will be written to: ${process.env.RADWARE_AGENTIC_DIAGNOSTIC_LOG || defaultRuntimeDiagnosticLog(envFile)}`);
    }
  }
  console.log("- Restart the OpenClaw gateway and run non-destructive validation through an OpenClaw staging channel or test agent.");
} catch (error) {
  diagnostics.addError(error);
  const fallbackLogFile = logFileForFailure || defaultSetupLogFile(configPathForFailure);
  let writtenLogFile = fallbackLogFile;
  try {
    writtenLogFile = await diagnostics.write(fallbackLogFile);
  } catch (logError) {
    console.error(`Failed to write diagnostic log: ${logError instanceof Error ? logError.message : String(logError)}`);
  }
  printFailure(error, writtenLogFile);
  process.exit(1);
}
