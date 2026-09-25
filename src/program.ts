import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { loadConfig } from "./config.ts";
import { CliError, usage } from "./errors.ts";
import { callOperation } from "./http.ts";
import { findOperation } from "./openapi.ts";

const commandPath = join(dirname(fileURLToPath(import.meta.url)), "../spec/commands.json");

export type CommandSpec = {
  readonly argv: readonly string[];
  readonly operationId: string;
  readonly skill: string;
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  readonly pathParams: readonly string[];
  readonly queryParams: readonly string[];
  readonly headerParams: readonly string[];
  readonly body: "json" | "form" | "bytes" | "none";
};

export type Envelope = {
  readonly ok: boolean;
  readonly command: string;
  readonly status?: number;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
};

type Invocation = {
  readonly positionals: readonly string[];
  readonly query: Record<string, unknown>;
  readonly flags: Readonly<Record<string, string>>;
  readonly bodyText?: string;
  readonly bodyFile?: string;
  readonly baseUrl?: string;
  readonly timeoutMs: number;
  readonly webhookToken?: string;
  readonly signature?: string;
  readonly profile?: string;
};

const STREAM_DEFAULT = new Set([
  "GetDAGRunStepLog",
  "DownloadDAGRunStepLog",
  "GetSubDAGRunStepLog",
  "DownloadSubDAGRunStepLog",
]);

const callHint = "Path parameters are positional. Filters are --query '<json>' or --<name> <value>. Do not invent short flags such as -q.";
const shortCall = "filters: --query JSON or --<name>";

const commands = JSON.parse(readFileSync(commandPath, "utf8")) as CommandSpec[];

const samePrefix = (command: readonly string[], tokens: readonly string[]): boolean =>
  command.every((word, index) => tokens[index] === word);

const longestCommand = (tokens: readonly string[]): CommandSpec | undefined =>
  commands.filter((command) => samePrefix(command.argv, tokens)).sort((left, right) => right.argv.length - left.argv.length)[0];

const usageLine = (command: CommandSpec): string =>
  ["dagu-cli", ...command.argv, ...command.pathParams.map((name) => `<${name}>`)].join(" ");

const help = (tokens: readonly string[]): Envelope => {
  const matched = longestCommand(tokens);
  if (matched && matched.argv.length === tokens.length) {
    return {
      ok: true,
      command: "help",
      result: {
        usage: usageLine(matched),
        summary: matched.summary,
        method: matched.method,
        path: matched.path,
        query: matched.queryParams,
        skill: matched.skill,
        call: shortCall,
        ...(matched.body === "none" ? {} : { body: matched.body }),
        ...(STREAM_DEFAULT.has(matched.operationId) ? { defaults: { stream: false } } : {}),
      },
    };
  }
  const children = commands.filter((command) => samePrefix(tokens, command.argv));
  const groups = new Map<string, CommandSpec[]>();
  for (const command of children) {
    const next = command.argv[tokens.length];
    if (!next) continue;
    const bucket = groups.get(next) ?? [];
    bucket.push(command);
    groups.set(next, bucket);
  }
  const entries = [...groups.entries()].map(([name, bucket]) => {
    const leaf = bucket.find((command) => command.argv.length === tokens.length + 1);
    return leaf
      ? { command: name, usage: usageLine(leaf), summary: leaf.summary }
      : { command: name, usage: `dagu-cli ${[...tokens, name].join(" ")}`, summary: `${bucket.length} commands` };
  });
  if (tokens.length === 0) entries.push({ command: "skills", usage: "dagu-cli skills list", summary: "List or load one layer of the command tree" });
  return {
    ok: true,
    command: "help",
    result: { group: tokens.length ? tokens.join(" ") : "dagu-cli", ...(tokens.length === 0 ? { call: callHint } : { call: shortCall }), commands: entries },
  };
};

