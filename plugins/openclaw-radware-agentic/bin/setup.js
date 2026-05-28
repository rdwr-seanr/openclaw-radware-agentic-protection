#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_INPATH_BASE_URL = "https://api.agentic.radwarecto.com/v1/openai";
const DEFAULT_OUTPATH_URL = "https://api.agentic.radwarecto.com/llmp/digester/agentic-api";

function usage(exitCode = 0) {
  console.log(`Radware OpenClaw setup

Usage:
  radware-openclaw-setup --in-path [--out-of-path] [options]
  radware-openclaw-setup --out-of-path [options]

Controls:
  --in-path                 Add the Radware in-path OpenAI-compatible provider.
  --out-of-path             Add the Radware out-of-path plugin entry.

Options:
  --config <path>           OpenClaw config path. Defaults to OPENCLAW_HOME/.openclaw/openclaw.json or ~/.openclaw/openclaw.json.
  --provider-name <name>    In-path provider name. Default: radware-openai.
  --model <id>              Model id to configure/use. Default: gpt-4o.
  --set-default-model       Set agents.defaults.model.primary to the Radware in-path provider.
  --user-identifier <id>    Out-of-path Radware UserIdentifier. Default: openclaw-out-of-path.
  --fail-mode <mode>        fail-close or fail-open for out-of-path API unavailability. Default: fail-close.
  --dry-run                 Print the merged config without writing.
  --help                    Show this help.

Secrets are not written into the OpenClaw config. The generated config references environment variables:
  RADWARE_INPATH_API_KEY, RADWARE_INPATH_BASE_URL
  RADWARE_OUT_OF_PATH_API_KEY, RADWARE_OUT_OF_PATH_URL
  LLM_MODEL, RADWARE_USER_IDENTIFIER, RADWARE_FAIL_MODE
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    inPath: false,
    outOfPath: false,
    configPath: "",
    providerName: "radware-openai",
    model: process.env.LLM_MODEL || "gpt-4o",
    setDefaultModel: false,
    userIdentifier: process.env.RADWARE_USER_IDENTIFIER || "openclaw-out-of-path",
    failMode: process.env.RADWARE_FAIL_MODE || "fail-close",
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
    throw new Error("Choose at least one control: --in-path and/or --out-of-path");
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
        name: `Radware-proxied OpenAI ${args.model}`,
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
    },
  };
}

async function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    return {};
  }
  const content = await readFile(configPath, "utf8");
  return JSON.parse(content);
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

try {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(expandHome(args.configPath || defaultConfigPath()));
  const config = await loadConfig(configPath);

  if (args.inPath) addInPath(config, args);
  if (args.outOfPath) addOutOfPath(config, args);

  const rendered = `${JSON.stringify(config, null, 2)}\n`;
  if (args.dryRun) {
    console.log(rendered);
    process.exit(0);
  }

  await mkdir(path.dirname(configPath), { recursive: true });
  const backupPath = await backupExisting(configPath);
  const tempPath = `${configPath}.tmp-${process.pid}`;
  await writeFile(tempPath, rendered, { mode: 0o600 });
  await rename(tempPath, configPath);

  console.log(`Updated OpenClaw config: ${configPath}`);
  if (backupPath) {
    console.log(`Backup written: ${backupPath}`);
  }
  console.log("Next steps:");
  if (args.inPath) {
    console.log(`- Export RADWARE_INPATH_API_KEY and RADWARE_INPATH_BASE_URL=${DEFAULT_INPATH_BASE_URL}`);
  }
  if (args.outOfPath) {
    console.log(`- Export RADWARE_OUT_OF_PATH_API_KEY and RADWARE_OUT_OF_PATH_URL=${DEFAULT_OUTPATH_URL}`);
    console.log("- Install the plugin with: openclaw plugins install openclaw-radware-agentic-protection");
  }
  console.log("- Restart the OpenClaw gateway and run the validation commands from the README.");
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  usage(1);
}
