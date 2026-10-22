/** Supported Bun/TypeScript package surface. No CLI entrypoint or process mutation. */
import { Effect } from "effect";
import { execContexts, type ContextExecEnvelope } from "./context-exec.ts";
import { contextsPath, readContexts, selectContexts, type Context } from "./contexts.ts";
import { CliError, configError, usage } from "./errors.ts";
import { prepareContextApi } from "./program.ts";

export { contextsPath, readContexts, selectContexts, labelPairs } from "./contexts.ts";
export type { Context, ContextsFile } from "./contexts.ts";
export { CliError } from "./errors.ts";
export type { ContextExecEntry, ContextExecReport, ContextExecEnvelope } from "./context-exec.ts";
export type { Envelope } from "./program.ts";

/** Read stored metadata only, never resolve credentials. Config errors reject with CliError. */
export const readContext = async (name: string, file: string = contextsPath()): Promise<Context> => {
  const stored = await readContexts(file);
  if (!Object.hasOwn(stored.contexts, name)) throw configError("Context does not exist.");
  return stored.contexts[name]!;
};

export type ExecuteContextsOptions = {
  readonly selector: Readonly<Record<string, string>>;
  /** Catalog REST leaf command and arguments, e.g. ["dag", "list", "--perPage", "2"]. */
  readonly command: readonly string[];
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  /** Explicit owner-private config path; relative key files resolve against this file. */
  readonly configFile?: string;
};

/**
 * Same bounded execution as context exec, without argv parsing by the caller.
 * Per-target failures are returned; global usage/config failures reject with CliError.
 * Never changes process.env, process.exitCode, config, or the current context.
 * No retries. Mutating commands require authorization on every selected target.
 */
export const executeContexts = (options: ExecuteContextsOptions): Promise<ContextExecEnvelope> => {
  if (!options || typeof options.selector !== "object" || options.selector === null || Array.isArray(options.selector) ||
      Object.values(options.selector).some((value) => typeof value !== "string") ||
      !Array.isArray(options.command) || options.command.length === 0 || options.command.some((item) => typeof item !== "string")) {
    return Promise.reject(usage("executeContexts requires a string-valued selector and a non-empty command array."));
  }
  try { selectContexts({ currentContext: null, contexts: {} }, options.selector); }
  catch (error) { return Promise.reject(error); }
  const args = Object.entries(options.selector).flatMap(([key, value]) => ["--selector", `${key}=${value}`]);
  if (options.concurrency !== undefined) args.push("--concurrency", String(options.concurrency));
  if (options.timeoutMs !== undefined) args.push("--timeout-ms", String(options.timeoutMs));
  args.push("--", ...options.command);
  const effect = execContexts(args, prepareContextApi, options.configFile);
  // Settle inside the runtime so Promise consumers receive the documented CliError,
  // not an Effect runtime wrapper. No swallowed defects or error-as-success result.
  return Effect.runPromise(effect.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
  )).then((outcome) => {
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  });
};
