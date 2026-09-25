import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.ts";
import { CliError, usage } from "./errors.ts";
import { callOperation } from "./http.ts";
import { findOperation, operations, type Operation } from "./openapi.ts";

export type Envelope = {
  readonly ok: boolean;
  readonly command: string;
  readonly status?: number;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
};

type Flags = {
  readonly command: string;
  readonly operationId?: string;
  readonly tag?: string;
  readonly baseUrl?: string;
  readonly path: Record<string, string>;
  readonly query: Record<string, unknown>;
  readonly body?: unknown;
  readonly timeoutMs: number;
};

const parseJsonObject = (value: string, flag: string): Effect.Effect<Record<string, unknown>, CliError> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(value) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      return parsed as Record<string, unknown>;
    },
    catch: () => usage(`${flag} must be a JSON object.`),
  });

const parseArgs = (argv: readonly string[]): Effect.Effect<Flags, CliError> => {
  const flags: {
    command: string;
    operationId?: string;
    tag?: string;
    baseUrl?: string;
    path?: string;
    query?: string;
    body?: string;
    bodyFile?: string;
    timeoutMs: number;
  } = { command: argv[0] ?? "help", timeoutMs: 30_000 };
  const rest = argv.slice(1);
  const take = (index: number, name: string): string | CliError => {
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) return usage(`${name} needs a value.`);
    return next;
  };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;
    if (["--tag", "--base-url", "--path", "--query", "--body", "--body-file", "--timeout-ms"].includes(token)) {
      const value = take(index, token);
      if (value instanceof CliError) return Effect.fail(value);
      index += 1;
      if (token === "--tag") flags.tag = value;
      else if (token === "--base-url") flags.baseUrl = value;
      else if (token === "--path") flags.path = value;
      else if (token === "--query") flags.query = value;
      else if (token === "--body") flags.body = value;
      else if (token === "--body-file") flags.bodyFile = value;
      else flags.timeoutMs = Number(value);
    } else if (token === "--help" || token === "-h") flags.command = "help";
    else if (token.startsWith("--")) return Effect.fail(usage(`Unknown flag ${token}.`));
    else if (!flags.operationId) flags.operationId = token;
    else return Effect.fail(usage(`Unexpected argument ${token}.`));
  }
  return Effect.gen(function* () {
    if (!Number.isInteger(flags.timeoutMs) || flags.timeoutMs < 1) return yield* Effect.fail(usage("--timeout-ms must be a positive integer."));
    const path = flags.path ? yield* parseJsonObject(flags.path, "--path") : {};
    const query = flags.query ? yield* parseJsonObject(flags.query, "--query") : {};
    const pathValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(path)) {
      if (typeof value !== "string" && typeof value !== "number") return yield* Effect.fail(usage(`Path parameter ${key} must be a string or number.`));
      pathValues[key] = String(value);
    }
    const body = flags.bodyFile
      ? yield* Effect.tryPromise({
          try: async () => JSON.parse(await readFile(flags.bodyFile!, "utf8")) as unknown,
          catch: () => usage(`Cannot read JSON from ${flags.bodyFile}.`),
        })
      : flags.body
        ? yield* Effect.try({
            try: () => JSON.parse(flags.body!) as unknown,
            catch: () => usage("--body must be JSON."),
          })
        : undefined;
    return { command: flags.command, operationId: flags.operationId, tag: flags.tag, baseUrl: flags.baseUrl, path: pathValues, query, body, timeoutMs: flags.timeoutMs };
  });
};

const publicOperation = (operation: Operation) => ({
  operationId: operation.operationId,
  method: operation.method,
  path: operation.path,
  tag: operation.tag,
  summary: operation.summary,
  parameters: operation.parameters.map((parameter) => ({ name: parameter.name, in: parameter.location, required: parameter.required })),
  bodyProperties: operation.bodyProperties,
  bodyRequired: operation.bodyRequired,
});

export const run = (argv: readonly string[]): Effect.Effect<Envelope, CliError> =>
  Effect.gen(function* () {
    const flags = yield* parseArgs(argv);
    if (flags.command === "help" || flags.command === undefined) {
      return { ok: true, command: "help", result: { usage: "dagu-cli operations | describe <operationId> | call <operationId> [--path JSON] [--query JSON] [--body JSON]" } };
    }
    if (flags.command === "operations") {
      const all = yield* operations;
      const selected = flags.tag ? all.filter((operation) => operation.tag === flags.tag) : all;
      return { ok: true, command: "operations", result: { count: selected.length, operations: selected.map(publicOperation) } };
    }
    if (!flags.operationId) return yield* Effect.fail(usage(`${flags.command} requires an operationId.`));
    const operation = yield* findOperation(flags.operationId);
    if (flags.command === "describe") return { ok: true, command: "describe", result: publicOperation(operation) };
    if (flags.command !== "call") return yield* Effect.fail(usage(`Unknown command ${flags.command}.`));
    for (const parameter of operation.parameters) {
      if (parameter.location === "path" && flags.path[parameter.name] === undefined) {
        return yield* Effect.fail(usage(`Missing path parameter ${parameter.name}.`));
      }
    }
    if (operation.bodyRequired && flags.body === undefined) return yield* Effect.fail(usage(`${operation.operationId} requires --body.`));
    const config = yield* loadConfig({ baseUrl: flags.baseUrl });
    const response = yield* callOperation({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      operation,
      path: flags.path,
      query: flags.query,
      body: flags.body,
      timeoutMs: flags.timeoutMs,
    });
    const result = { operationId: operation.operationId, method: operation.method, path: operation.path, body: response.body };
    if (response.status >= 400) {
      return {
        ok: false,
        command: "call",
        status: response.status,
        result,
        error: {
          code: `HTTP_${response.status}`,
          message: `Dagu returned HTTP ${response.status}.`,
          retryable: response.status === 429 || response.status >= 500,
        },
      };
    }
    return { ok: true, command: "call", status: response.status, result };
  });

export const toEnvelope = (error: CliError, command = "dagu-cli"): Envelope => ({
  ok: false,
  command,
  ...(error.status ? { status: error.status } : {}),
  error: { code: error.code, message: error.message, retryable: error.retryable },
});