const skillText = (name: string): Envelope => {
  const names = [...new Set(commands.map((command) => command.skill))].sort();
  if (name === "list") return { ok: true, command: "skills", result: { skills: names } };
  const selected = commands.filter((command) => command.skill === name);
  if (!selected.length) return { ok: false, command: "skills", error: { code: "USAGE", message: `Unknown skill ${name}.`, retryable: false } };
  return {
    ok: true,
    command: "skills",
    result: {
      skill: name,
      commands: selected.map((command) => ({ usage: usageLine(command), summary: command.summary })),
    },
  };
};

const parseInvocation = (argv: readonly string[]): Effect.Effect<Invocation, CliError> => {
  const positionals: string[] = [];
  const invocation: {
    query?: string;
    flags: Record<string, string>;
    body?: string;
    bodyFile?: string;
    baseUrl?: string;
    timeoutMs: number;
    webhookToken?: string;
    signature?: string;
    profile?: string;
  } = { timeoutMs: 30_000, flags: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    const valued = new Set(["--query", "--body", "--body-file", "--base-url", "--timeout-ms", "--token", "--signature", "--profile"]);
    if (token.startsWith("-") && !token.startsWith("--")) return Effect.fail(usage(`Unknown flag ${token}. ${callHint}`));
    if (!valued.has(token)) {
      if (token.startsWith("--")) {
        const flagValue = argv[index + 1];
        if (!flagValue || flagValue.startsWith("--")) return Effect.fail(usage(`${token} needs a value. ${callHint}`));
        invocation.flags[token.slice(2)] = flagValue;
        index += 1;
        continue;
      }
      positionals.push(token);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) return Effect.fail(usage(`${token} needs a value.`));
    index += 1;
    if (token === "--query") invocation.query = value;
    else if (token === "--body") invocation.body = value;
    else if (token === "--body-file") invocation.bodyFile = value;
    else if (token === "--base-url") invocation.baseUrl = value;
    else if (token === "--timeout-ms") invocation.timeoutMs = Number(value);
    else if (token === "--token") invocation.webhookToken = value;
    else if (token === "--signature") invocation.signature = value;
    else invocation.profile = value;
  }
  return Effect.gen(function* () {
    if (!Number.isInteger(invocation.timeoutMs) || invocation.timeoutMs < 1) return yield* Effect.fail(usage("--timeout-ms must be a positive integer."));
    const query = invocation.query ? yield* jsonObject(invocation.query, "--query") : {};
    return {
      positionals,
      query,
      flags: invocation.flags,
      bodyText: invocation.body,
      bodyFile: invocation.bodyFile,
      baseUrl: invocation.baseUrl,
      timeoutMs: invocation.timeoutMs,
      webhookToken: invocation.webhookToken,
      signature: invocation.signature,
      profile: invocation.profile,
    };
  });
};

const coerceFlag = (value: string): unknown => {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
};

const jsonObject = (value: string, flag: string): Effect.Effect<Record<string, unknown>, CliError> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(value) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      return parsed as Record<string, unknown>;
    },
    catch: () => usage(`${flag} must be a JSON object.`),
  });

const readBody = (invocation: Invocation, command: CommandSpec): Effect.Effect<unknown, CliError> => {
  if (command.body === "bytes") {
    if (!invocation.bodyFile) return Effect.fail(usage(`${usageLine(command)} requires --body-file.`));
    return Effect.tryPromise({
      try: async () => new Uint8Array(await readFile(invocation.bodyFile!)),
      catch: () => usage(`Cannot read ${invocation.bodyFile}.`),
    });
  }
  if (invocation.bodyFile) {
    return Effect.tryPromise({
      try: async () => JSON.parse(await readFile(invocation.bodyFile!, "utf8")) as unknown,
      catch: () => usage(`Cannot read JSON from ${invocation.bodyFile}.`),
    });
  }
  if (invocation.bodyText) {
    return Effect.try({ try: () => JSON.parse(invocation.bodyText!) as unknown, catch: () => usage("--body must be JSON.") });
  }
  if (command.body === "json" || command.body === "form") return Effect.succeed(undefined);
  return Effect.succeed(undefined);
};

export const run = (argv: readonly string[]): Effect.Effect<Envelope, CliError> =>
  Effect.gen(function* () {
    if (argv.length === 0 || argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
      return help(argv.filter((token) => token !== "--help" && token !== "-h" && token !== "help"));
    }
    if (argv[0] === "skills") {
      const action = argv[1] ?? "list";
      if (action === "list") return skillText("list");
      if (action !== "get" || !argv[2]) return yield* Effect.fail(usage("Usage: dagu-cli skills list | dagu-cli skills get <name>"));
      return skillText(argv[2]);
    }
    const invocation = yield* parseInvocation(argv);
    const command = longestCommand(invocation.positionals);
    if (!command) {
      const group = commands.some((item) => item.argv.length > invocation.positionals.length && invocation.positionals.every((token, index) => item.argv[index] === token));
      if (group) return help(invocation.positionals);
      return yield* Effect.fail(usage(`Unknown command ${invocation.positionals.join(" ") || "(empty)"}. Run: dagu-cli --help`));
    }
    const args = invocation.positionals.slice(command.argv.length);
    if (args.length === 0 && command.pathParams.length > 0) return help(command.argv);
    if (args.length !== command.pathParams.length) return yield* Effect.fail(usage(`Usage: ${usageLine(command)}`));
    const path: Record<string, string> = {};
    command.pathParams.forEach((name, index) => {
      const value = args[index];
      if (value) path[name] = value;
    });
    const query: Record<string, unknown> = { ...invocation.query };
    for (const [name, value] of Object.entries(invocation.flags)) {
      if (!command.queryParams.includes(name)) {
        const names = command.queryParams.map((item) => `--${item}`).join(", ");
        return yield* Effect.fail(usage(`Unknown flag --${name}. ${callHint} Accepted filters: ${names || "none"}.`));
      }
      query[name] = coerceFlag(value);
    }
    if (STREAM_DEFAULT.has(command.operationId) && query.stream === undefined) query.stream = false;
    const body = yield* readBody(invocation, command);
    const headers: Record<string, string> = {};
    if (command.operationId === "TriggerWebhook") {
      if (!invocation.webhookToken) return yield* Effect.fail(usage("webhook trigger requires --token."));
      headers.authorization = `Bearer ${invocation.webhookToken}`;
      if (invocation.signature) headers["x-dagu-signature"] = invocation.signature;
      if (invocation.profile) headers["x-dagu-profile"] = invocation.profile;
    }
    const config = command.operationId === "TriggerWebhook" && invocation.webhookToken
      ? { baseUrl: invocation.baseUrl ?? process.env.DAGU_BASE_URL ?? "http://127.0.0.1:8080", apiKey: undefined }
      : yield* loadConfig({ baseUrl: invocation.baseUrl });
    const operation = yield* findOperation(command.operationId);
    const response = yield* callOperation({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      operation,
      path,
      query,
      body,
      bodyKind: command.body,
      headers,
      timeoutMs: invocation.timeoutMs,
    });
    const result = { command: command.argv.join(" "), operationId: command.operationId, method: command.method, path: command.path, body: response.body };
    if (response.status >= 400) {
      return { ok: false, command: command.argv.join(" "), status: response.status, result, error: { code: `HTTP_${response.status}`, message: `Dagu returned HTTP ${response.status}.`, retryable: response.status === 429 || response.status >= 500 } };
    }
    return { ok: true, command: command.argv.join(" "), status: response.status, result };
  });

export const toEnvelope = (error: CliError, command = "dagu-cli"): Envelope => ({
  ok: false,
  command,
  ...(error.status ? { status: error.status } : {}),
  error: { code: error.code, message: error.message, retryable: error.retryable },
});
